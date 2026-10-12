/**
 * Emendas: parlamentares por autor (só deputado federal e senador), Emendas PIX no
 * TransfereGov (por autor; para prefeito, as recebidas pelo município), imóveis da União
 * no município (SPU) e as emendas individuais avaliadas pela IA.
 */
import { analisarEmendasComInteligencia } from "@/app/api/investigar/ai_helpers";
import { buscarEmendas } from "@/app/api/investigar/etl_extractors";
import { chaveCachePesquisa, podeLerCachePesquisas } from "@/lib/cache-pesquisas";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buscarImoveisMunicipioSupabase } from "@/services/integrations/spu/client";
import {
	buscarEmendasPorAutor as buscarTransfereGovPorAutor,
	buscarEmendasPorMunicipio as buscarTransfereGovPorMunicipio,
	gerarResumoEmendasPIX,
} from "@/services/integrations/transferegov/client";
import { type Investigacao, naMalha, naTela, status } from "./contexto";

/* ---------------------------- Emendas por autor ---------------------------- */

function noResumoEmendas(pessoaId: string, r: any) {
	return {
		id: `emenda-resumo-${pessoaId}`,
		type: "EMENDA_RESUMO",
		_origemId: pessoaId,
		data: {
			label: `EMENDAS PARLAMENTARES (${r.totalEmendas})`,
			totalEmendas: r.totalEmendas,
			totalEmpenhado: r.totalEmpenhado,
			totalPago: r.totalPago,
			percentualExecucao: r.percentualExecucao,
			fantasmas: r.fantasmas,
			emendasPIX: r.emendasPIX,
			porTipo: r.porTipo,
			topLocalidades: r.topLocalidades,
			alertas: r.alertas,
		},
	};
}

/** Emendas por nome do autor só para quem apresenta emenda federal (antes trazia homônimos). */
export async function emendasDoAutor(inv: Investigacao): Promise<any[]> {
	status(inv, "Rastreando emendas parlamentares em todas as legislaturas disponíveis...");
	if (!inv.perfil.emendasPorAutor) {
		status(inv, `Emendas parlamentares federais por autor: não se aplica a ${inv.perfil.cargoDisplay}.`);
		return [];
	}
	const { emendas, resumo } = await buscarEmendas(inv.dep.nome);
	// Emite nó de resumo totalizador antes das emendas individuais
	if (resumo && resumo.totalEmendas > 0) {
		naTela(inv, noResumoEmendas(inv.pessoaId, resumo));
		status(inv, `${resumo.totalEmendas} emendas encontradas. Total empenhado: R$ ${resumo.totalEmpenhado.toLocaleString("pt-BR")} | Execução: ${resumo.percentualExecucao}%`);
	}
	return emendas;
}

/* ------------------------------- TransfereGov ------------------------------ */

function ehPrefeitura(dep: any): boolean {
	return dep.casa === "PREFEITURA";
}

/** Prefeito: o município (slug da ref); demais: o nome do político. */
function municipioOuNome(dep: any): string {
	return dep.uri && dep.uri.length > 2 ? dep.uri.replace(/-/g, " ") : dep.nome;
}

function pixDaTabela(linhas: any[]): any[] {
	return linhas.map((e) => ({
		numeroEmenda: "PIX",
		cnpjBeneficiario: "",
		nomeBeneficiario: e.municipio_destino,
		ufBeneficiario: e.uf_destino,
		areaPoliticaPublica: "Transferência Especial (PIX)",
		situacao: "Enviado",
		valorCusteio: Number(e.valor_custeio || 0),
		valorInvestimento: Number(e.valor_investimento || 0),
	}));
}

/** Busca primeiro na base de dados (cache-first); null = não achou ou falhou. */
async function pixDoBanco(inv: Investigacao): Promise<any[] | null> {
	if (ehPrefeitura(inv.dep)) return null;
	try {
		const { data, error } = await supabaseAdmin.from("emendas_pix").select("*").eq("autor", inv.dep.nome);
		if (error || !data || data.length === 0) return null;
		status(inv, `[CACHE] Detalhamento de Emendas PIX recuperado instantaneamente do banco de dados.`);
		return pixDaTabela(data);
	} catch (err) {
		console.warn("[CACHE MISS] emendas_pix:", err);
		return null;
	}
}

