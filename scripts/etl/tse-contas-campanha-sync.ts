/**
 * ETL contas de campanha → tse_campanha_contas no BANCO DE PERFIL (Fase 3, nota 31 §3.6).
 *
 * POR PADRÃO SÓ MEDE (modo seco): lê os CSVs do TSE, filtra os eleitos, agrega
 * e mostra quantas linhas e quantos MB ficariam. Só grava com `--gravar`
 * (regra de 06/10/2026: nada vai para banco de produção sem ordem do usuário).
 *
 * Pré-requisito para gravar: scripts/sql/migracao_perfil_tse_campanha.sql no Banco de Perfil.
 *
 * Uso:
 *   npm run sync:tse-campanha -- --ano 2022            (mede)
 *   npm run sync:tse-campanha -- --ano 2022 --gravar   (grava; só com autorização)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import dotenv from "dotenv";
import { credenciaisBancoPerfil } from "./banco-perfil";
import { naJanela } from "../../src/lib/janela-mandato";
import {
	AgregadorContas,
	despesaParaRegistro,
	estimarMb,
	type LinhaConta,
	receitaParaRegistro,
} from "./tse-contas-campanha";
import { downloadZipComCurl, extrairArquivoZip } from "./tse-arquivos";

dotenv.config({ path: ".env.local" });

const TEMP_DIR = path.join(process.cwd(), ".tmp_tse");
const LOTE = 1000;
/**
 * 2018: senadores eleitos em 2018 (em mandato até 2027) e a chapa presidencial. 2026: os eleitos
 * entram sozinhos depois da posse (antes disso a janela de mandato não os inclui).
 */
const ANOS = [2018, 2022, 2024, 2026];

/**
 * Lê o CSV extraído e APAGA o arquivo no fim: os CSVs do TSE passam de 2,5 GB.
 * Fica só o ZIP em .tmp_tse/ (cache local, pode ser apagado; o CDN do TSE é
 * público e não bloqueia, então o ETL baixa de novo quando precisar).
 */
async function* linhasCsv(arquivo: string): AsyncGenerator<Record<string, string>> {
	const parser = fs.createReadStream(arquivo, "latin1").pipe(
		parse({ columns: true, delimiter: ";", skip_empty_lines: true, relax_quotes: true, relax_column_count: true }),
	);
	try {
		for await (const r of parser) yield r;
	} finally {
		fs.rmSync(arquivo, { force: true });
	}
}

async function arquivoDoZip(url: string, nomeZip: string, padrao: RegExp): Promise<string> {
	fs.mkdirSync(TEMP_DIR, { recursive: true });
	const zip = path.join(TEMP_DIR, nomeZip);
	await downloadZipComCurl(url, zip);
	return extrairArquivoZip(zip, padrao, TEMP_DIR);
}

function bancoPerfil() {
	const { url, key } = credenciaisBancoPerfil();
	return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * sq_candidato de quem está na janela de mandato nesse ano, pela base tse_eleitos (12/10/2026):
 * em 2018 só os senadores e a chapa presidencial; em 2022 também quem exerceu mandato pela
 * assembleia (cassado ou suplente que assumiu). Suplente que não assumiu fica fora.
 */
async function eleitosDoAno(ano: number): Promise<Set<string>> {
	const banco = bancoPerfil();
	const sqs = new Set<string>();
	for (let de = 0; ; de += LOTE) {
		const { data, error } = await banco.from("tse_eleitos").select("sq_candidato,cd_cargo").eq("ano_eleicao", ano).neq("ds_sit_tot_turno", "SUPLENTE").order("id").range(de, de + LOTE - 1);
		if (error) throw new Error(`[TSE CAMPANHA ${ano}] Leitura de tse_eleitos: ${error.message}`);
		for (const e of data ?? []) if (naJanela(Number(e.cd_cargo), ano)) sqs.add(String(e.sq_candidato));
		if (!data || data.length < LOTE) return sqs;
	}
}

async function agregar(ano: number, eleitos: Set<string>): Promise<AgregadorContas> {
	const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${ano}.zip`;
	const zip = `prestacao_contas_${ano}.zip`;
	const ag = new AgregadorContas(ano, eleitos);
	const receitas = await arquivoDoZip(url, zip, new RegExp(`^receitas_candidatos_${ano}_BRASIL\\.csv$`, "i"));
	for await (const r of linhasCsv(receitas)) ag.adicionar("DOADOR", receitaParaRegistro(r));
	const despesas = await arquivoDoZip(url, zip, new RegExp(`^despesas_contratadas_candidatos_${ano}_BRASIL\\.csv$`, "i"));
	for await (const r of linhasCsv(despesas)) ag.adicionar("FORNECEDOR", despesaParaRegistro(r));
	return ag;
}

function relatorio(ano: number, linhas: LinhaConta[], descartados: number): string {
	const conta = (f: (l: LinhaConta) => boolean) => linhas.filter(f).length;
	return [
		`[TSE CAMPANHA ${ano}] ${linhas.length} linhas agregadas (~${estimarMb(linhas)} MB estimados no banco).`,
		`  DOADOR: ${conta((l) => l.tipo === "DOADOR")} (CPF ${conta((l) => l.tipo === "DOADOR" && l.documento.length === 11)}, CNPJ ${conta((l) => l.tipo === "DOADOR" && l.documento.length === 14)})`,
		`  FORNECEDOR: ${conta((l) => l.tipo === "FORNECEDOR")} (CNPJ ${conta((l) => l.tipo === "FORNECEDOR" && l.documento.length === 14)}, CPF ${conta((l) => l.tipo === "FORNECEDOR" && l.documento.length === 11)})`,
		`  Registros de não eleitos descartados: ${descartados}`,
	].join("\n");
}

/**
 * Só insere o que falta (ON CONFLICT DO NOTHING): as contas de eleições passadas não mudam, e
 * regravar as 450 mil linhas deixava dezenas de MB de linhas mortas no Banco de Perfil.
 */
async function gravar(linhas: LinhaConta[]) {
	const banco = bancoPerfil();
	for (let i = 0; i < linhas.length; i += LOTE) {
		const { error } = await banco
			.from("tse_campanha_contas")
			.upsert(linhas.slice(i, i + LOTE), { onConflict: "sq_candidato,ano_eleicao,tipo,documento", ignoreDuplicates: true });
		if (error) throw new Error(`[TSE CAMPANHA] upsert falhou: ${error.message} — a migração scripts/sql/migracao_perfil_tse_campanha.sql foi rodada?`);
	}
}

async function main() {
	const i = process.argv.indexOf("--ano");
	const anos = i >= 0 ? [Number(process.argv[i + 1])] : ANOS;
	const gravarNoBanco = process.argv.includes("--gravar");
	for (const ano of anos) {
		const eleitos = await eleitosDoAno(ano);
		console.log(`[TSE CAMPANHA ${ano}] ${eleitos.size} eleitos no filtro.`);
		// Eleitos de 2026 antes da posse: ninguém na janela ainda, nada a baixar.
		if (eleitos.size === 0) continue;
		const ag = await agregar(ano, eleitos);
		const linhas = ag.linhas();
		console.log(relatorio(ano, linhas, ag.descartadosNaoEleitos));
		if (gravarNoBanco) {
			await gravar(linhas);
			console.log(`[TSE CAMPANHA ${ano}] gravado no Banco de Perfil.`);
		} else {
			console.log(`[TSE CAMPANHA ${ano}] modo seco: nada gravado (use --gravar só com autorização).`);
		}
	}
}

main().catch((e) => {
	console.error(e?.message || e);
	process.exit(1);
});
