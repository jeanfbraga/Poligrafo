/**
 * Limpeza central dos dois bancos (Principal e Perfil): uma tabela de regras de
 * retenção, um relatório por execução. Substitui o antigo cleanup-sync.ts, que
 * só olhava o Principal e duas regras.
 *
 * Auditoria de 08/10/2026 (nota 28 do Obsidian):
 *  - já se limpam sozinhas: pesquisas (30 dias, aqui), pncp_contratos_cache (30 dias, a cada
 *    gravação e aqui), e as bases que o ETL apaga e regrava inteiras (cgu_sancoes_cache,
 *    cpgf_despesas_cache, spu_imoveis, cmrj_servidores, emendas_pix por ano);
 *  - cresciam sem limite: ceap_despesas_cache (o ETL vai de 2024 até o ano atual e nunca
 *    descartava anos → agora janela de 4 anos), tse_doadores_cache (aposentada) e
 *    tse_bens_historico (acumula eleições → agora 8 anos).
 *
 * Uso:
 *   npm run sync:cleanup                 → só MEDE: quanto cada regra removeria (nada é apagado)
 *   npm run sync:cleanup -- --aplicar    → apaga pelas regras ATIVAS; as "proposta" só são medidas
 * Uma regra "proposta" vira "ativa" só com o OK do dono (mudança revisável neste arquivo).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

export type Banco = "principal" | "perfil";
export type EstadoRegra = "ativa" | "proposta";

/** Construtor de consulta do Supabase (só o que as regras usam). */
export interface Consulta {
	lt(coluna: string, valor: unknown): Consulta;
	eq(coluna: string, valor: unknown): Consulta;
	then: PromiseLike<{ count: number | null; error: { message: string } | null }>["then"];
}

export interface RegraRetencao {
	id: string;
	banco: Banco;
	tabela: string;
	estado: EstadoRegra;
	/** Para pessoas: o que sai e por quê. */
	descricao: string;
	filtro: (q: Consulta, agora: Date) => Consulta;
}

const DIA_MS = 864e5;
const antesDe = (agora: Date, dias: number) => new Date(agora.getTime() - dias * DIA_MS).toISOString();

export const REGRAS: RegraRetencao[] = [
	{
		id: "pesquisas-30d", banco: "principal", tabela: "pesquisas", estado: "ativa",
		descricao: "Dossiês guardados há mais de 30 dias (a próxima investigação refaz).",
		filtro: (q, agora) => q.lt("atualizado_em", antesDe(agora, 30)),
	},
	{
		id: "pncp-30d", banco: "perfil", tabela: "pncp_contratos_cache", estado: "ativa",
		descricao: "Cópias de contratos do PNCP com mais de 30 dias (nem servem de reserva).",
		filtro: (q, agora) => q.lt("consultado_em", antesDe(agora, 30)),
	},
	{
		// Decisão do dono (08/10/2026): a cota fica numa janela de 4 anos, o período de um mandato.
		id: "ceap-janela-4-anos", banco: "principal", tabela: "ceap_despesas_cache", estado: "ativa",
		descricao: "Cota da Câmara e do Senado: janela de 4 anos (o ano atual e os 3 anteriores, um mandato).",
		filtro: (q, agora) => q.lt("ano", agora.getFullYear() - 3),
	},
	{
		id: "cota-agrupada-janela-4-anos", banco: "perfil", tabela: "ceap_fornecedores_ano", estado: "ativa",
		descricao: "Cota agrupada por fornecedor (cruzamentos): mesma janela de 4 anos da cota.",
		filtro: (q, agora) => q.lt("ano", agora.getFullYear() - 3),
	},
	{
		id: "bens-eleicoes-antigas", banco: "principal", tabela: "tse_bens_historico", estado: "ativa",
		descricao: "Patrimônio declarado em eleições de mais de 8 anos atrás.",
		filtro: (q, agora) => q.lt("ano_eleicao", agora.getFullYear() - 8),
	},
];
// `tse_doadores_cache` (doadores pelo nome) foi aposentada em 08/10/2026: os doadores vêm das
// contas de campanha por número do candidato (Banco de Perfil). As regras dela saíram daqui.

/** Cliente Supabase (só o que a limpeza usa); injetável nos testes. */
export interface ClienteLimpeza {
	from(tabela: string): {
		select(colunas: string, opcoes: { count: "exact"; head: true }): Consulta;
		delete(opcoes: { count: "exact" }): Consulta;
	};
}

