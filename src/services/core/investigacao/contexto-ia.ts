/**
 * Contexto textual para a triagem da IA (nós `_isContextOnly`, não vão à tela): projetos de
 * lei do deputado, contratos dos financiadores no PNCP e votos em pautas ligadas a doadores
 * (estes também viram nós na tela).
 */
import { buscarProjetosLeiCamara } from "@/app/api/investigar/scrapers/legislativo";
import { buscarContratosPNCP } from "@/app/api/investigar/scrapers/osint-contratos";
import { analisarConflitoVotacoes } from "@/services/integrations/camara/conflito-legislativo";
import { type Investigacao, naTela, status } from "./contexto";

async function projetosDeLei(inv: Investigacao): Promise<any[]> {
	status(inv, `Extraindo Projetos de Lei e Histórico Legislativo...`);
	return inv.dep.casa === "CAMARA" ? buscarProjetosLeiCamara(inv.dep.id) : [];
}

/** Doadores no formato string de CNPJ/CPF: até 5 CNPJs. */
function cnpjsDosDoadores(doadores: any[]): string[] {
	if (!Array.isArray(doadores) || doadores.length === 0 || typeof doadores[0] !== "string") return [];
	return [...new Set(doadores as string[])].filter((d) => d.length === 14).slice(0, 5);
}

async function contratosDosFinanciadores(inv: Investigacao, doadores: any[]): Promise<{ cnpj: string; contratos: any[] }[]> {
	status(inv, `Cruzando Financiadores no Portal Nacional de Contratações (PNCP)...`);
	const achados: { cnpj: string; contratos: any[] }[] = [];
	await Promise.allSettled(
		cnpjsDosDoadores(doadores).map((cnpj) =>
			buscarContratosPNCP(cnpj).then((contratos) => {
				if (contratos.length > 0) achados.push({ cnpj, contratos });
			}),
		),
	);
	return achados;
}

/** Injeta na malha como NÓS DE CONTEXTO TEXTUAL para a IA consumir. */
function injetarContexto(inv: Investigacao, projetos: any[], contratosPNCP: { cnpj: string; contratos: any[] }[]): void {
	if (projetos.length > 0) inv.malha.push({ _isContextOnly: true, tipoContexto: "PROJETOS_LEI_AUTORIA", projetos });
	if (contratosPNCP.length === 0) return;
	inv.malha.push({ _isContextOnly: true, tipoContexto: "CONTRATOS_MUNICIPAIS_DOADORES", contratosPNCP });
	status(inv, `[OSINT] Localizados contratos municipais atrelados a financiadores recobrindo a malha na IA!`);
}

function noConflito(inv: Investigacao, conf: any) {
	return {
		id: `conflito-voto-${conf.idVotacao}-${Date.now()}`,
		type: "CONTRATO" as const,
		_origemId: inv.pessoaId,
		data: {
			label: `VOTO EM PAUTA SETORIAL: ${conf.projetoTema}`,
			objeto: `${conf.motivoConflito} (Voto: ${conf.voto})`,
			valor: 0,
			codigo: conf.idVotacao,
			ano: conf.dataVotacao ? conf.dataVotacao.substring(0, 4) : "Legislatura",
			score_letalidade: 80,
			motivo_ia: conf.motivoConflito,
		},
	};
}

/** Cruzamento de votos com doadores de campanha (conflito de interesse legislativo). */
async function conflitosDeVotacao(inv: Investigacao, doadores: any[]): Promise<void> {
	if (inv.dep.casa !== "CAMARA" || !Array.isArray(doadores) || doadores.length === 0) return;
	const conflitos = await analisarConflitoVotacoes(Number(inv.dep.id), doadores);
	if (conflitos.length === 0) return;
	status(inv, `[CONFLITO LEGISLATIVO] Identificados ${conflitos.length} voto(s) em matérias setoriais ligadas a financiadores de campanha!`);
	inv.malha.push({ _isContextOnly: true, tipoContexto: "CONFLITOS_VOTACOES_DOADORES", conflitos });
	for (const conf of conflitos) naTela(inv, noConflito(inv, conf));
}

export async function contextoParaIA(inv: Investigacao, doadores: any[]): Promise<void> {
	const projetos = await projetosDeLei(inv);
	const contratosPNCP = await contratosDosFinanciadores(inv, doadores);
	injetarContexto(inv, projetos, contratosPNCP);
	await conflitosDeVotacao(inv, doadores);
}
