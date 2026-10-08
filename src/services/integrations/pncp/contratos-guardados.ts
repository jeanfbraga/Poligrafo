/**
 * Contratos de um órgão com cópia guardada no Banco de Perfil (`pncp_contratos_cache`).
 *
 * O PNCP leva de 1 a 30 s por consulta, limita requisições (429) e cai (08/10/2026):
 *  - cópia de até 24 h → usada direto, sem chamar o PNCP;
 *  - sem cópia recente → consulta o PNCP e guarda o resultado (inclusive "nenhum contrato");
 *  - PNCP não respondeu → usa a cópia de até 30 dias e diz de quando ela é;
 *  - sem cópia nenhuma → a falha segue para o chamador ("o PNCP não respondeu").
 * Banco fora do ar não atrapalha: segue direto no PNCP, com um aviso no log.
 */
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";
import { buscarContratosDoOrgao, type ContratoOrgao, type OpcoesContratosOrgao } from "./contratos-orgao";

export const VALIDADE_MS = 24 * 60 * 60 * 1000;
export const VALIDADE_RESERVA_MS = 30 * 24 * 60 * 60 * 1000;

export interface ResultadoContratos {
	contratos: ContratoOrgao[];
	origem: "ao_vivo" | "guardado" | "guardado_antigo";
	/** Quando a cópia foi feita (ISO); null quando veio ao vivo. */
	guardadoEm: string | null;
}

interface Guardado {
	consultado_em: string;
	contratos: ContratoOrgao[];
}

export interface DepsGuardados {
	ler: (cnpj: string) => Promise<Guardado | null>;
	gravar: (cnpj: string, contratos: ContratoOrgao[], agora: Date) => Promise<void>;
	buscar: (cnpj: string, op: OpcoesContratosOrgao) => Promise<ContratoOrgao[]>;
	agora?: () => Date;
}

const TABELA = "pncp_contratos_cache";

/** Só o que o pipe usa; objeto cortado (o banco guarda ~250 KB por órgão no máximo). */
export function enxuto(c: ContratoOrgao): ContratoOrgao {
	return { ...c, objeto: c.objeto.slice(0, 200), unidade: c.unidade.slice(0, 120) };
}

export const depsPadrao: DepsGuardados = {
	async ler(cnpj) {
		const { data, error } = await supabasePerfilAdmin.from(TABELA).select("consultado_em, contratos").eq("cnpj_orgao", cnpj).maybeSingle();
		if (error) throw new Error(error.message);
		return (data as Guardado | null) ?? null;
	},
	async gravar(cnpj, contratos, agora) {
		const linha = { cnpj_orgao: cnpj, consultado_em: agora.toISOString(), total: contratos.length, contratos: contratos.map(enxuto) };
		const { error } = await supabasePerfilAdmin.from(TABELA).upsert(linha, { onConflict: "cnpj_orgao" });
		if (error) throw new Error(error.message);
		// Limpeza: cópia com mais de 30 dias não serve nem de reserva.
		await supabasePerfilAdmin.from(TABELA).delete().lt("consultado_em", new Date(agora.getTime() - VALIDADE_RESERVA_MS).toISOString());
	},
	buscar: (cnpj, op) => buscarContratosDoOrgao(cnpj, op),
};

function idadeMs(g: Guardado, agora: Date): number {
	return agora.getTime() - new Date(g.consultado_em).getTime();
}

async function lerSemQuebrar(cnpj: string, deps: DepsGuardados): Promise<Guardado | null> {
	try {
		return await deps.ler(cnpj);
	} catch (erro) {
		console.warn(`[PNCP] Cópia guardada indisponível (${(erro as Error)?.message ?? erro}); consultando o PNCP direto.`);
		return null;
	}
}

async function gravarSemQuebrar(cnpj: string, contratos: ContratoOrgao[], agora: Date, deps: DepsGuardados): Promise<void> {
	try {
		await deps.gravar(cnpj, contratos, agora);
	} catch (erro) {
		console.warn(`[PNCP] Não foi possível guardar a cópia dos contratos (${(erro as Error)?.message ?? erro}).`);
	}
}

export async function contratosComCopia(cnpj: string, op: OpcoesContratosOrgao = {}, deps: DepsGuardados = depsPadrao): Promise<ResultadoContratos> {
	const agora = deps.agora?.() ?? new Date();
	const guardado = await lerSemQuebrar(cnpj, deps);
	if (guardado && idadeMs(guardado, agora) < VALIDADE_MS) return { contratos: guardado.contratos, origem: "guardado", guardadoEm: guardado.consultado_em };
	const reserva = guardado && idadeMs(guardado, agora) < VALIDADE_RESERVA_MS ? guardado : null;
	try {
		// Com reserva, a falha do PNCP aparece na tela como "tentando de novo", não "não respondeu".
		const contratos = await deps.buscar(cnpj, reserva ? { ...op, avisoDeFalha: "lenta" } : op);
		await gravarSemQuebrar(cnpj, contratos, agora, deps);
		return { contratos, origem: "ao_vivo", guardadoEm: null };
	} catch (erro) {
		if (reserva) return { contratos: reserva.contratos, origem: "guardado_antigo", guardadoEm: reserva.consultado_em };
		throw erro;
	}
}
