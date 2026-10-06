import { primeiroValor } from "@/lib/valores";
import { fetchWithTimeout } from "../../../app/api/investigar/tse";

const TCU_CONTAS_ORDS = "https://contas.tcu.gov.br/ords";
const TCU_CERTIDOES = "https://certidoes-apf.apps.tcu.gov.br/api/rest/publico";

export interface InabilitadoTCU {
	nome: string;
	cpf: string;
	motivo?: string;
	dataInicio?: string;
	dataFim?: string;
	deliberacao?: string;
}

export interface CadirregTCU {
	nome: string;
	cpf: string;
	processo?: string;
	situacao?: string;
}

export interface CertidaoTCU {
	cnpj: string;
	situacaoTcu: string;
	situacaoCnj: string;
	situacaoCeis: string;
	situacaoCnep: string;
	temInfracao: boolean;
}

function mapearInabilitado(item: any, cpfLimpo: string): InabilitadoTCU {
	return {
		nome: primeiroValor(item.nome, item.nomeResponsavel),
		cpf: primeiroValor(item.cpf, item.cpfResponsavel, cpfLimpo),
		motivo: item.processo ? `Processo TCU ${item.processo}` : primeiroValor(item.descricaoFundamento),
		dataInicio: primeiroValor(item.datatransitojulgado, item.data_transito_julgado, item.dataInicioInabilitacao),
		dataFim: primeiroValor(item.data_final, item.dataFimInabilitacao),
		deliberacao: primeiroValor(item.deliberacao, item.numeroDeliberacao),
	};
}

/** Só o próprio CPF (se a fonte ignorar o filtro, não traz inabilitado de outra pessoa). */
function doMesmoCpf(item: any, cpfLimpo: string): boolean {
	const cpfItem = String(item.cpf || item.cpfResponsavel || "").replace(/\D/g, "");
	return !cpfItem || cpfItem === cpfLimpo;
}

// 1. Inabilitados: GET contas.tcu.gov.br/ords/condenacao/consulta/inabilitados/{cpf}
// O host dados-abertos.apps.tcu.gov.br passou a devolver página antirrobô no lugar
// do JSON (canário de 06/10/2026); o ORDS responde { items: [...] }.
export async function buscarInabilitadosTCU(
	cpf: string,
): Promise<InabilitadoTCU[]> {
	const cpfLimpo = cpf.replace(/\D/g, "");
	try {
		const url = `${TCU_CONTAS_ORDS}/condenacao/consulta/inabilitados/${cpfLimpo}`;
		const res = await fetchWithTimeout(url, { timeout: 6000 });
		if (!res.ok) {
			if (res.status === 404) return [];
			throw new Error(`TCU Inabilitados HTTP ${res.status}`);
		}
		const data = await res.json();
		const lista = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
		return lista.filter((item: any) => doMesmoCpf(item, cpfLimpo)).map((item: any) => mapearInabilitado(item, cpfLimpo));
	} catch (e: any) {
		console.warn(
			`[TCU] Erro ao buscar inabilitados para ${cpfLimpo}:`,
			e.message || e,
		);
		return [];
	}
}

// 2. CADIRREG: GET /recuperapessoacadirreg/{cpf}
export async function buscarCadirregTCU(cpf: string): Promise<CadirregTCU[]> {
	const cpfLimpo = cpf.replace(/\D/g, "");
	try {
		const url = `${TCU_CONTAS_ORDS}/recuperapessoacadirreg/${cpfLimpo}`;
		const res = await fetchWithTimeout(url, { timeout: 6000 });
		if (!res.ok) {
			if (res.status === 404) return [];
			throw new Error(`TCU CADIRREG HTTP ${res.status}`);
		}
		const data = await res.json();
		// A API ORDS geralmente retorna os itens dentro de 'items'
		const items = data.items || [];

		return items.map((item: any) => ({
			nome: item.NOME || "",
			cpf: item.CPF_CNPJ || cpfLimpo,
			processo: item.PROCESSO || "",
			situacao: item.SITUACAO || "",
		}));
	} catch (e: any) {
		console.warn(
			`[TCU] Erro ao buscar CADIRREG para ${cpfLimpo}:`,
			e.message || e,
		);
		return [];
	}
}

function parseCertidaoTCU(data: any, cnpjLimpo: string): CertidaoTCU {
	const situacaoTcu = data.situacaoTcu ?? "NADA_CONSTA";
	const situacaoCnj = data.situacaoCnj ?? "NADA_CONSTA";
	const situacaoCeis = data.situacaoCeis ?? "NADA_CONSTA";
	const situacaoCnep = data.situacaoCnep ?? "NADA_CONSTA";

	const situacoes = [situacaoTcu, situacaoCnj, situacaoCeis, situacaoCnep];
	const temInfracao = situacoes.some((s) => s !== "NADA_CONSTA");

	return {
		cnpj: cnpjLimpo,
		situacaoTcu,
		situacaoCnj,
		situacaoCeis,
		situacaoCnep,
		temInfracao,
	};
}

function logErroTCU(e: any, cnpjLimpo: string) {
	if (e.name === "AbortError" || e.code === 20) {
		console.warn(`[TCU] Timeout ao buscar certidão para ${cnpjLimpo}.`);
	} else {
		console.warn(
			`[TCU] Erro ao buscar certidão para ${cnpjLimpo}:`,
			e?.message ?? e,
		);
	}
}

// 3. Certidões APF: GET /certidoes/{cnpj}
export async function buscarCertidaoTCU(
	cnpj: string,
): Promise<CertidaoTCU | null> {
	const cnpjLimpo = cnpj.replace(/\D/g, "");
	try {
		const url = `${TCU_CERTIDOES}/certidoes/${cnpjLimpo}`;
		const res = await fetchWithTimeout(url, { timeout: 6000 });
		if (!res.ok) {
			if (res.status === 404) return null;
			throw new Error(`TCU Certidões HTTP ${res.status}`);
		}
		const data = await res.json();
		return parseCertidaoTCU(data, cnpjLimpo);
	} catch (e: any) {
		logErroTCU(e, cnpjLimpo);
		return null;
	}
}
