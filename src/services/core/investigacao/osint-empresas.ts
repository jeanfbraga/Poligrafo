/**
 * Consultas sobre o político e as empresas ligadas a ele: aeronaves (ANAC/RAB),
 * financiamentos do BNDES, certidões do TCU/CNJ/CGU e Emendas PIX recebidas diretamente.
 */
import { buscarAeronavesProprietario } from "@/services/integrations/anac/client";
import { buscarOperacoesBNDES } from "@/services/integrations/bndes/client";
import { buscarCertidaoTCU } from "@/services/integrations/tcu/client";
import { buscarEmendasPorCNPJ } from "@/services/integrations/transferegov/client";
import { type Investigacao, naMalha, status } from "./contexto";

/* ----------------------------------- ANAC ----------------------------------- */

function noAeronave(inv: Investigacao, anv: any, alvo: string) {
	return {
		id: `anac-${anv.prefixo || Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
		type: "CONTRATO" as const,
		_origemId: inv.pessoaId,
		data: {
			label: `AERONAVE ${anv.prefixo || "N/I"}`,
			objeto: `Proprietário: ${anv.proprietario_nome || alvo} | Modelo: ${anv.modelo || "N/I"} | Fabricante: ${anv.fabricante || "N/I"} | Status: ${anv.situacao || "N/I"}`,
			valor: 0,
			codigo: anv.prefixo || "ANAC",
			ano: "RAB/ANAC",
		},
	};
}

async function aeronavesDe(inv: Investigacao, alvo: string): Promise<void> {
	const aeronaves = await buscarAeronavesProprietario(alvo);
	if (aeronaves.length === 0) return;
	status(inv, `[ANAC] ${aeronaves.length} aeronave(s) localizada(s) vinculada(s) a "${alvo}"!`);
	for (const anv of aeronaves) naMalha(inv, noAeronave(inv, anv, alvo));
}

/** E. ANAC/RAB: aeronaves no nome do político ou das empresas dele, em paralelo. */
export async function aeronaves(inv: Investigacao, cnpjs: string[]): Promise<void> {
	status(inv, "Varrendo Registro Aeronáutico Brasileiro (ANAC/RAB) por aeronaves vinculadas em paralelo...");
	await Promise.allSettled([inv.dep.nome, ...cnpjs].map((alvo) => aeronavesDe(inv, alvo)));
}

/* ----------------------------------- BNDES ---------------------------------- */

function noBndes(cnpj: string, ops: any[], total: number) {
	return {
		id: `bndes-${cnpj}-${Date.now()}`,
		type: "CONTRATO" as const,
		_origemId: `empresa-${cnpj}`,
		data: {
			label: `Financiamento BNDES (${ops.length} op.)`,
			objeto: ops.slice(0, 3).map((o) => `${o.produto || "N/I"} — ${o.situacao || "N/I"}`).join(" | "),
			valor: total,
			codigo: cnpj,
			ano: ops[0]?.data || "N/I",
			score_letalidade: 55,
			motivo_ia: `Empresa vinculada ao político recebeu financiamento subsidiado do BNDES.`,
		},
	};
}

function emitirBndes(inv: Investigacao, cnpj: string, res: PromiseSettledResult<any[]>): void {
	if (res.status !== "fulfilled" || !res.value || res.value.length === 0) return;
	const ops = res.value;
	const total = ops.reduce((acc, op) => acc + (op.valor || 0), 0);
	status(inv, `[BNDES] ${ops.length} operação(ões) de financiamento para o CNPJ ${cnpj}. Total: R$ ${total.toLocaleString("pt-BR")}`);
	naMalha(inv, noBndes(cnpj, ops, total));
}

/** E2. BNDES: financiamentos das (até 5) empresas vinculadas. */
export async function financiamentosBndes(inv: Investigacao, cnpjs: string[]): Promise<void> {
	if (cnpjs.length === 0) return;
	status(inv, "Consultando financiamentos do BNDES para empresas vinculadas ao político...");
	try {
		const alvos = cnpjs.slice(0, 5);
		const resultados = await Promise.allSettled(alvos.map((cnpj) => buscarOperacoesBNDES(cnpj)));
		resultados.forEach((res, i) => emitirBndes(inv, alvos[i], res));
	} catch (err: any) {
		console.warn("[BNDES] Erro ao consultar financiamentos:", err.message || err);
	}
}

/* ------------------------------------ TCU ----------------------------------- */

const SITUACOES: [string, string][] = [
	["situacaoTcu", "TCU Inidôneos"],
	["situacaoCnj", "CNJ CNIA"],
	["situacaoCeis", "CGU CEIS"],
	["situacaoCnep", "CGU CNEP"],
];

function motivosDaCertidao(certidao: any): string[] {
	return SITUACOES.filter(([campo]) => certidao[campo] !== "NADA_CONSTA").map(([campo, rotulo]) => `${rotulo}: ${certidao[campo]}`);
}

async function certidaoDe(inv: Investigacao, cnpj: string): Promise<void> {
	try {
		const certidao = await buscarCertidaoTCU(cnpj);
		if (!certidao?.temInfracao) return;
		naMalha(inv, {
			id: `tcu-certidao-${cnpj}-${Date.now()}`,
			type: "PROCESSO_JUDICIAL" as const,
			_origemId: inv.pessoaId,
			data: {
				label: `Certidão Positiva APF: ${cnpj}`,
				tribunal: "TCU (Certidão Consolidada)",
				assunto: "Restrição em Base Federal",
				score_letalidade: 85,
				motivo_ia: `Empresa vinculada possui restrições ativas. Registros: ${motivosDaCertidao(certidao).join(" | ")}`,
			},
		});
	} catch (err: any) {
		console.warn("[TCU] Erro ao buscar certidão para empresa:", err.message || err);
	}
}

/** E5. TCU: certidões APF das empresas vinculadas, uma por vez. */
export async function certidoesTcu(inv: Investigacao, cnpjs: string[]): Promise<void> {
	if (cnpjs.length === 0) return;
	status(inv, "Consultando certidões unificadas no TCU para empresas...");
	for (const cnpj of cnpjs) await certidaoDe(inv, cnpj);
}

/* ------------------------- Emendas PIX para empresa ------------------------- */

async function emendasDiretasDe(inv: Investigacao, cnpj: string): Promise<void> {
	try {
		const emendas = await buscarEmendasPorCNPJ(cnpj);
		if (!emendas || emendas.length === 0) return;
		const total = emendas.reduce((acc, e) => acc + (e.valorCusteio || 0) + (e.valorInvestimento || 0), 0);
		naMalha(inv, {
			id: `emenda-pix-${cnpj}-${Date.now()}`,
			type: "CONTRATO" as const,
			_origemId: inv.pessoaId,
			data: {
				label: `Recebedor de Emenda PIX: ${cnpj}`,
				objeto: `Foram localizadas ${emendas.length} emendas destinadas DIRETAMENTE para esta empresa.`,
				valor: total,
				codigo: "TRANSFEREGOV",
				ano: emendas[0].ano || "N/I",
				score_letalidade: 95,
				// RED FLAG: Empresa ligada ao político recebendo emenda direta!
				motivo_ia: `ALERTA MÁXIMO: Uma empresa ligada diretamente ao político investigado está recebendo recursos públicos via Emendas PIX ou Transferências Especiais.`,
			},
		});
	} catch (err: any) {
		console.warn("[TransfereGov] Erro ao buscar emendas para empresa:", err.message || err);
	}
}

/** E7. TransfereGov: empresas vinculadas que recebem Emendas PIX diretamente. */
export async function emendasPixParaEmpresas(inv: Investigacao, cnpjs: string[]): Promise<void> {
	if (cnpjs.length === 0) return;
	status(inv, "Verificando se empresas vinculadas são beneficiárias diretas de Emendas PIX...");
	for (const cnpj of cnpjs) await emendasDiretasDe(inv, cnpj);
}
