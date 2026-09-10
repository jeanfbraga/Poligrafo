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
	process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy_anon_key",
);

function extrairCnpjsAssociados(
	qsaEmpresas: any[],
	cnpjsAlvos: string[],
): void {
	qsaEmpresas.forEach((emp: any) => {
		const cnpjEmpresa = (emp.cpfCnpj || "").replace(/\D/g, "");
		if (cnpjEmpresa && !cnpjsAlvos.includes(cnpjEmpresa)) {
			cnpjsAlvos.push(cnpjEmpresa);
		}
	});
}

function agregarResultadosTceRj(
	resultados: PromiseSettledResult<any>[],
	cnpjsAlvos: string[],
): any[] {
	const todasAsDespesas: any[] = [];
	if (resultados[0]?.status === "fulfilled") {
		todasAsDespesas.push(...(resultados[0].value.despesasFederais || []));
		extrairCnpjsAssociados(
			resultados[0].value.empresasAssociadas || [],
			cnpjsAlvos,
		);
	}
	if (resultados[1]?.status === "fulfilled") {
		todasAsDespesas.push(...(resultados[1].value || []));
	}
	if (resultados[2]?.status === "fulfilled") {
		todasAsDespesas.push(...(resultados[2].value || []));
	}
	return todasAsDespesas;
}

function formatarItemCotaCmrj(d: any) {
	return {
		tipoDespesa: d.categoria_despesa || "Cota de Gabinete",
		nomeFornecedor: d.fornecedor_nome || "Fornecedor não identificado",
		cnpjCpfFornecedor: d.fornecedor_cnpj_cpf || "",
		valorDocumento: d.valor,
		dataDocumento: d.data_despesa || "",
		descricao: d.descricao || d.categoria_despesa || "",
		_fonte: "CMRJ_COTA_GABINETE",
		_extraidoPor: d.extraido_por || "etl",
		_arquivoOrigem: d.fonte_arquivo || "",
	};
}

async function buscarCotaGabineteCmrj(nomeVereador: string): Promise<any[]> {
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
			return cotaDespesas.map(formatarItemCotaCmrj);
		}
		if (error) {
			console.warn(`[CMRJ-COTA] Erro ao buscar cota de gabinete:`, error.message);
		}
		return [];
	} catch (err: any) {
		console.warn(`[CMRJ-COTA] Falha na consulta Supabase:`, err.message);
		return [];
	}
}

export async function buscarDespesasVereadorRJ(
	identificador: string,
	nomeVereador?: string,
	municipioUri?: string,
	casa?: string,
): Promise<any[]> {
	const docLimpo = String(identificador).replace(/\D/g, "");
	const cnpjsAlvos = [docLimpo];

	const promessas: Promise<any>[] = [
		buscarProxyOsint(identificador, nomeVereador),
	];

	if (municipioUri) {
		const municipioFormatado = municipioUri.replace(/-/g, " ").toUpperCase();
		promessas.push(buscarContratosTceRj(municipioFormatado, cnpjsAlvos));
		promessas.push(buscarComprasDiretasTceRj(municipioFormatado, cnpjsAlvos));
	}

	const resultados = await Promise.allSettled(promessas);
	const todasAsDespesas = agregarResultadosTceRj(resultados, cnpjsAlvos);

	if (casa === "CAMARA_MUNICIPAL_RJ" && nomeVereador) {
		const cota = await buscarCotaGabineteCmrj(nomeVereador);
		todasAsDespesas.push(...cota);
	}

	return todasAsDespesas;
}
