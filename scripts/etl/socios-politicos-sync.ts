/**
 * ETL socios_politicos → BANCO DE PERFIL.
 *
 * Empresas em que um eleito (tse_eleitos com CPF) é sócio, pelo arquivo aberto de CNPJ
 * da Receita: nome completo igual ao do QSA + 6 dígitos do meio do CPF (regras em
 * ./socios-politicos.ts). A investigação usa a tabela para achar o CNPJ das empresas
 * declaradas ao TSE (ex.: a Bolsotini Chocolates e Café do senador Flávio Bolsonaro)
 * sem depender de sites de busca, que recusam os servidores da Vercel.
 *
 * Fonte: compartilhamento público "CNPJ - SERPRO+" da Receita (WebDAV do Nextcloud),
 * pastas mensais AAAA-MM. Baixa ~2 GB (Socios0..9 e Empresas0..9) e lê os CSVs direto
 * de dentro dos zips. Pré-requisito: scripts/sql/migracao_perfil_socios_politicos.sql.
 *
 * Uso:
 *   npm run sync:socios-politicos                    (pasta mais recente)
 *   npm run sync:socios-politicos -- --mes 2026-09
 *   npm run sync:socios-politicos -- --seco          (lê e conta, sem gravar)
 *   npm run sync:socios-politicos -- --manter        (não apaga os zips de .tmp_receita/)
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import dotenv from "dotenv";
import unzipper from "unzipper";
import { credenciaisBancoPerfil } from "./banco-perfil";
import {
	type Dominios,
	type EmpresaReceita,
	empresaDaLinha,
	type LinhaSocioPolitico,
	linhaDominio,
	mapaPoliticos,
	montarRegistro,
	pastaMaisRecente,
	type PoliticoComCpf,
	type VinculoSocio,
	vinculoDaLinha,
} from "./socios-politicos";

dotenv.config({ path: ".env.local" });

/** Código público do compartilhamento "CNPJ - SERPRO+" (arquivos.receitafederal.gov.br/index.php/s/…). */
const COMPARTILHAMENTO = "YggdBLfdninEJX9";
const WEBDAV = "https://arquivos.receitafederal.gov.br/public.php/webdav";
const AUTH = `Basic ${Buffer.from(`${COMPARTILHAMENTO}:`).toString("base64")}`;
const TEMP_DIR = path.join(process.cwd(), ".tmp_receita");
const PARTES = Array.from({ length: 10 }, (_, i) => i);
/** Abaixo disso algo deu errado nos arquivos: nada é gravado nem apagado. */
const MINIMO = 500;
const LOTE = 1000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function listarMeses(): Promise<string[]> {
	const res = await fetch(`${WEBDAV}/`, { method: "PROPFIND", headers: { Authorization: AUTH, Depth: "1" }, signal: AbortSignal.timeout(60_000) });
	if (!res.ok) throw new Error(`[RECEITA] Listagem do compartilhamento: HTTP ${res.status}`);
	return [...(await res.text()).matchAll(/<d:href>([^<]+)<\/d:href>/g)].map((m) => m[1]);
}

async function baixarUmaVez(url: string, destino: string): Promise<void> {
	const res = await fetch(url, { headers: { Authorization: AUTH }, signal: AbortSignal.timeout(30 * 60_000) });
	if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
	const parcial = `${destino}.parcial`;
	await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(parcial));
	fs.renameSync(parcial, destino);
}

async function baixar(mes: string, arquivo: string): Promise<string> {
	const destino = path.join(TEMP_DIR, mes, arquivo);
	if (fs.existsSync(destino) && fs.statSync(destino).size > 0) return destino;
	fs.mkdirSync(path.dirname(destino), { recursive: true });
	for (let tentativa = 1; ; tentativa++) {
		try {
			console.log(`[RECEITA] Baixando ${mes}/${arquivo} (tentativa ${tentativa}/3)...`);
			await baixarUmaVez(`${WEBDAV}/${mes}/${arquivo}`, destino);
			return destino;
		} catch (e) {
			if (tentativa >= 3) throw new Error(`[RECEITA] ${arquivo}: ${(e as Error).message}`);
			console.warn(`[RECEITA] Falha em ${arquivo}: ${(e as Error).message}; nova tentativa em ${10 * tentativa} s.`);
			await esperar(10_000 * tentativa);
		}
	}
}

/** Lê o CSV de dentro do zip (latin1, `;`), linha a linha, sem extrair para o disco. */
async function lerCsvDoZip(zip: string, aoLer: (colunas: string[]) => void): Promise<number> {
	const diretorio = await unzipper.Open.file(zip);
	const entrada = diretorio.files.find((f) => f.type === "File");
	if (!entrada) throw new Error(`[RECEITA] ${path.basename(zip)} sem arquivo dentro`);
	const parser = entrada.stream().pipe(parse({ delimiter: ";", encoding: "latin1", relax_quotes: true, relax_column_count: true, skip_empty_lines: true }));
	let linhas = 0;
	for await (const colunas of parser) {
		aoLer(colunas as string[]);
		linhas++;
	}
	return linhas;
}

interface Opcoes {
	mes: string;
	seco: boolean;
	manter: boolean;
}

async function lerPartes(o: Opcoes, prefixo: string, aoLer: (colunas: string[]) => void): Promise<void> {
	for (const i of PARTES) {
		const zip = await baixar(o.mes, `${prefixo}${i}.zip`);
		const linhas = await lerCsvDoZip(zip, aoLer);
		console.log(`[RECEITA] ${prefixo}${i}: ${linhas.toLocaleString("pt-BR")} linhas lidas.`);
		if (!o.manter) fs.rmSync(zip, { force: true });
	}
}

