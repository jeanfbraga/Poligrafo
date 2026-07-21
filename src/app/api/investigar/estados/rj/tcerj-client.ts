import { fetchWithTimeout } from "../../tse";

const API_BASE = "https://dados.tcerj.tc.br/api/v1";

export interface ContratoTceRj {
	ente: string;
	numeroContrato: string;
	anoContrato: string;
	contratado: string;
	cpfCnpjContratado: string;
	objeto: string;
	tipoContrato: string;
	valorContrato: number;
	dataAssinaturaContrato: string;
	dataVencimentoContrato: string;
}

export async function buscarContratosTceRj(
	municipio: string,
	cnpjAlvos: string[],
): Promise<any[]> {
	if (!municipio) return [];

	// Formatar municipio para a API do TCE-RJ (ex: RIO DE JANEIRO)
	const municipioFormatado = municipio.replace(/-/g, " ").toUpperCase();

	const despesas: any[] = [];
	const _promessas: Promise<void>[] = [];

	try {
		const url = `${API_BASE}/contratos_municipio?municipio=${encodeURIComponent(municipioFormatado)}&limite=5000`;
		const res = await fetchWithTimeout(url, { timeout: 10000 });
		if (res.ok) {
			const data = await res.json();
			const contratos = Array.isArray(data) ? data : data.Contratos || [];

			contratos.forEach((c: any) => {
				const cnpjLimpo = (c.CNPJCPFContratado || "").replace(/\D/g, "");

				// Se o contrato for com uma empresa do vereador/prefeito (ou a sua empresa de campanha)
				if (cnpjAlvos.includes(cnpjLimpo)) {
					despesas.push({
						cnpjCpfFornecedor: cnpjLimpo,
						nomeFornecedor: c.Contratado || "N/A",
						tipoDespesa: `Contrato TCE-RJ: ${c.Objeto?.substring(0, 100) || "N/I"}`,
						valorDocumento: Number(c.ValorContrato || 0),
						dataDocumento: c.DataAssinaturaContrato || "2024-01-01",
						urlDocumento: "https://dados.tcerj.tc.br/",
					});
				}
			});
		}
	} catch (error) {
		console.error(
			`[TCE-RJ] Erro ao buscar contratos para ${municipio}:`,
			error,
		);
	}

	return despesas;
}

export async function buscarComprasDiretasTceRj(
	municipio: string,
	cnpjAlvos: string[],
): Promise<any[]> {
	if (!municipio) return [];

	const municipioFormatado = municipio.replace(/-/g, " ").toUpperCase();
	const despesas: any[] = [];

	try {
		const url = `${API_BASE}/compras_diretas_municipio?municipio=${encodeURIComponent(municipioFormatado)}&limite=5000`;
		const res = await fetchWithTimeout(url, { timeout: 10000 });
		if (res.ok) {
			const data = await res.json();
			const compras = Array.isArray(data) ? data : data.Compras || [];

			compras.forEach((c: any) => {
				const cnpjLimpo = (c.CPFCNPJFornecedor || "").replace(/\D/g, "");

				if (cnpjAlvos.includes(cnpjLimpo)) {
					despesas.push({
						cnpjCpfFornecedor: cnpjLimpo,
						nomeFornecedor: c.Fornecedor || "N/A",
						tipoDespesa: `Compra Direta TCE-RJ: ${c.Objeto?.substring(0, 100) || "N/I"}`,
						valorDocumento: Number(c.ValorTotalCompra || c.ValorProcesso || 0),
						dataDocumento: c.DataProcesso || "2024-01-01",
						urlDocumento: "https://dados.tcerj.tc.br/",
					});
				}
			});
		}
	} catch (error) {
		console.error(
			`[TCE-RJ] Erro ao buscar compras diretas para ${municipio}:`,
			error,
		);
	}

	return despesas;
}
