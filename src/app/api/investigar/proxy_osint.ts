import { fetchWithTimeout } from "./tse";

// ==========================================
// Proxy OSINT — Busca Indireta via APIs Federais
// ==========================================
// Como algumas Câmaras/Prefeituras não fornecem API REST acessíveis,
// fazemos varredura indireta:
//   1. CGU Portal da Transparência → pagamentos federais ao CPF/CNPJ
//   2. BrasilAPI → empresas onde o político é sócio (QSA)
// ==========================================

export interface ProxyOsintResult {
	despesasFederais: any[];
	empresasAssociadas: any[];
	statusMensagem: string;
}

async function coletarDespesasCgu(
	docLimpo: string,
	docParaCgu: string,
	usaCnpjParam: boolean,
	apiKey: string,
	nomeVereador?: string,
): Promise<{ despesas: any[]; statusParte?: string }> {
	const despesas: any[] = [];
	if (!apiKey) return { despesas };

	try {
		const paramCgu = usaCnpjParam
			? `cnpjFornecedor=${docParaCgu}&pagina=1`
			: `cpfFornecedor=${docParaCgu}&pagina=1`;
		const res = await fetchWithTimeout(
			`https://api.portaldatransparencia.gov.br/api-de-dados/despesas/por-favorecido?${paramCgu}`,
			{ headers: { "chave-api-dados": apiKey }, timeout: 8000 },
		);
		if (!res.ok) return { despesas };
		const json = await res.json();
		const items = Array.isArray(json) ? json : json.data || [];
		items.slice(0, 20).forEach((item: any) => {
			despesas.push({
				cnpjCpfFornecedor: docLimpo,
				nomeFornecedor:
					item.nomeFavorecido || item.nomeCredor || nomeVereador || "N/A",
				tipoDespesa:
					item.funcao || item.elementoDespesa || "Despesa Federal",
				valorDocumento: Number(item.valor || item.valorPago || 0),
				dataDocumento: item.data || item.dataDocumento || "2024-01-01",
				urlDocumento: "https://portaldatransparencia.gov.br/",
			});
		});
		return {
			despesas,
			statusParte: items.length > 0 ? `${items.length} pagamentos federais localizados` : undefined,
		};
	} catch {
		return { despesas };
	}
}

async function coletarSancoesCgu(
	docLimpo: string,
	apiKey: string,
): Promise<string | null> {
	if (!apiKey) return null;
	try {
		const res = await fetchWithTimeout(
			`https://api.portaldatransparencia.gov.br/api-de-dados/sancoes?cnpjSancionado=${docLimpo}&pagina=1`,
			{ headers: { "chave-api-dados": apiKey }, timeout: 5000 },
		);
		if (!res.ok) return null;
		const sancoes = await res.json();
		if (Array.isArray(sancoes) && sancoes.length > 0) {
			return `ALERTA: ${sancoes.length} sanções na CGU`;
		}
	} catch {}
	return null;
}

async function coletarContratosCompras(
	docLimpo: string,
	nomeVereador?: string,
): Promise<{ despesas: any[]; statusParte?: string }> {
	const despesas: any[] = [];
	try {
		const res = await fetchWithTimeout(
			`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${docLimpo}`,
			{ timeout: 5000 },
		);
		if (!res.ok) return { despesas };
		const comprasData = await res.json();
		const contratos = comprasData?._embedded?.contratos || [];
		contratos.slice(0, 10).forEach((c: any) => {
			despesas.push({
				cnpjCpfFornecedor: docLimpo,
				nomeFornecedor:
					c.fornecedor?.nome || nomeVereador || "Contrato Federal",
				tipoDespesa: `Contrato Federal: ${c.objeto?.substring(0, 80) || "N/I"}`,
				valorDocumento: Number(c.valorInicial || 0),
				dataDocumento: c.dataInicioVigencia || "2024-01-01",
				urlDocumento: "https://compras.dados.gov.br/",
			});
		});
		return {
			despesas,
			statusParte: contratos.length > 0 ? `${contratos.length} contratos federais` : undefined,
		};
	} catch {
		return { despesas };
	}
}