async function pixAoVivo(inv: Investigacao): Promise<any[]> {
	if (!ehPrefeitura(inv.dep)) return buscarTransfereGovPorAutor(inv.dep.nome);
	const municipio = municipioOuNome(inv.dep);
	status(inv, `Rastreando Emendas PIX enviadas para o município de ${municipio.toUpperCase()}...`);
	return buscarTransfereGovPorMunicipio(municipio);
}

function soma(lista: any[], campo: string): number {
	return lista.reduce((acc, t) => acc + (t[campo] || 0), 0);
}

async function emitirResumoPix(inv: Investigacao, lista: any[]): Promise<void> {
	const resumoPix = await gerarResumoEmendasPIX(inv.dep.nome);
	const totalCusteio = resumoPix?.valorTotalCusteio || soma(lista, "valorCusteio");
	const totalInv = resumoPix?.valorTotalInvestimento || soma(lista, "valorInvestimento");
	const numEmendas = resumoPix?.totalEmendas || lista.length;
	naTela(inv, {
		id: `transferegov-${inv.pessoaId}`,
		type: "EMENDA_RESUMO",
		_origemId: inv.pessoaId,
		data: {
			label: `TRANSFEREGOV: EMENDAS PIX (${numEmendas})`,
			totalEmendas: numEmendas,
			totalEmpenhado: totalCusteio + totalInv,
			alertas: [
				`Mapeadas ${numEmendas} transferências especiais diretas (Emendas PIX).`,
				`Custeio: R$ ${totalCusteio.toLocaleString("pt-BR")}`,
				`Investimento: R$ ${totalInv.toLocaleString("pt-BR")}`,
			],
		},
	});
}

/** API fora (ex.: 502): resgata o resumo PIX de uma investigação guardada do mesmo alvo. */
async function resgatarPixDoCache(inv: Investigacao): Promise<void> {
	try {
		if (!podeLerCachePesquisas()) return;
		const chave = chaveCachePesquisa(inv.p.nomeParaBusca, inv.p.refParam || inv.p.forceRef);
		const { data } = await supabaseAdmin
			.from("pesquisas")
			.select("grafo_dados")
			.eq("termo_busca", chave)
			.order("atualizado_em", { ascending: false })
			.limit(1)
			.single();
		const no = data?.grafo_dados?.nodes?.find((n: any) => n.type === "EMENDA_RESUMO" && n.data?.label?.includes("TRANSFEREGOV"));
		if (!no) return;
		status(inv, `TransfereGov offline. Resgatando dados de Emendas PIX do cache...`);
		// Ajusta o id e _origemId para o grafo atual
		no.id = `transferegov-cache-${inv.pessoaId}`;
		no._origemId = inv.pessoaId;
		naMalha(inv, no);
	} catch (err) {
		console.warn("Erro no fallback do TransfereGov", err);
	}
}

/** Emendas PIX (TransfereGov). Devolve a lista para casar beneficiários com as emendas individuais. */
export async function emendasPix(inv: Investigacao): Promise<any[]> {
	status(inv, "Rastreando detalhamento de Emendas PIX no TransfereGov...");
	// Fora do try: se só o resumo falhar, a lista já obtida continua valendo (como antes).
	let lista: any[] = [];
	try {
		lista = (await pixDoBanco(inv)) ?? (await pixAoVivo(inv));
		if (lista.length > 0) await emitirResumoPix(inv, lista);
		else await resgatarPixDoCache(inv);
	} catch (e) {
		console.error("[TransfereGov Error]", e);
		// Fonte fora do ar é aviso de status, não achado: antes virava um nó
		// vermelho (score 86) no Canvas, como se fosse indício contra o político.
		status(inv, `Falha na conexão com o TransfereGov (API offline). Emendas PIX não consultadas nesta investigação.`);
	}
	return lista;
}

/* ------------------------------------ SPU ---------------------------------- */

function noSpu(pessoaId: string, imoveis: any[]) {
	const valorTotal = imoveis.reduce((acc, i) => acc + (i.valor_imovel || 0), 0);
	const areaTotal = imoveis.reduce((acc, i) => acc + (i.area_m2 || 0), 0);
	return {
		id: `spu-imoveis-${pessoaId}`,
		type: "CONTRATO",
		_origemId: pessoaId,
		data: {
			label: `Patrimônio SPU (${imoveis.length})`,
			fornecedor: `Governo Federal`,
			valor: valorTotal > 0 ? `R$ ${valorTotal.toLocaleString("pt-BR")}` : `Área: ${Math.round(areaTotal).toLocaleString("pt-BR")} m²`,
			motivo_ia: `Foram identificados ${imoveis.length} imóveis pertencentes à União neste município. É importante cruzar essa informação com licitações municipais para investigar possíveis ocupações ou alienações irregulares de áreas federais.`,
			score_letalidade: 20,
		},
	};
}