export interface LinhaRelatorio {
	regra: RegraRetencao;
	/** Quantas linhas a regra pega (null = erro ao medir). */
	medidas: number | null;
	/** Quantas foram apagadas (null = não aplicada). */
	removidas: number | null;
	erro?: string;
}

async function contar(regra: RegraRetencao, cliente: ClienteLimpeza, agora: Date): Promise<number> {
	const { count, error } = await regra.filtro(cliente.from(regra.tabela).select("*", { count: "exact", head: true }), agora);
	if (error) throw new Error(error.message);
	return count ?? 0;
}

async function apagar(regra: RegraRetencao, cliente: ClienteLimpeza, agora: Date): Promise<number> {
	const { count, error } = await regra.filtro(cliente.from(regra.tabela).delete({ count: "exact" }), agora);
	if (error) throw new Error(error.message);
	return count ?? 0;
}

async function processar(regra: RegraRetencao, cliente: ClienteLimpeza, agora: Date, aplicar: boolean): Promise<LinhaRelatorio> {
	try {
		const medidas = await contar(regra, cliente, agora);
		const deveApagar = aplicar && regra.estado === "ativa" && medidas > 0;
		return { regra, medidas, removidas: deveApagar ? await apagar(regra, cliente, agora) : null };
	} catch (erro) {
		return { regra, medidas: null, removidas: null, erro: (erro as Error)?.message ?? String(erro) };
	}
}

/** Mede todas as regras; com `aplicar`, apaga pelas ativas. Uma regra com erro não para as outras. */
export async function executarLimpeza(clientes: Record<Banco, ClienteLimpeza>, opcoes: { agora?: Date; aplicar?: boolean; regras?: RegraRetencao[] } = {}): Promise<LinhaRelatorio[]> {
	const agora = opcoes.agora ?? new Date();
	const relatorio: LinhaRelatorio[] = [];
	for (const regra of opcoes.regras ?? REGRAS) relatorio.push(await processar(regra, clientes[regra.banco], agora, Boolean(opcoes.aplicar)));
	return relatorio;
}

const NOME_BANCO: Record<Banco, string> = { principal: "Principal", perfil: "Perfil" };

function situacao(l: LinhaRelatorio): string {
	if (l.erro) return `erro: ${l.erro}`;
	if (l.removidas !== null) return `${l.removidas} removida(s)`;
	if (l.regra.estado === "proposta") return "proposta: só medida";
	return l.medidas ? "não aplicada (rode com --aplicar)" : "nada a remover";
}

export function linhaDoLog(l: LinhaRelatorio): string {
	return `[LIMPEZA] ${l.regra.id} (${NOME_BANCO[l.regra.banco]} · ${l.regra.tabela}, ${l.regra.estado}): ${l.medidas ?? "?"} linha(s) na regra → ${situacao(l)}.`;
}

/** Tabela em Markdown para o resumo do GitHub Actions. */
export function resumoMarkdown(relatorio: LinhaRelatorio[], aplicou: boolean): string {
	const linhas = relatorio.map((l) => `| ${l.regra.id} | ${NOME_BANCO[l.regra.banco]} · \`${l.regra.tabela}\` | ${l.regra.estado} | ${l.medidas ?? "?"} | ${situacao(l)} | ${l.regra.descricao} |`);
	return [
		`## Limpeza central dos bancos — ${aplicou ? "aplicada (regras ativas)" : "só medição"}`,
		"",
		"| Regra | Banco · tabela | Estado | Linhas na regra | Resultado | O que sai |",
		"| --- | --- | --- | --- | --- | --- |",
		...linhas,
		"",
	].join("\n");
}

function cliente(url: string | undefined, chave: string | undefined, nome: string): ClienteLimpeza {
	if (!url || !chave) throw new Error(`Credenciais do banco ${nome} ausentes.`);
	return createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as ClienteLimpeza;
}

async function main() {
	dotenv.config({ path: path.join(process.cwd(), ".env.local") });
	const aplicar = process.argv.includes("--aplicar");
	const clientes: Record<Banco, ClienteLimpeza> = {
		principal: cliente(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, "Principal"),
		perfil: cliente(process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL, process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY, "Perfil"),
	};
	const relatorio = await executarLimpeza(clientes, { aplicar });
	for (const l of relatorio) console.log(linhaDoLog(l));
	if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumoMarkdown(relatorio, aplicar));
	if (relatorio.some((l) => l.erro)) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/etl/limpeza-central.ts")) {
	main().catch((e) => {
		console.error("[LIMPEZA] Erro fatal:", e?.message ?? e);
		process.exit(1);
	});
}
