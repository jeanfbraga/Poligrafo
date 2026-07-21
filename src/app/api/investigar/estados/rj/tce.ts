import { buscarCpfNoTSE } from "../../tse";

export async function buscarMunicipalRJ(nomeBuscado: string): Promise<
	{
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		isCnpj?: boolean;
		casa: "CAMARA_MUNICIPAL_RJ" | "PREFEITURA";
	}[]
> {
	const termo = nomeBuscado.toLowerCase().trim();
	console.log(
		`[>> MUNICIPAL RJ ENTRY] buscarMunicipalRJ chamado para: ${nomeBuscado}`,
	);
	const resultados: {
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		isCnpj?: boolean;
		casa: "CAMARA_MUNICIPAL_RJ" | "PREFEITURA";
	}[] = [];

	// Tenta achar como Vereador (Cargo 13)
	let tseResult = await buscarCpfNoTSE(termo, "RJ", "13");
	let tipoCargo: "CAMARA_MUNICIPAL_RJ" | "PREFEITURA" = "CAMARA_MUNICIPAL_RJ";
	let tituloCargo = "Vereador";

	// Se não achar vereador, tenta Prefeito (Cargo 11)
	if (!tseResult) {
		tseResult = await buscarCpfNoTSE(termo, "RJ", "11");
		if (tseResult) {
			tipoCargo = "PREFEITURA";
			tituloCargo = "Prefeito";
		}
	}

	if (tseResult) {
		const nomeCompleto =
			tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
		const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
		// Exibe o nome de urna entre parênteses quando difere do nome civil
		const nomeExibicao =
			nomeUrna && nomeUrna !== nomeCompleto
				? `${nomeCompleto} (${nomeUrna})`
				: nomeCompleto;
		resultados.push({
			ref: `RJ:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
			id: tseResult.documentoPrincipal,
			nome: nomeExibicao,
			cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, " ").toUpperCase()}`,
			uf: "RJ",
			isCnpj: tseResult.isCnpj,
			casa: tipoCargo,
		});
	}

	return resultados;
}

import { createClient } from "@supabase/supabase-js";
import { buscarProxyOsint } from "../../proxy_osint";
import {
	buscarComprasDiretasTceRj,
	buscarContratosTceRj,
} from "./tcerj-client";

const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL || "",
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function buscarDespesasVereadorRJ(
	identificador: string,
	nomeVereador?: string,
	municipioUri?: string,
	casa?: string,
): Promise<any[]> {
	const docLimpo = String(identificador).replace(/\D/g, "");
	const cnpjsAlvos = [docLimpo];

	const promessas: Promise<any>[] = [];

	// 1. Busca Proxy OSINT (Federal/BrasilAPI) para resgatar contratos federais e pegar QSA/CNPJs das empresas do vereador
	promessas.push(buscarProxyOsint(identificador, nomeVereador));

	// 2. Busca Contratos e Compras Diretas no TCE-RJ se tivermos a URI do município
	if (municipioUri) {
		// Formatar o nome do município (ex: "rio-de-janeiro" -> "RIO DE JANEIRO")
		const municipioFormatado = municipioUri.replace(/-/g, " ").toUpperCase();
		promessas.push(buscarContratosTceRj(municipioFormatado, cnpjsAlvos));
		promessas.push(buscarComprasDiretasTceRj(municipioFormatado, cnpjsAlvos));
	}

	const resultados = await Promise.allSettled(promessas);
	let todasAsDespesas: any[] = [];
	let qsaEmpresas = [];

	// Extrair resultado do Proxy OSINT
	if (resultados[0].status === "fulfilled") {
		todasAsDespesas = todasAsDespesas.concat(
			resultados[0].value.despesasFederais || [],
		);
		qsaEmpresas = resultados[0].value.empresasAssociadas || [];

		// Se a BrasilAPI achou empresas do vereador, vamos extrair os CNPJs para caçar se essas empresas tem contratos com a prefeitura
		qsaEmpresas.forEach((emp: any) => {
			const cnpjEmpresa = (emp.cpfCnpj || "").replace(/\D/g, "");
			if (cnpjEmpresa && !cnpjsAlvos.includes(cnpjEmpresa)) {
				cnpjsAlvos.push(cnpjEmpresa);
			}
		});
	}

	// Extrair resultado de Contratos TCE-RJ
	if (resultados.length > 1 && resultados[1].status === "fulfilled") {
		todasAsDespesas = todasAsDespesas.concat(resultados[1].value || []);
	}

	// Extrair resultado de Compras Diretas TCE-RJ
	if (resultados.length > 2 && resultados[2].status === "fulfilled") {
		todasAsDespesas = todasAsDespesas.concat(resultados[2].value || []);
	}

	// 3. Cota de Gabinete CMRJ (alimentada pelo ETL diário via GitHub Actions)
	if (casa === "CAMARA_MUNICIPAL_RJ" && nomeVereador) {
		try {
			const { data: cotaDespesas, error } = await supabase
				.from("cmrj_despesas")
				.select("*")
				.ilike("vereador_nome", `%${nomeVereador.trim()}%`)
				.order("data_despesa", { ascending: false })
				.limit(200);

			if (!error && cotaDespesas && cotaDespesas.length > 0) {
				console.log(
					`[CMRJ-COTA] ${cotaDespesas.length} despesa(s) de cota de gabinete encontrada(s) para ${nomeVereador}`,
				);
				const cotaFormatadas = cotaDespesas.map((d: any) => ({
					// Formato compatível com o padrão de despesas do sistema
					tipoDespesa: d.categoria_despesa || "Cota de Gabinete",
					nomeFornecedor: d.fornecedor_nome || "Fornecedor não identificado",
					cnpjCpfFornecedor: d.fornecedor_cnpj_cpf || "",
					valorDocumento: d.valor,
					dataDocumento: d.data_despesa || "",
					descricao: d.descricao || d.categoria_despesa || "",
					// Metadados extras para o canvas
					_fonte: "CMRJ_COTA_GABINETE",
					_extraidoPor: d.extraido_por || "etl",
					_arquivoOrigem: d.fonte_arquivo || "",
				}));
				todasAsDespesas = todasAsDespesas.concat(cotaFormatadas);
			} else if (error) {
				console.warn(
					`[CMRJ-COTA] Erro ao buscar cota de gabinete:`,
					error.message,
				);
			} else {
				console.log(
					`[CMRJ-COTA] Nenhuma despesa de cota encontrada ainda. ETL pendente.`,
				);
			}
		} catch (err: any) {
			console.warn(`[CMRJ-COTA] Falha na consulta Supabase:`, err.message);
		}
	}

	return todasAsDespesas;
}
