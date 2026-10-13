/**
 * ETL tse_eleitos → BANCO DE PERFIL (Fase 3 do plano do pipe por alçada).
 *
 * Baixa o CSV nacional de candidatos do TSE (cdn.tse.jus.br — outro host, que
 * não bloqueia como o DivulgaCand), guarda eleitos e suplentes das casas
 * legislativas e grava em `tse_eleitos` no Banco de Perfil. O Banco Principal
 * passou do limite de espaço e não recebe tabela nova (regra de 06/10/2026).
 *
 * Pré-requisito: rodar scripts/sql/migracao_perfil_tse_eleitos.sql no Banco de Perfil.
 *
 * Uso:
 *   npm run sync:tse-eleitos                 (chapas presidenciais 2002–2018, senadores 2018, 2022 e 2024)
 *   npm run sync:tse-eleitos -- --ano 2024
 *   npm run sync:tse-eleitos -- --ano 2024 --seco   (lê e conta, sem gravar)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import dotenv from "dotenv";
import { credenciaisBancoPerfil } from "./banco-perfil";
import {
	ASSEMBLEIAS_COM_LISTA,
	type BancoGravacao,
	CICLOS,
	chapaEleita,
	exercicioPelaAssembleia,
	deduplicar,
	completarCpfPeloTitulo,
	type CpfAnterior,
	type EleitoNaBase,
	type IdentificacaoEleitoral,
	identificacaoDaLinha,
	LIMITE_SAIDA,
	linhasQueMudaram,
	quemSaiu,
	registrarCpfAnterior,
	gravarLinhas,
	type LinhaEleito,
	linhaParaEleito,
	montarMapaIbge,
} from "./tse-eleitos";
import { downloadZipComCurl, extrairArquivoZip } from "./tse-arquivos";

dotenv.config({ path: ".env.local" });

const TEMP_DIR = path.join(process.cwd(), ".tmp_tse");
const LOTE = 1000;
/** Mínimos por ciclo: abaixo disso algo deu errado no arquivo (não grava pela metade). */
const MINIMOS: Record<number, number> = { 2018: 40, 2022: 1_500, 2024: 50_000 };

async function mapaIbge(eleicaoMunicipal?: string): Promise<Map<string, string>> {
	if (!eleicaoMunicipal) return new Map();
	const padded = eleicaoMunicipal.padStart(6, "0");
	const url = `https://resultados.tse.jus.br/oficial/ele2024/${eleicaoMunicipal}/config/mun-e${padded}-cm.json`;
	const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
	if (!res.ok) throw new Error(`Mapa TSE↔IBGE: HTTP ${res.status}`);
	return montarMapaIbge(await res.json());
}

/** Percorre o CSV nacional (latin1, `;`) e apaga o extraído; fica só o ZIP em .tmp_tse/ (cache). */
async function percorrerCsv(arquivo: string, aoLer: (r: Record<string, string>) => void): Promise<void> {
	const parser = fs.createReadStream(arquivo, "latin1").pipe(
		parse({ columns: true, delimiter: ";", skip_empty_lines: true, relax_quotes: true, relax_column_count: true }),
	);
	try {
		for await (const r of parser) aoLer(r as Record<string, string>);
	} finally {
		fs.rmSync(arquivo, { force: true });
	}
}

async function csvDoAno(ano: number): Promise<string> {
	fs.mkdirSync(TEMP_DIR, { recursive: true });
	const zip = path.join(TEMP_DIR, `consulta_cand_${ano}.zip`);
	await downloadZipComCurl(`https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`, zip);
	return extrairArquivoZip(zip, new RegExp(`consulta_cand_${ano}_BRASIL\\.csv$`, "i"), TEMP_DIR);
}

/** Candidato a deputado estadual numa UF com lista da assembleia (qualquer situação no TSE). */
function candidatoDeAssembleia(r: Record<string, string>, ano: number, mapa: Map<string, string>): LinhaEleito | null {
	if (String(r.CD_CARGO) !== "7" || !ASSEMBLEIAS_COM_LISTA[String(r.SG_UF)]) return null;
	return linhaParaEleito(r, ano, mapa, true);
}

