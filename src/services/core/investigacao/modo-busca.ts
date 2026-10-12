/**
 * Modo busca (sem ref): alçadas em paralelo, candidatos ordenados pela semelhança do nome
 * (busca-candidatos.ts). A tela recebe a lista para escolher, ou um só e segue direto.
 */
import { buscarDeputadoEstadualRJ } from "@/app/api/investigar/estados/rj/alerj";
import { buscarDeputadoEstadualSP } from "@/app/api/investigar/estados/sp/alesp";
import { buscarMunicipalMestre } from "@/app/api/investigar/municipios/router";
import { buscarPoliticosCamaraLista, buscarSenadoresLista } from "@/app/api/investigar/scrapers/legislativo";
import { buscarCpfNoTSE } from "@/app/api/investigar/tse";
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
			tse: (nome, uf, cargo) => buscarCpfNoTSE(nome, uf, cargo),
			alesp: buscarDeputadoEstadualSP,
			alerj: buscarDeputadoEstadualRJ,
			municipal: buscarMunicipalMestre,
			eleitos: candidatosDaBaseEleitos,
			status: (msg) => status(e, msg),
		},
	);
	if (candidatos.length === 0) {
		sendEvent("ERROR", {
			mensagem: houveErroApi
				? `A busca falhou devido a Timeout/Falha de conexão com as APIs do Governo (Câmara/Senado/TSE). Tente novamente em alguns minutos.`
				: `Nenhum político encontrado para "${p.nomeParaBusca}".`,
		});
		p.safeClose();
		return;
	}
	// Envia para o painel de desambiguação e encerra
	status(e, `${candidatos.length} perfis encontrados. Aguardando seleção do operador...`);
	sendEvent("CANDIDATOS_ENCONTRADOS", { termo: p.nomeParaBusca, candidatos });
	p.safeClose();
}
