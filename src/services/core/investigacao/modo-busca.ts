/**
 * Modo busca (sem ref): alçadas em paralelo, candidatos ordenados pela semelhança do nome
 * (busca-candidatos.ts). A tela recebe a lista para escolher, ou um só e segue direto.
 * Ninguém na janela de mandato: evento NAO_ENCONTRADO (a tela explica a regra); fonte fora
 * do ar: ERROR (aí sim é falha).
 */
import { buscarDeputadoEstadualRJ } from "@/app/api/investigar/estados/rj/alerj";
import { buscarDeputadoEstadualSP } from "@/app/api/investigar/estados/sp/alesp";
import { buscarPoliticosCamaraLista, buscarSenadoresLista } from "@/app/api/investigar/scrapers/legislativo";
import { buscarCandidatos } from "@/services/core/busca-candidatos";
import { candidatosDaBaseEleitos } from "@/services/integrations/tse/eleitos";
import { type Execucao, status } from "./contexto";

function governadorSugerido(e: Execucao): string | undefined {
	const checkNome = (e.p.nomeBruto || "").toLowerCase().trim();
	const autoRefGov = e.p.correcoesNomes[checkNome]?.autoRef;
	return autoRefGov?.startsWith("GOVERNADOR:") ? autoRefGov : undefined;
}

export async function executarModoBusca(e: Execucao): Promise<void> {
	const { p, sendEvent } = e;
	const { candidatos, houveErroApi } = await buscarCandidatos(
		{
			nome: p.nomeParaBusca,
			uf: p.ufScope,
			cargo: p.cargoParam,
			somenteFederal: p.ufParam === "FEDERAL",
			refGovernadorSugerida: governadorSugerido(e),
		},
		{
			camara: buscarPoliticosCamaraLista,
			senado: buscarSenadoresLista,
			alesp: buscarDeputadoEstadualSP,
			alerj: buscarDeputadoEstadualRJ,
			eleitos: candidatosDaBaseEleitos,
			status: (msg) => status(e, msg),
		},
	);
	if (candidatos.length === 0 && houveErroApi) {
		sendEvent("ERROR", {
			mensagem: "A busca falhou: uma das fontes (Câmara, Senado ou a nossa base de eleitos) não respondeu. Tente novamente em alguns minutos.",
		});
	} else if (candidatos.length === 0) {
		sendEvent("NAO_ENCONTRADO", { termo: p.nomeParaBusca, motivo: "FORA_DA_JANELA" });
	} else {
		// Envia para o painel de desambiguação e encerra
		status(e, `${candidatos.length} perfis encontrados. Aguardando seleção do operador...`);
		sendEvent("CANDIDATOS_ENCONTRADOS", { termo: p.nomeParaBusca, candidatos });
	}
	p.safeClose();
}