async function lerCsv(arquivo: string, ciclo: (typeof CICLOS)[number], mapa: Map<string, string>) {
	const linhas: { linha: LinhaEleito; turno: number }[] = [];
	const deAssembleia: { linha: LinhaEleito; turno: number }[] = [];
	const idPorSq = new Map<string, IdentificacaoEleitoral>();
	await percorrerCsv(arquivo, (r) => {
		const turno = Number(r.NR_TURNO) || 1;
		const candidato = ciclo.assembleias ? candidatoDeAssembleia(r, ciclo.ano, mapa) : null;
		if (candidato) deAssembleia.push({ linha: candidato, turno });
		if (ciclo.cargos && !ciclo.cargos.includes(String(r.CD_CARGO))) return;
		const linha = linhaParaEleito(r, ciclo.ano, mapa) ?? chapaEleita(r, ciclo.ano, mapa);
		if (!linha) return;
		linhas.push({ linha, turno });
		const id = identificacaoDaLinha(r);
		if (id) idPorSq.set(linha.sq_candidato, id);
	});
	return { linhas: deduplicar(linhas), idPorSq, deAssembleia: deduplicar(deAssembleia) };
}

/**
 * Quem exerceu mandato pela lista da assembleia e o TSE não tem como eleito (cassado ou suplente
 * que assumiu): entra com o CPF do arquivo, se o nome civil completo bater com um só candidato.
 */
async function exercicioNasAssembleias(banco: SupabaseClient, ciclo: (typeof CICLOS)[number], linhas: LinhaEleito[], candidatos: LinhaEleito[]): Promise<LinhaEleito[]> {
	if (!ciclo.assembleias) return linhas;
	const porSq = new Map(linhas.map((l) => [l.sq_candidato, l]));
	for (const [uf, casa] of Object.entries(ASSEMBLEIAS_COM_LISTA)) {
		const { data, error } = await banco.from(`${casa.toLowerCase()}_deputados`).select("deputado,ultimo_ano").gt("ultimo_ano", ciclo.ano);
		if (error) throw new Error(`[TSE ELEITOS ${ciclo.ano}] Lista da ${casa}: ${error.message}`);
		const nomes = (data ?? []).map((d) => String(d.deputado));
		const achados = exercicioPelaAssembleia(candidatos.filter((c) => c.sg_uf === uf), nomes, casa);
		for (const a of achados) {
			porSq.set(a.sq_candidato, a);
			console.log(`[TSE ELEITOS ${ciclo.ano}] ${a.nm_candidato} (${casa}): ${a.ds_sit_tot_turno}.`);
		}
	}
	return [...porSq.values()];
}

/**
 * CPF escondido (2024): o das candidaturas anteriores com o mesmo título + nascimento.
 * Lê só os títulos que interessam, da eleição mais recente à mais antiga.
 */
async function completarCpfDeAnteriores(ciclo: (typeof CICLOS)[number], linhas: LinhaEleito[], idPorSq: Map<string, IdentificacaoEleitoral>): Promise<void> {
	if (!ciclo.cpfPeloTituloDe) return;
	const semCpf = linhas.filter((l) => !l.nr_cpf_candidato);
	const titulos = new Set(semCpf.flatMap((l) => (idPorSq.get(l.sq_candidato) ? [idPorSq.get(l.sq_candidato)!.titulo] : [])));
	const anteriores = new Map<string, CpfAnterior>();
	for (const ano of ciclo.cpfPeloTituloDe) {
		await percorrerCsv(await csvDoAno(ano), (r) => registrarCpfAnterior(anteriores, r, titulos, ano));
		console.log(`[TSE ELEITOS ${ciclo.ano}] ${anteriores.size} título(s) com CPF até ${ano}.`);
	}
	const n = completarCpfPeloTitulo(linhas, idPorSq, anteriores);
	console.log(`[TSE ELEITOS ${ciclo.ano}] CPF completado em ${n} de ${semCpf.length} eleitos sem CPF (mesmo título e nascimento numa candidatura anterior).`);
}

function bancoPerfil(): SupabaseClient {
	const { url, key } = credenciaisBancoPerfil();
	return createClient(url, key, { auth: { persistSession: false } });
}

async function lerCiclo(banco: SupabaseClient, ciclo: (typeof CICLOS)[number]): Promise<EleitoNaBase[]> {
	const todos: EleitoNaBase[] = [];
	for (let de = 0; ; de += LOTE) {
		let consulta = banco.from("tse_eleitos").select("sq_candidato,nm_candidato,ds_cargo,sg_uf,nr_cpf_candidato,ds_sit_tot_turno,cpf_fonte").eq("ano_eleicao", ciclo.ano);
		if (ciclo.cargos) consulta = consulta.in("cd_cargo", ciclo.cargos);
		const { data, error } = await consulta.order("sq_candidato").range(de, de + LOTE - 1);
		if (error) throw new Error(`[TSE ELEITOS ${ciclo.ano}] Leitura da base: ${error.message}`);
		todos.push(...((data ?? []) as EleitoNaBase[]));
		if (!data || data.length < LOTE) return todos;
	}
}

