/* ==========================================================================
   Dossiê exportado — consulta do perfil na Câmara (SÓ NO SERVIDOR).
   Tem prazo: se o banco ou a API da Câmara demorarem, o dossiê sai sem a
   seção e avisa no texto.
   ========================================================================== */
import { buscarCotaDeputado, buscarServidoresDeputado, buscarVotosDeputado } from "@/lib/perfil-deputado/consultas";
import { resumirProposicoes } from "@/lib/perfil-deputado/proposicoes";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";
import { idProposicaoPrincipal } from "@/lib/votos";
import { type DadosPerfilCamara, MAX_VOTOS_DOSSIE } from "./perfil";

const PRAZO_MS = 15_000;

function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const estouro = new Promise<never>((_, rejeitar) => {
		timer = setTimeout(() => rejeitar(new Error(`perfil: sem resposta em ${ms} ms`)), ms);
	});
	return Promise.race([promessa, estouro]).finally(() => clearTimeout(timer));
}

async function consultar(id: number): Promise<DadosPerfilCamara> {
	const [servidores, cota, votos] = await Promise.all([
		buscarServidoresDeputado(supabasePerfilAdmin, id),
		buscarCotaDeputado(supabasePerfilAdmin, id),
		buscarVotosDeputado(supabasePerfilAdmin, id),
	]);
	const ids = votos
		.slice(0, MAX_VOTOS_DOSSIE)
		.map(idProposicaoPrincipal)
		.filter((x: string | null): x is string => Boolean(x));
	const proposicoes = await resumirProposicoes(supabasePerfilAdmin, ids).catch(() => ({}));
	return { servidores, cota, votos, proposicoes };
}

/** null = não deu para consultar (o dossiê informa a indisponibilidade). */
export async function buscarDadosPerfilCamara(idCamara: string, prazoMs = PRAZO_MS): Promise<DadosPerfilCamara | null> {
	const id = Number(idCamara);
	if (!Number.isInteger(id) || id <= 0) return null;
	try {
		return await comPrazo(consultar(id), prazoMs);
	} catch (e) {
		console.warn(`[Exportar Dossiê] Perfil da Câmara ${idCamara} indisponível:`, (e as Error).message);
		return null;
	}
}
