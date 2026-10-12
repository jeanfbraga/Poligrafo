/**
 * Dossiê guardado (tabela `pesquisas`) com a pessoa sem patrimônio: completa pelos bens do TSE
 * (nossa base primeiro, depois o TSE ao vivo) e regrava o cache. Também descarta nós de bens
 * no formato antigo. Saiu do investigador-principal.ts (12/10/2026) sem mudança.
 */
import { cpfValido, documentoValido } from "@/lib/documento";

export function isNodeBemLegado(node: any): boolean {
	const id = String(node?.id || "");
	if (id.startsWith("bens-") || id.startsWith("bem-")) return true;
	if (node?.data?.codigo === "TSE-BENS") return true;
	const label = String(node?.data?.label || "");
	if (label.startsWith("BEM DECLARADO:") || label === "Patrimônio Declarado (TSE)") return true;
	const objeto = String(node?.data?.objeto || "");
	return objeto.startsWith("Total de Bens");
}

async function resolverNomeCivilReidratacao(data: any): Promise<string | undefined> {
	const nomeCivilAtual = String(data.nomeCivil || "").toLowerCase().trim();
	const labelAtual = String(data.label || "").toLowerCase().trim();
	const eIgualAoLabel = !data.nomeCivil || nomeCivilAtual === labelAtual;

	if (eIgualAoLabel && data.casa === "CAMARA" && data.idPoliticoOriginal) {
		try {
			const { buscarDetalhesPolitico } = await import("@/app/api/investigar/scrapers/legislativo");
			const det = await buscarDetalhesPolitico(Number(data.idPoliticoOriginal));
			if (det?.nomeCivil) return det.nomeCivil;
		} catch {
			// Ignora falha de detalhe
		}
	}
	return data.nomeCivil || undefined;
}

async function buscarBensPorNomesCandidato(nomes: (string | undefined)[]): Promise<any[]> {
	const { buscarBensPorNomeTSE } = await import("@/services/integrations/tse/bens");
	const nomesValidos = Array.from(new Set(nomes.filter((n): n is string => Boolean(n))));
	for (const nome of nomesValidos) {
		const bens = await buscarBensPorNomeTSE(nome);
		if (bens.length > 0) return bens;
	}
	return [];
}

async function consultarBensLocaisParaReidratacao(pessoa: any): Promise<any[]> {
	const data = pessoa.data ?? {};
	const cpf = String(data.cpf || "").replace(/\D/g, "");
	if (cpfValido(cpf)) {
		const { buscarBensHistoricoTSE } = await import("@/services/integrations/tse/bens");
		const bensCpf = await buscarBensHistoricoTSE(cpf);
		if (bensCpf.length > 0) return bensCpf;
	}

	const nomeCivilExtra = await resolverNomeCivilReidratacao(data);
	return buscarBensPorNomesCandidato([data.nomeCivil, nomeCivilExtra, data.label]);
}

function extrairCpfValidoParaReidratacao(pessoa: any, tseLive: any): string | null {
	const raw = pessoa.data?.cpf || tseLive?.documentoPrincipal;
	const clean = raw ? String(raw).replace(/\D/g, "") : "";
	return cpfValido(clean) ? clean : null;
}

function montarItemBensLive(tseLive: any) {
	return {
		ano_eleicao: tseLive.anoEleicao || 2026,
		valor_total: tseLive.patrimonioTotal,
		descricao_bens: tseLive.bensDeclarados || [],
		historico: tseLive.historicoPatrimonio || [],
		tseLive,
	};
}

const MAPA_CARGO_COD_REIDRATACAO: Record<string, string> = {
	SENADO: "5",
	GOVERNO_ESTADUAL: "3",
	ALERJ: "7",
	ALESP: "7",
	ASSEMBLEIA_LEGISLATIVA: "7",
	PREFEITURA: "11",
	PRESIDENCIA_DA_REPUBLICA: "1",
};

function resolverCargoCodParaCasa(casa?: string): string {
	if (!casa) return "6";
	if (MAPA_CARGO_COD_REIDRATACAO[casa]) return MAPA_CARGO_COD_REIDRATACAO[casa];
	if (casa.startsWith("CAMARA_MUNICIPAL")) return "13";
	return "6";
}

