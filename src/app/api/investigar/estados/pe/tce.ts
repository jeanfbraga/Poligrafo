import { buscarCpfNoTSE, fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Pernambuco
// Engenharia Reversa do pacote mcp-brasil
// ==========================================

const API_BASE_PE = "https://sistemas.tce.pe.gov.br/DadosAbertos";
const PARAMS_TIMEOUT = 12000;
// O endpoint de Contratos devolve um dump JSON único (Recife/Esfera M ≈ 12 MB).
// Lemos em streaming e extraímos as linhas (objetos flat) incrementalmente.
const MAX_BYTES_STREAM = 20 * 1024 * 1024;

// ATENÇÃO: os query params da API Audin/TCE-PE são case-sensitive
// ("Municipio", "AnoReferencia", "Esfera"). Versões em MAIÚSCULAS são
// silenciosamente ignoradas e a API devolve o dump completo (100k linhas).
// O endpoint "DespesasMunicipais!json" está indisponível (conexão pendurada,
// sem resposta mesmo após 25s) — por isso usamos apenas "Contratos".

type LinhaContratoPE = {
	RazaoSocial?: string;
	CPF_CNPJ?: string;
	NumeroDocumentoAjustado?: string;
	Objeto?: string;
	Valor?: string;
	UnidadeGestora?: string;
	AnoContrato?: string;
	Vigencia?: string;
	Situacao?: string;
	Estagio?: string;
	Esfera?: string;
	Municipio?: string;
	LinkArquivo?: string;
};

/** Lê o dump JSON da API em streaming e extrai linhas flat ({...}) uma a uma. */
async function varrerContratosPE(
	url: string,
	aceitar: (row: LinhaContratoPE) => boolean,
	limiteLinhas: number,
): Promise<LinhaContratoPE[]> {
	const res = await fetchWithTimeout(url, { timeout: 60000 });
	if (!res.ok || !res.body) return [];

	const reader = res.body.getReader();
	const decoder = new TextDecoder("iso-8859-1");
	const coletadas: LinhaContratoPE[] = [];
	let buffer = "";
	let bytesLidos = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytesLidos += value.length;
			buffer += decoder.decode(value, { stream: true });

			// As linhas de "conteudo" são objetos JSON flat (sem chaves aninhadas).
			const re = /\{[^{}]*\}/g;
			let m: RegExpExecArray | null;
			let consumidoAte = 0;
			while ((m = re.exec(buffer))) {
				consumidoAte = re.lastIndex;
				if (coletadas.length >= limiteLinhas) break;
				try {
					const row = JSON.parse(m[0]) as LinhaContratoPE;
					if (row && (row.Objeto || row.RazaoSocial) && aceitar(row)) {
						coletadas.push(row);
					}
				} catch {
					// fragmento inválido — ignora
				}
			}
			buffer = buffer.slice(consumidoAte);

			if (coletadas.length >= limiteLinhas || bytesLidos >= MAX_BYTES_STREAM) {
				await reader.cancel();
				break;
			}
		}
	} finally {
		reader.releaseLock();
	}

	return coletadas;
}

function docLimpoDe(row: LinhaContratoPE): string {
	const bruto = String(row.NumeroDocumentoAjustado || row.CPF_CNPJ || "");
	// TCE-PE mascara CPFs ("***.***.274-68") — nesse caso não há documento
	// aproveitável para correlação; devolver vazio em vez de dígitos parciais.
	if (bruto.includes("*")) return "";
	return bruto.replace(/\D/g, "");
}

function mapearContratoPE(c: LinhaContratoPE) {
	const doc = docLimpoDe(c);
	return {
		cnpjCpfFornecedor: doc,
		nomeFornecedor: (c.RazaoSocial || "").trim() || "Não Identificado",
		tipoDespesa: `Contrato: ${c.Objeto || "N/I"} (UG: ${c.UnidadeGestora || "N/I"})`,
		valorDocumento: Number(c.Valor || 0),
		dataDocumento: `${c.AnoContrato || new Date().getFullYear()}-01-01`,
		urlDocumento: c.LinkArquivo || "https://sistemas.tce.pe.gov.br/",
	};
}