/** 2.2 SPU — Imóveis da União no município (só prefeito). */
export async function imoveisDaUniao(inv: Investigacao): Promise<void> {
	try {
		if (!ehPrefeitura(inv.dep)) return;
		const municipio = municipioOuNome(inv.dep);
		status(inv, `Consultando Patrimônio da União (SPU) em ${municipio.toUpperCase()}...`);
		const imoveis = await buscarImoveisMunicipioSupabase(municipio, inv.dep.uf);
		if (imoveis.length > 0) naTela(inv, noSpu(inv.pessoaId, imoveis));
	} catch (e: any) {
		console.error("[SPU Error]", e.message);
	}
}

/* --------------------------- Emendas individuais --------------------------- */

function mesmaEmenda(tg: any, codigo: unknown): boolean {
	if (!tg.numeroEmenda) return false;
	return String(tg.numeroEmenda).includes(String(codigo)) || String(codigo).includes(String(tg.numeroEmenda));
}

/** Beneficiário correspondente nas emendas PIX do TransfereGov, se houver. */
function beneficiarioDaEmenda(emenda: any, transfereGov: any[]) {
	const tg = transfereGov.find((t) => mesmaEmenda(t, emenda.codigoEmenda));
	if (!tg) return null;
	return { cnpj: tg.cnpjBeneficiario, nome: tg.nomeBeneficiario, uf: tg.ufBeneficiario, area: tg.areaPoliticaPublica, situacao: tg.situacao };
}

function valoresDaEmenda(emenda: any) {
	return {
		valor: emenda._empenhado,
		codigo: emenda.codigoEmenda,
		ano: emenda.ano,
		valorPago: emenda._totalEfetivamentePago,
		valorLiquidado: emenda._liquidado,
		valorRestoInscrito: emenda._restoInscrito,
		valorRestoPago: emenda._restoPago,
		percentualExecucao: emenda._percentualExecucao,
		isFantasma: emenda._isFantasma,
	};
}

function avaliacaoDaEmenda(emenda: any) {
	return {
		score_letalidade: emenda.score_letalidade ?? 20,
		motivo_ia: emenda.motivo_ia ?? `Status Operacional | Pagamento: ${emenda._percentualExecucao}%`,
		classificacao: emenda.classificacao ?? "REGULAR_COM_RESSALVA",
		enquadramento_normativo: emenda.enquadramento_normativo ?? "-",
		fundamentacao_tecnica: emenda.fundamentacao_tecnica ?? "Sem apontamento técnico profundo.",
		alertas: emenda._alertas,
	};
}

function noDaEmenda(emenda: any, i: number, pessoaId: string, transfereGov: any[]) {
	const risco = emenda._riscoTipo || { nivel: "NORMAL", label: "Emenda Individual" };
	const lugar = emenda.localidadeDoGasto || emenda.funcao;
	return {
		id: `emenda-${emenda.codigoEmenda || i}`,
		type: "EMENDA",
		_origemId: pessoaId,
		data: {
			label: `EMENDA: ${lugar || "Função Não Informada"}`,
			objeto: lugar || "Localidade/Função Não Informada",
			...valoresDaEmenda(emenda),
			tipo: risco.label,
			funcao: emenda.funcao || "Função Indisponível",
			subfuncao: emenda.subfuncao || "",
			programa: emenda.nomePrograma || "",
			riscoNivel: risco.nivel,
			...avaliacaoDaEmenda(emenda),
			beneficiario: beneficiarioDaEmenda(emenda, transfereGov),
		},
	};
}

/** AI Triage das Emendas antes de emitir; as 100% executadas ficam fora do Canvas. */
export async function emendasIndividuais(inv: Investigacao, emendas: any[], transfereGov: any[]): Promise<void> {
	if (emendas.length === 0) return;
	status(inv, "Auditando proposições com API Groq/Gemini L1...");
	const avaliadas = await analisarEmendasComInteligencia(emendas, inv.dep.uf, inv.perfil.esfera, inv.dep.casa);
	avaliadas.forEach((emenda: any, i: number) => {
		if (emenda._percentualExecucao === 100) return;
		naTela(inv, noDaEmenda(emenda, i, inv.pessoaId, transfereGov));
	});
}
