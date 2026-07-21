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

export async function buscarProxyOsint(
	identificador: string,
	nomeVereador?: string,
	cnpjOpcional?: string | null,
): Promise<ProxyOsintResult> {
	const docLimpo = String(identificador).replace(/\D/g, "");
	const isCnpj = docLimpo.length === 14;
	const _cpfParaSancoes = isCnpj ? null : docLimpo;
	const cnpjParaEmpresas = isCnpj
		? docLimpo
		: cnpjOpcional
			? String(cnpjOpcional).replace(/\D/g, "")
			: null;
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";

	console.log(
		`[PROXY OSINT] Iniciando varredura. Principal: ${docLimpo}. CNPJ Secundário: ${cnpjParaEmpresas || "Nenhum"}`,
	);

	const despesasFederais: any[] = [];
	const empresasAssociadas: any[] = [];
	const partes: string[] = [];

	const promessas: Promise<any>[] = [];

	// 1. CGU — Pagamentos federais ao CPF/CNPJ (fornecedor)
	if (apiKey) {
		// Tenta buscar no CNPJ de campanha se for CPF, ou usa o docLimpo original
		const docParaCgu = cnpjParaEmpresas ? cnpjParaEmpresas : docLimpo;
		const paramCgu = cnpjParaEmpresas
			? `cnpjFornecedor=${docParaCgu}&pagina=1`
			: `cpfFornecedor=${docParaCgu}&pagina=1`;
		promessas.push(
			fetchWithTimeout(
				`https://api.portaldatransparencia.gov.br/api-de-dados/despesas/por-favorecido?${paramCgu}`,
				{ headers: { "chave-api-dados": apiKey }, timeout: 8000 },
			)
				.then(async (res) => {
					if (!res.ok) return;
					const json = await res.json();
					const items = Array.isArray(json) ? json : json.data || [];
					items.slice(0, 20).forEach((item: any) => {
						despesasFederais.push({
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
					if (items.length > 0)
						partes.push(`${items.length} pagamentos federais localizados`);
				})
				.catch(() => {}),
		);

		// 1b. CGU — Sanções CNPJ
		if (isCnpj) {
			promessas.push(
				fetchWithTimeout(
					`https://api.portaldatransparencia.gov.br/api-de-dados/sancoes?cnpjSancionado=${docLimpo}&pagina=1`,
					{ headers: { "chave-api-dados": apiKey }, timeout: 5000 },
				)
					.then(async (res) => {
						if (!res.ok) return;
						const sancoes = await res.json();
						if (Array.isArray(sancoes) && sancoes.length > 0) {
							partes.push(`ALERTA: ${sancoes.length} sanções na CGU`);
						}
					})
					.catch(() => {}),
			);
		}

		// 1c. CGU — Contratos federais
		if (isCnpj) {
			promessas.push(
				fetchWithTimeout(
					`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${docLimpo}`,
					{ timeout: 5000 },
				)
					.then(async (res) => {
						if (!res.ok) return;
						const comprasData = await res.json();
						const contratos = comprasData?._embedded?.contratos || [];
						contratos.slice(0, 10).forEach((c: any) => {
							despesasFederais.push({
								cnpjCpfFornecedor: docLimpo,
								nomeFornecedor:
									c.fornecedor?.nome || nomeVereador || "Contrato Federal",
								tipoDespesa: `Contrato Federal: ${c.objeto?.substring(0, 80) || "N/I"}`,
								valorDocumento: Number(c.valorInicial || 0),
								dataDocumento: c.dataInicioVigencia || "2024-01-01",
								urlDocumento: "https://compras.dados.gov.br/",
							});
						});
						if (contratos.length > 0)
							partes.push(`${contratos.length} contratos federais`);
					})
					.catch(() => {}),
			);
		}
	}

	// 2. BrasilAPI — Empresas associadas (QSA do CNPJ)
	// Se o vereador tem um CNPJ (seja eleito ou CNPJ principal), procuramos a empresa da campanha/sócios
	if (cnpjParaEmpresas) {
		promessas.push(
			fetchWithTimeout(
				`https://brasilapi.com.br/api/cnpj/v1/${cnpjParaEmpresas}`,
				{ timeout: 6000 },
			)
				.then(async (res) => {
					if (!res.ok) return;
					const empresa = await res.json();

					// Extrai quadro societário
					const qsa = empresa.qsa || [];
					qsa.forEach((socio: any) => {
						empresasAssociadas.push({
							nome: socio.nome_socio || "N/I",
							qualificacao: socio.qualificacao_socio || "Sócio",
							cpfCnpj: socio.cnpj_cpf_do_socio || "",
						});
					});

					// A própria empresa é um achado
					if (empresa.razao_social) {
						empresasAssociadas.push({
							nome: empresa.razao_social,
							qualificacao: "Empresa do CNPJ de Campanha",
							cpfCnpj: cnpjParaEmpresas,
							capitalSocial: empresa.capital_social || 0,
							situacao: empresa.descricao_situacao_cadastral || "Ativa",
						});
						partes.push(`Empresa localizada: ${empresa.razao_social}`);
					}
				})
				.catch(() => {}),
		);
	}

	await Promise.allSettled(promessas);

	let statusMensagem: string;
	if (partes.length > 0) {
		statusMensagem = `[OSINT Proxy] Varredura Federal e Societária: ${partes.join(" | ")}`;
	} else {
		statusMensagem =
			"API Municipal offline/fechada. Varredura Federal e Societária concluída sem achados.";
	}

	console.log(
		`[PROXY OSINT] Resultado: ${despesasFederais.length} despesas, ${empresasAssociadas.length} empresas. ${statusMensagem}`,
	);

	return { despesasFederais, empresasAssociadas, statusMensagem };
}