export async function buscarMunicipalPE(nomeBuscado: string): Promise<
	{
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		isCnpj?: boolean;
		casa: "CAMARA_MUNICIPAL" | "PREFEITURA";
		uri?: string;
	}[]
> {
	const termo = nomeBuscado.toLowerCase().trim();
	console.log(
		`[>> MUNICIPAL PE ENTRY] buscarMunicipalPE chamado para: ${nomeBuscado}`,
	);
	const resultados: any[] = [];

	// Tenta achar Vereador (13)
	let tseResult = await buscarCpfNoTSE(termo, "PE", "13");
	let tipoCargo: "CAMARA_MUNICIPAL" | "PREFEITURA" = "CAMARA_MUNICIPAL";
	let tituloCargo = "Vereador";

	if (!tseResult) {
		// Tenta achar Prefeito (11)
		tseResult = await buscarCpfNoTSE(termo, "PE", "11");
		if (tseResult) {
			tipoCargo = "PREFEITURA";
			tituloCargo = "Prefeito";
		}
	}

	if (tseResult) {
		const nomeCompleto =
			tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
		const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
		const nomeExibicao =
			nomeUrna && nomeUrna !== nomeCompleto
				? `${nomeCompleto} (${nomeUrna})`
				: nomeCompleto;
		resultados.push({
			ref: `PE:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
			id: tseResult.documentoPrincipal,
			nome: nomeExibicao,
			cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, " ").toUpperCase()}`,
			uf: "PE",
			isCnpj: tseResult.isCnpj,
			casa: tipoCargo,
			uri: tseResult.municipio,
		});
	}

	return resultados;
}

export async function buscarDespesasMunicipalPE(
	identificador: string,
	nomeParaBusca?: string,
	municipioUri?: string,
	casa?: string,
): Promise<any[]> {
	const docLimpo = String(identificador).replace(/\D/g, "");
	const anoAtual = new Date().getFullYear();

	try {
		// Lógica Inteligente para Prefeitos: contratos do EXECUTIVO municipal
		if (casa === "PREFEITURA" && municipioUri) {
			const municipioAjustado = municipioUri.replace(/-/g, " ");
			console.log(
				`[TCE-PE] Alvo é PREFEITO. Buscando contratos da esfera municipal para: ${municipioAjustado.toUpperCase()}...`,
			);

			const urlContratos = `${API_BASE_PE}/Contratos!json?Municipio=${encodeURIComponent(municipioAjustado)}&AnoReferencia=${anoAtual}&Esfera=M`;
			const linhas = await varrerContratosPE(
				urlContratos,
				(row) =>
					(row.Esfera || "").trim().toUpperCase() === "M" &&
					/prefeitura/i.test(row.UnidadeGestora || "") &&
					Number(row.Valor || 0) > 0,
				500,
			);

			return linhas
				.sort((a, b) => Number(b.Valor || 0) - Number(a.Valor || 0))
				.slice(0, 20)
				.map((c) => mapearContratoPE(c));
		}

		// Lógica Padrão: contratos pelo CPF/CNPJ do alvo (empresas, vereadores).
		// A API ignora filtro de documento no servidor, então filtramos localmente
		// no dump da esfera municipal (CPFs vêm mascarados pelo TCE — nesse caso
		// o resultado honesto é vazio; CNPJs casam normalmente).
		const municipioFiltro = municipioUri
			? `&Municipio=${encodeURIComponent(municipioUri.replace(/-/g, " "))}`
			: "";
		const urlContratos = `${API_BASE_PE}/Contratos!json?AnoReferencia=${anoAtual}&Esfera=M${municipioFiltro}`;
		console.log(`[TCE-PE] Varrando contratos pelo CPF/CNPJ: ${docLimpo}...`);

		const linhas = await varrerContratosPE(
			urlContratos,
			(row) => docLimpoDe(row) === docLimpo && Number(row.Valor || 0) > 0,
			30,
		);

		return linhas.map((c) => ({
			...mapearContratoPE(c),
			nomeFornecedor:
				(c.RazaoSocial || "").trim() || nomeParaBusca || "Não Identificado",
		}));
	} catch (e) {
		console.warn(
			`[TCE-PE] Falha ao varrer Extrator PE para o alvo ${municipioUri || docLimpo}.`,
			e,
		);
		return [];
	}
}
