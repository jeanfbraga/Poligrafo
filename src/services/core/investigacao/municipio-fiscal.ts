/**
 * Prefeito: saúde fiscal do município (LRF, SICONFI do Tesouro) e repasses da educação
 * (FNDE: PNAE, FUNDEB, PNATE).
 */
import { consultarFUNDEB, consultarPNAE, consultarPNATE } from "@/services/integrations/fnde/client";
import { buscarEnteSiconfi, consultarIndicadoresLRF } from "@/services/integrations/siconfi/client";
import { type Investigacao, naMalha, status } from "./contexto";

function municipioAlvo(dep: any): string {
	return dep._nomeMunicipio || dep.nome;
}

/* --------------------------------- SICONFI --------------------------------- */

const MENSAGEM_LRF: Record<string, (pct: string, limite: number) => string> = {
	EXCEDIDO: (pct, limite) => `[ALERTA CRÍTICO LRF] Limite de gasto com pessoal EXCEDIDO: ${pct}% da RCL (limite: ${limite}%)`,
	PRUDENCIAL: (pct) => `[ALERTA LRF] Gasto com pessoal no limite prudencial: ${pct}% da RCL`,
	ALERTA: (pct) => `[AVISO LRF] Gasto com pessoal em nível de alerta: ${pct}% da RCL`,
};
const SCORE_LRF: Record<string, number> = { EXCEDIDO: 85, PRUDENCIAL: 65 };

function mensagemLrf(ind: any, pct: string): string {
	const montar = MENSAGEM_LRF[ind.situacaoLimite];
	return montar ? montar(pct, ind.limiteMaximoPercentual) : `[SICONFI] Gasto com pessoal dentro do limite LRF: ${pct}% da RCL`;
}

function noLrf(inv: Investigacao, ente: any, ind: any, pct: string) {
	return {
		id: `siconfi-${ente.cod_ibge}-${Date.now()}`,
		type: "PROCESSO_JUDICIAL" as const,
		_origemId: inv.pessoaId,
		data: {
			label: `Saúde Fiscal LRF: ${ente.ente}`,
			tribunal: "Tesouro Nacional (SICONFI)",
			assunto: `Despesa com Pessoal ${pct}% — ${ind.situacaoLimite}`,
			score_letalidade: SCORE_LRF[ind.situacaoLimite] ?? 45,
			motivo_ia: `O município ${ente.ente}/${ente.uf} está com despesa de pessoal em ${pct}% da Receita Corrente Líquida (RCL: R$ ${ind.receitaCorrenteLiquidaAjustada.toLocaleString("pt-BR")}). Limite máximo LRF: ${ind.limiteMaximoPercentual}%.`,
		},
	};
}

async function saudeFiscal(inv: Investigacao): Promise<void> {
	status(inv, "Consultando indicadores fiscais LRF do município no SICONFI (Tesouro Nacional)...");
	try {
		const ente = await buscarEnteSiconfi(inv.dep.uf, municipioAlvo(inv.dep));
		if (!ente) return;
		const ind = await consultarIndicadoresLRF(ente.cod_ibge, new Date().getFullYear());
		if (!ind) return;
		const pct = ind.percentualDespesaPessoal.toFixed(1);
		const msg = mensagemLrf(ind, pct);
		status(inv, msg);
		if (ind.situacaoLimite === "NORMAL") return;
		// O nó PESSOA aponta para o mesmo array de alertas: o alerta aparece nele também.
		inv.ficha.alertasPessoais.push(msg);
		naMalha(inv, noLrf(inv, ente, ind, pct));
	} catch (err: any) {
		console.warn("[SICONFI] Erro ao consultar indicadores LRF:", err.message || err);
	}
}

/* ----------------------------------- FNDE ----------------------------------- */

function textosFnde(pnae: any[], fundeb: any[], pnate: any[]): string[] {
	const textos = [
		pnae.length > 0 ? `PNAE (Merenda): R$ ${(pnae[0].valorFnde || 0).toLocaleString("pt-BR")} para ${pnae[0].totalAlunos} alunos.` : "",
		fundeb.length > 0 ? `FUNDEB: R$ ${(fundeb[0].valorRepasseEstimado || 0).toLocaleString("pt-BR")} (Est.) para ${fundeb[0].quantidadeMatriculas} matrículas.` : "",
		pnate.length > 0 ? `PNATE (Transporte): Atende ${pnate[0].alunosAtendidos} alunos.` : "",
	];
	return textos.filter(Boolean);
}

async function repassesFnde(inv: Investigacao): Promise<void> {
	status(inv, "Consultando repasses educacionais do FNDE (PNAE/FUNDEB/PNATE)...");
	try {
		const municipio = municipioAlvo(inv.dep);
		const ano = new Date().getFullYear();
		const [pnae, fundeb, pnate] = await Promise.all([
			consultarPNAE(municipio, inv.dep.uf, ano),
			consultarFUNDEB(municipio, inv.dep.uf, ano),
			consultarPNATE(inv.dep.uf, municipio), // PNATE usa uf, municipio
		]);
		const textos = textosFnde(pnae, fundeb, pnate);
		if (textos.length === 0) return;
		naMalha(inv, {
			id: `fnde-${inv.dep.uf}-${Date.now()}`,
			type: "CONTRATO" as const,
			_origemId: inv.pessoaId,
			data: {
				label: `Repasses FNDE (${ano})`,
				objeto: textos.join(" | "),
				valor: (pnae[0]?.valorFnde || 0) + (fundeb[0]?.valorRepasseEstimado || 0),
				codigo: "FNDE",
				ano: ano.toString(),
				score_letalidade: 30,
				// Informativo contextual
				motivo_ia: `O município recebe repasses federais da educação (FNDE). Cruzamentos futuros podem verificar se há empresas financiadas desviando estes recursos.`,
			},
		});
	} catch (err: any) {
		console.warn("[FNDE] Erro ao consultar repasses:", err.message || err);
	}
}

/** E3 e E6: só prefeito com UF. */
export async function indicadoresDoMunicipio(inv: Investigacao): Promise<void> {
	if (inv.dep.casa !== "PREFEITURA" || !inv.dep.uf) return;
	await saudeFiscal(inv);
	await repassesFnde(inv);
}