async function lerDominio(o: Opcoes, arquivo: string): Promise<Map<string, string>> {
	const mapa = new Map<string, string>();
	await lerCsvDoZip(await baixar(o.mes, arquivo), (c) => linhaDominio(c, mapa));
	return mapa;
}

async function lerEleitosComCpf(banco: SupabaseClient): Promise<PoliticoComCpf[]> {
	const todos: PoliticoComCpf[] = [];
	for (let de = 0; ; de += LOTE) {
		const { data, error } = await banco
			.from("tse_eleitos")
			.select("nr_cpf_candidato,nm_candidato")
			.not("nr_cpf_candidato", "is", null)
			.order("id")
			.range(de, de + LOTE - 1);
		if (error) throw new Error(`[SOCIOS POLITICOS] Leitura de tse_eleitos: ${error.message}`);
		todos.push(...((data ?? []) as PoliticoComCpf[]));
		if (!data || data.length < LOTE) return todos;
	}
}

function montarLinhas(vinculos: VinculoSocio[], empresas: Map<string, EmpresaReceita>, dominios: Dominios, mes: string): LinhaSocioPolitico[] {
	const porChave = new Map<string, LinhaSocioPolitico>();
	for (const v of vinculos) {
		const linha = montarRegistro(v, empresas.get(v.cnpj_basico), dominios, mes);
		const chave = `${v.cpf_politico}:${v.cnpj_basico}`;
		if (linha && !porChave.has(chave)) porChave.set(chave, linha);
	}
	return [...porChave.values()];
}

async function gravar(banco: SupabaseClient, linhas: LinhaSocioPolitico[], mes: string): Promise<void> {
	for (let i = 0; i < linhas.length; i += LOTE) {
		const { error } = await banco.from("socios_politicos").upsert(linhas.slice(i, i + LOTE), { onConflict: "cpf_politico,cnpj_basico" });
		if (error) throw new Error(`[SOCIOS POLITICOS] upsert falhou: ${error.message} — rode scripts/sql/migracao_perfil_socios_politicos.sql no Banco de Perfil antes.`);
	}
	// Quem saiu da sociedade some do arquivo do mês: as linhas de meses anteriores saem depois da carga completa.
	const { error, count } = await banco.from("socios_politicos").delete({ count: "exact" }).neq("referencia", mes);
	if (error) throw new Error(`[SOCIOS POLITICOS] Limpeza de meses anteriores: ${error.message}`);
	console.log(`[SOCIOS POLITICOS] ${count ?? 0} vínculo(s) de meses anteriores removido(s).`);
}

function lerOpcoes(argv: string[], meses: string[]): Opcoes {
	const i = argv.indexOf("--mes");
	const mes = i >= 0 ? argv[i + 1] : pastaMaisRecente(meses);
	if (!mes || !/^\d{4}-\d{2}$/.test(mes)) throw new Error("[RECEITA] Mês não encontrado no compartilhamento (use --mes AAAA-MM).");
	return { mes, seco: argv.includes("--seco"), manter: argv.includes("--manter") };
}

async function main() {
	const o = lerOpcoes(process.argv, await listarMeses());
	const { url, key } = credenciaisBancoPerfil();
	const banco = createClient(url, key, { auth: { persistSession: false } });
	const mapa = mapaPoliticos(await lerEleitosComCpf(banco));
	console.log(`[SOCIOS POLITICOS] ${mapa.size.toLocaleString("pt-BR")} nomes de eleitos com CPF; arquivo da Receita de ${o.mes}.`);

	const vinculos: VinculoSocio[] = [];
	await lerPartes(o, "Socios", (c) => {
		const v = vinculoDaLinha(c, mapa);
		if (v) vinculos.push(v);
	});
	const basicos = new Set(vinculos.map((v) => v.cnpj_basico));
	console.log(`[SOCIOS POLITICOS] ${vinculos.length} vínculo(s) em ${basicos.size} empresa(s).`);

	const empresas = new Map<string, EmpresaReceita>();
	await lerPartes(o, "Empresas", (c) => {
		const e = basicos.has(String(c[0] ?? "").padStart(8, "0")) ? empresaDaLinha(c) : null;
		if (e) empresas.set(e.cnpj_basico, e);
	});
	const dominios: Dominios = { qualificacoes: await lerDominio(o, "Qualificacoes.zip"), naturezas: await lerDominio(o, "Naturezas.zip") };
	const linhas = montarLinhas(vinculos, empresas, dominios, o.mes);
	console.log(`[SOCIOS POLITICOS] ${linhas.length} linha(s) (fora CNPJs de campanha); ${empresas.size} empresa(s) com razão social.`);

	if (linhas.length < MINIMO) throw new Error(`[SOCIOS POLITICOS] ${linhas.length} linhas, abaixo do mínimo ${MINIMO}: nada gravado.`);
	if (o.seco) {
		console.log(JSON.stringify(linhas.slice(0, 3), null, 1));
		return;
	}
	await gravar(banco, linhas, o.mes);
	console.log(`[SOCIOS POLITICOS] Concluído: ${linhas.length} vínculo(s) no Banco de Perfil (${o.mes}).`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e?.message || e);
		process.exit(1);
	});