/** Tira quem saiu do arquivo do TSE (cada nome vai ao log, que é a cópia do que sai). */
async function removerQuemSaiu(banco: SupabaseClient, ciclo: (typeof CICLOS)[number], naBase: EleitoNaBase[], linhas: LinhaEleito[]): Promise<void> {
	const sairam = quemSaiu(naBase, linhas);
	if (sairam === null) {
		console.warn(`[TSE ELEITOS ${ciclo.ano}] Mais de ${LIMITE_SAIDA * 100}% dos eleitos sumiriam do arquivo: nada apagado (confira o arquivo do TSE).`);
		return;
	}
	for (const e of sairam) console.log(`[TSE ELEITOS ${ciclo.ano}] Saiu do arquivo do TSE: ${e.nm_candidato} (${e.ds_cargo ?? "?"}, ${e.sg_uf}, sq ${e.sq_candidato})`);
	for (let i = 0; i < sairam.length; i += LOTE) {
		const lote = sairam.slice(i, i + LOTE).map((e) => e.sq_candidato);
		const { error } = await banco.from("tse_eleitos").delete().eq("ano_eleicao", ciclo.ano).in("sq_candidato", lote);
		if (error) throw new Error(`[TSE ELEITOS ${ciclo.ano}] Remoção falhou: ${error.message}`);
	}
	console.log(`[TSE ELEITOS ${ciclo.ano}] ${sairam.length} registro(s) que saíram do arquivo do TSE removido(s).`);
}

async function gravar(ciclo: (typeof CICLOS)[number], linhas: LinhaEleito[]) {
	const banco = bancoPerfil();
	const naBase = await lerCiclo(banco, ciclo);
	const mudaram = linhasQueMudaram(linhas, naBase);
	console.log(`[TSE ELEITOS ${ciclo.ano}] ${mudaram.length} de ${linhas.length} registro(s) novos ou alterados para gravar.`);
	await gravarLinhas(banco as unknown as BancoGravacao, mudaram, LOTE);
	await removerQuemSaiu(banco, ciclo, naBase, linhas);
}

async function sincronizarCiclo(ciclo: (typeof CICLOS)[number], seco: boolean): Promise<number> {
	const lido = await lerCsv(await csvDoAno(ciclo.ano), ciclo, await mapaIbge(ciclo.eleicaoMunicipal));
	const { idPorSq } = lido;
	const linhas = await exercicioNasAssembleias(bancoPerfil(), ciclo, lido.linhas, lido.deAssembleia);
	await completarCpfDeAnteriores(ciclo, linhas, idPorSq);
	const minimo = MINIMOS[ciclo.ano] ?? 1;
	if (linhas.length < minimo) {
		throw new Error(`[TSE ELEITOS ${ciclo.ano}] ${linhas.length} registros, abaixo do mínimo ${minimo}: nada gravado.`);
	}
	if (!seco) await gravar(ciclo, linhas);
	const comCpf = linhas.filter((l) => l.nr_cpf_candidato).length;
	console.log(`[TSE ELEITOS ${ciclo.ano}] ${linhas.length} registros ${seco ? "lidos (modo seco, nada gravado)" : "gravados"} (${comCpf} com CPF válido).`);
	if (seco) console.log(JSON.stringify(linhas.slice(0, 2)));
	return linhas.length;
}

async function main() {
	const i = process.argv.indexOf("--ano");
	const ano = i >= 0 ? Number(process.argv[i + 1]) : null;
	const ciclos = ano ? CICLOS.filter((c) => c.ano === ano) : CICLOS;
	if (ciclos.length === 0) throw new Error(`Ano ${ano} não configurado em CICLOS.`);
	let total = 0;
	const seco = process.argv.includes("--seco");
	for (const ciclo of ciclos) total += await sincronizarCiclo(ciclo, seco);
	console.log(`[TSE ELEITOS] Concluído: ${total} registros ${seco ? "lidos (nada gravado)" : "no Banco de Perfil"}.`);
}

main().catch((e) => {
	console.error(e?.message || e);
	process.exit(1);
});
