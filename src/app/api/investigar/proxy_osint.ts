import { buscarContratosPorFornecedor } from "@/services/integrations/contratos/fornecedor";
import { buscarPagamentosFederais } from "@/services/integrations/transparencia/pagamentos";
import { buscarSancoesEmpresa } from "@/services/integrations/transparencia/sancoes-empresa";
import { buscarDadosCnpj } from "@/services/integrations/receita/cnpj";

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
	apiKey: string,
	nomeVereador?: string,
): Promise<{ despesas: any[]; statusParte?: string }> {
	if (!apiKey) return { despesas: [] };
	// Endpoint certo: /despesas/documentos-por-favorecido?codigoPessoa= (o antigo /por-favorecido dava 403).
	try {
		const ano = new Date().getFullYear();
		const pagamentos = await buscarPagamentosFederais(docParaCgu || docLimpo, [ano, ano - 1], apiKey);
		const despesas = pagamentos.slice(0, 20).map((p) => ({
			cnpjCpfFornecedor: docLimpo,
			nomeFornecedor: p.favorecido || nomeVereador || "N/A",
			tipoDespesa: [p.funcao, p.programa].filter(Boolean).join(" — ") || "Pagamento federal",
			valorDocumento: p.valor,
			dataDocumento: p.data ?? "",
			orgao: p.orgao || null,
			numeroDocumento: p.documento || null,
			urlDocumento: "https://portaldatransparencia.gov.br/despesas/favorecido",
		}));
		return {
			despesas,
			statusParte: pagamentos.length > 0 ? `${pagamentos.length} pagamentos federais localizados` : undefined,
		};
	} catch {
		return { despesas: [] };
	}
}

async function coletarSancoesCgu(
	docLimpo: string,
	apiKey: string,
): Promise<string | null> {
	if (!apiKey) return null;
	try {
		// CEIS/CNEP/CEPIM: o antigo /sancoes?cnpjSancionado= não existe.
		const sancoes = await buscarSancoesEmpresa(docLimpo, apiKey);
		if (sancoes.length > 0) return `ALERTA: ${sancoes.length} sanções na CGU`;
	} catch {}
	return null;
}

async function coletarContratosCompras(
	docLimpo: string,
	nomeVereador?: string,
): Promise<{ despesas: any[]; statusParte?: string }> {
	const despesas: any[] = [];
	try {
		// Contratos federais em que o documento é fornecedor (CGU; compras.dados legado não existe mais).
		const contratos = await buscarContratosPorFornecedor(docLimpo, { paginasCgu: 1, paginasPncp: 0 });
		contratos.slice(0, 10).forEach((c) => {
			despesas.push({
				cnpjCpfFornecedor: docLimpo,
				nomeFornecedor: c.nomeFornecedor || nomeVereador || "Contrato Federal",
				tipoDespesa: `Contrato Federal: ${c.objetoContrato.substring(0, 80) || "N/I"}`,
				valorDocumento: c.valorGlobal,
				dataDocumento: c.dataAssinatura || "",
				urlDocumento: c.url || "https://portaldatransparencia.gov.br/contratos",
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
		// BrasilAPI com reserva no Minha Receita e fila (receita/cnpj.ts).
		const res = await buscarDadosCnpj(cnpj);
		if (!res.ok) return { empresas };
		const empresa: any = res.dados;
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
		coletarDespesasCgu(docLimpo, docParaCgu, apiKey, nomeVereador),
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
