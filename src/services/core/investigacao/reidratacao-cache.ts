/**
 * Dossiê guardado (tabela `pesquisas`) com a pessoa sem patrimônio: completa pelos bens do TSE
 * na nossa base, pelo CPF da pessoa, e regrava o cache. Também descarta nós de bens no formato
 * antigo.
 *
 * Desde 12/10/2026: sem o TSE ao vivo (recusa servidores de nuvem) e sem procurar bens pelo
 * nome — achar pelo nome trazia o patrimônio e o CPF de um homônimo (regra de identidade,
 * nota 31 do Obsidian). Sem CPF no nó, o dossiê fica como está até ser refeito.
 */
import { cpfValido } from "@/lib/documento";

export function isNodeBemLegado(node: any): boolean {
	const id = String(node?.id || "");
	if (id.startsWith("bens-") || id.startsWith("bem-")) return true;
	if (node?.data?.codigo === "TSE-BENS") return true;
	const label = String(node?.data?.label || "");
	if (label.startsWith("BEM DECLARADO:") || label === "Patrimônio Declarado (TSE)") return true;
	const objeto = String(node?.data?.objeto || "");
	return objeto.startsWith("Total de Bens");
}

/** Bens da pessoa na base, só pelo CPF já confirmado no nó (nunca pelo nome). */
async function consultarBensTSEParaReidratacao(pessoa: any): Promise<any[]> {
	const cpf = String(pessoa.data?.cpf || "").replace(/\D/g, "");
	if (!cpfValido(cpf)) return [];
	const { buscarBensHistoricoTSE } = await import("@/services/integrations/tse/bens");
	return buscarBensHistoricoTSE(cpf);
}

function aplicarBensNoPessoaNode(pessoa: any, bens: any[]): void {
	const principal = bens?.[0];
	if (!principal?.valor_total) return;
	pessoa.data.patrimonio = Number(principal.valor_total) || 0;
	pessoa.data.anoPatrimonio = principal.ano_eleicao;
	pessoa.data.bensDeclarados = principal.descricao_bens || [];
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