async function consultarBensLiveParaReidratacao(pessoa: any): Promise<any[]> {
	try {
		const { buscarCpfNoTSE } = await import("@/app/api/investigar/tse");
		const { persistirBensHistoricosTSE } = await import("@/services/integrations/tse/bens");
		const data = pessoa?.data ?? {};
		const uf = data.uf || "BR";
		const cargoCod = resolverCargoCodParaCasa(data.casa);
		const nomeBusca = data.label || data.nomeCivil || "";
		const nomeCivil = await resolverNomeCivilReidratacao(data);

		const tseLive = await buscarCpfNoTSE(nomeBusca, uf, cargoCod, nomeCivil);
		if (!tseLive?.patrimonioTotal || tseLive.patrimonioTotal <= 0) return [];

		const cpf = extrairCpfValidoParaReidratacao(pessoa, tseLive);
		if (cpf) {
			void persistirBensHistoricosTSE(cpf, nomeBusca, tseLive);
		}

		return [montarItemBensLive(tseLive)];
	} catch (err) {
		console.warn("[TSE Reidratacao Live Fallback Error]", err);
		return [];
	}
}

async function consultarBensTSEParaReidratacao(pessoa: any): Promise<any[]> {
	const bensLocais = await consultarBensLocaisParaReidratacao(pessoa);
	if (bensLocais.length > 0) return bensLocais;
	return consultarBensLiveParaReidratacao(pessoa);
}

function aplicarMetricasHistoricoNoNode(targetData: any, live: any): void {
	if (!live) return;
	if (live.historicoPatrimonio) targetData.historicoPatrimonio = live.historicoPatrimonio;
	if (live.patrimonioAnterior !== undefined) targetData.patrimonioAnterior = live.patrimonioAnterior;
	if (live.anoPatrimonioAnterior !== undefined) targetData.anoPatrimonioAnterior = live.anoPatrimonioAnterior;
	if (live.variacaoPatrimonio !== undefined) targetData.variacaoPatrimonio = live.variacaoPatrimonio;
	if (live.variacaoPatrimonioPercentual !== undefined) targetData.variacaoPatrimonioPercentual = live.variacaoPatrimonioPercentual;
}

function extrairDocumentoValidoParaNode(principal: any): string | null {
	const docLive = principal.tseLive?.documentoPrincipal || principal.tseLive?.cpf || principal.cpf_candidato;
	if (!docLive) return null;
	const docLimpo = String(docLive).replace(/\D/g, "");
	return documentoValido(docLimpo) ? docLimpo : null;
}

function reidratarDocumentoNodeSeAusente(pessoaData: any, principal: any): void {
	const precisaCpf = !documentoValido(pessoaData.cpf);
	if (!precisaCpf) return;

	const docLimpo = extrairDocumentoValidoParaNode(principal);
	if (docLimpo) {
		pessoaData.cpf = docLimpo;
		pessoaData.documentoPrincipal = docLimpo;
		pessoaData.isCnpj = docLimpo.length === 14;
	}
}

function reidratarNomeCivilNodeSeAusente(pessoaData: any, principal: any): void {
	const nomeAtual = String(pessoaData.nomeCivil || "").toLowerCase().trim();
	const labelAtual = String(pessoaData.label || "").toLowerCase().trim();
	const precisaNome = !pessoaData.nomeCivil || nomeAtual === labelAtual;
	const nomeLive = principal.tseLive?.nome;
	if (precisaNome && nomeLive) {
		pessoaData.nomeCivil = nomeLive;
	}
}

function aplicarBensNoPessoaNode(pessoa: any, bens: any[]): void {
	const principal = bens?.[0];
	if (!principal?.valor_total) return;

	pessoa.data.patrimonio = Number(principal.valor_total) || 0;
	pessoa.data.anoPatrimonio = principal.ano_eleicao;
	pessoa.data.bensDeclarados = principal.descricao_bens || [];
	aplicarMetricasHistoricoNoNode(pessoa.data, principal.tseLive);

	reidratarDocumentoNodeSeAusente(pessoa.data, principal);
	reidratarNomeCivilNodeSeAusente(pessoa.data, principal);
}

export async function reidratarPessoaCacheSeNecessario(cachedNodes: any[], chaveCache?: string): Promise<void> {
	const pessoa = cachedNodes.find((n: any) => n.type === "PESSOA");
	const precisaReidratar =
		!pessoa?.data?.patrimonio ||
		pessoa.data.patrimonio === 0 ||
		!pessoa.data?.bensDeclarados ||
		pessoa.data.bensDeclarados.length === 0;

	if (!pessoa || !precisaReidratar) return;

	try {
		const bens = await consultarBensTSEParaReidratacao(pessoa);
		if (bens.length > 0) {
			aplicarBensNoPessoaNode(pessoa, bens);

			if (chaveCache) {
				const { supabaseAdmin } = await import("@/lib/supabase-admin");
				await supabaseAdmin
					.from("pesquisas")
					.update({
						cpf_raiz: pessoa.data.cpf || null,
						grafo_dados: {
							nodes: cachedNodes,
							timestamp: new Date().toISOString(),
						},
						atualizado_em: new Date().toISOString(),
					})
					.eq("termo_busca", chaveCache);
			}
		}
	} catch (err) {
		console.warn("[Self-Healing Cache Error]", err);
	}
}