async function coletarSociosBrasilApi(
	cnpj: string,
): Promise<{ empresas: any[]; statusParte?: string }> {
	const empresas: any[] = [];
	try {
		const res = await fetchWithTimeout(
			`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
			{ timeout: 6000 },
		);
		if (!res.ok) return { empresas };
		const empresa = await res.json();
		const qsa = empresa.qsa || [];
		qsa.forEach((socio: any) => {
			empresas.push({
				nome: socio.nome_socio || "N/I",
				qualificacao: socio.qualificacao_socio || "Sócio",
				cpfCnpj: socio.cnpj_cpf_do_socio || "",
			});
		});
		if (empresa.razao_social) {
			empresas.push({
				nome: empresa.razao_social,
				qualificacao: "Empresa do CNPJ de Campanha",
				cpfCnpj: cnpj,
				capitalSocial: empresa.capital_social || 0,
				situacao: empresa.descricao_situacao_cadastral || "Ativa",
			});
			return {
				empresas,
				statusParte: `Empresa localizada: ${empresa.razao_social}`,
			};
		}
		return { empresas };
	} catch {
		return { empresas };
	}
}

function formatarStatusOsint(partes: string[]): string {
	if (partes.length > 0) {
		return `[OSINT Proxy] Varredura Federal e Societária: ${partes.join(" | ")}`;
	}
	return "API Municipal offline/fechada. Varredura Federal e Societária concluída sem achados.";
}

function extrairCnpjParaEmpresas(
	isCnpj: boolean,
	docLimpo: string,
	cnpjOpcional?: string | null,
): string | null {
	if (isCnpj) return docLimpo;
	if (cnpjOpcional) return String(cnpjOpcional).replace(/\D/g, "");
	return null;
}

function processarDespesasCgu(
	res: PromiseSettledResult<{ despesas: any[]; statusParte?: string }>,
	despesasFederais: any[],
	partes: string[],
): void {
	if (res.status === "fulfilled") {
		despesasFederais.push(...res.value.despesas);
		if (res.value.statusParte) partes.push(res.value.statusParte);
	}
}

function processarSancoesCgu(
	res: PromiseSettledResult<string | null>,
	partes: string[],
): void {
	if (res.status === "fulfilled" && res.value) {
		partes.push(res.value);
	}
}

function processarEmpresasBrasilApi(
	res: PromiseSettledResult<{ empresas: any[]; statusParte?: string }>,
	empresasAssociadas: any[],
	partes: string[],
): void {
	if (res.status === "fulfilled") {
		empresasAssociadas.push(...res.value.empresas);
		if (res.value.statusParte) partes.push(res.value.statusParte);
	}
}

function dispararConsultasProxy(
	docLimpo: string,
	cnpjParaEmpresas: string | null,
	isCnpj: boolean,
	apiKey: string,
	nomeVereador?: string,
) {
	const docParaCgu = cnpjParaEmpresas || docLimpo;
	const usaCnpj = Boolean(cnpjParaEmpresas);

	return Promise.allSettled([
		coletarDespesasCgu(docLimpo, docParaCgu, usaCnpj, apiKey, nomeVereador),
		isCnpj ? coletarSancoesCgu(docLimpo, apiKey) : Promise.resolve(null),
		isCnpj
			? coletarContratosCompras(docLimpo, nomeVereador)
			: Promise.resolve({ despesas: [] }),
		cnpjParaEmpresas
			? coletarSociosBrasilApi(cnpjParaEmpresas)
			: Promise.resolve({ empresas: [] }),
	]);
}

export async function buscarProxyOsint(
	identificador: string,
	nomeVereador?: string,
	cnpjOpcional?: string | null,
): Promise<ProxyOsintResult> {
	const docLimpo = String(identificador).replace(/\D/g, "");
	const isCnpj = docLimpo.length === 14;
	const cnpjParaEmpresas = extrairCnpjParaEmpresas(
		isCnpj,
		docLimpo,
		cnpjOpcional,
	);
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";

	console.log(
		`[PROXY OSINT] Iniciando varredura. Principal: ${docLimpo}. CNPJ Secundário: ${cnpjParaEmpresas || "Nenhum"}`,
	);

	const [resDespCgu, resSanc, resContratos, resBrasil] =
		await dispararConsultasProxy(
			docLimpo,
			cnpjParaEmpresas,
			isCnpj,
			apiKey,
			nomeVereador,
		);

	const despesasFederais: any[] = [];
	const empresasAssociadas: any[] = [];
	const partes: string[] = [];

	processarDespesasCgu(resDespCgu, despesasFederais, partes);
	processarSancoesCgu(resSanc, partes);
	processarDespesasCgu(resContratos, despesasFederais, partes);
	processarEmpresasBrasilApi(resBrasil, empresasAssociadas, partes);

	const statusMensagem = formatarStatusOsint(partes);
	console.log(
		`[PROXY OSINT] Resultado: ${despesasFederais.length} despesas, ${empresasAssociadas.length} empresas. ${statusMensagem}`,
	);

	return { despesasFederais, empresasAssociadas, statusMensagem };
}
