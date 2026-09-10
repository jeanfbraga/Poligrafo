import { primeiroValorNumero, primeiroValorTexto } from "@/lib/utils";
import { fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Piauí (PI)
// Engenharia Reversa do pacote mcp-brasil
// Foco: Despesas e Credores por Município
// ==========================================

const API_BASE = "https://sistemas.tce.pi.gov.br/api/portaldacidadania";
const TIMEOUT_PI = 15000;

let prefeiturasCachePI: Record<string, number> | null = null;

function parseCredorPI(c: any, anoAtual: number) {
	const nome = primeiroValorTexto(c.nome, c.nomeCredor, "N/I");
	const valor = primeiroValorNumero(c.valorPago, c.valor);
	return {
		tipoDespesa: "Credor Municipal (TCE-PI)",
		fornecedor: nome,
		cnpjFornecedor: primeiroValorTexto(c.cpfCnpj, c.documento),
		valorLiquido: valor,
		dataDocumento: `${anoAtual}`,
		descricao: `CREDOR: ${nome} | Valor Pago: R$ ${valor}`,
		urlDocumento: `https://sistemas.tce.pi.gov.br`,
	};
}

export async function buscarIdPrefeituraPI(
	nomeMunicipio: string,
): Promise<number | null> {
	const nomeLimpo = nomeMunicipio.toLowerCase().trim();

	if (!prefeiturasCachePI) {
		try {
			const res = await fetchWithTimeout(`${API_BASE}/prefeituras`, {
				timeout: TIMEOUT_PI,
			});
			if (!res.ok) throw new Error(`Status ${res.status}`);
			const data = await res.json();
			prefeiturasCachePI = {};
			(Array.isArray(data) ? data : []).forEach((p: any) => {
				if (p.nome && p.id) {
					prefeiturasCachePI![p.nome.toLowerCase().trim()] = p.id;
				}
			});
		} catch (e) {
			console.warn(`[TCE-PI] Falha ao carregar prefeituras:`, e);
			return null;
		}
	}
	return prefeiturasCachePI[nomeLimpo] || null;
}

export async function buscarCredoresPI(
	idUnidade: number,
	exercicio: number,
): Promise<any[]> {
	const url = `${API_BASE}/credores/${idUnidade}/${exercicio}`;
	try {
		const res = await fetchWithTimeout(url, { timeout: TIMEOUT_PI });
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data) ? data : [];
	} catch (e) {
		console.warn(`[TCE-PI] Falha ao buscar credores:`, e);
		return [];
	}
}

export async function buscarDespesasPI(
	municipioNome: string,
	casa: string,
): Promise<any[]> {
	console.log(
		`[TCE-PI] Iniciando extração nativa para ${casa} de ${municipioNome}`,
	);

	const idPrefeitura = await buscarIdPrefeituraPI(
		municipioNome.replace(/-/g, " "),
	);
	if (!idPrefeitura) {
		console.warn(`[TCE-PI] Município ${municipioNome} não localizado.`);
		return [];
	}

	const anoAtual = new Date().getFullYear();
	let credores = await buscarCredoresPI(idPrefeitura, anoAtual);
	if (!credores || credores.length === 0) {
		console.log(
			`[TCE-PI] Sem credores em ${anoAtual}. Tentando ${anoAtual - 1}...`,
		);
		credores = await buscarCredoresPI(idPrefeitura, anoAtual - 1);
	}
	if (!credores || credores.length === 0) {
		console.log(
			`[TCE-PI] Sem credores em ${anoAtual - 1}. Tentando ${anoAtual - 2}...`,
		);
		credores = await buscarCredoresPI(idPrefeitura, anoAtual - 2);
	}

	const formatados: any[] = credores.map((c: any) =>
		parseCredorPI(c, anoAtual),
	);

	console.log(
		`[TCE-PI] Extração concluída. Total de credores para IA: ${formatados.length}`,
	);
	return formatados;
}
