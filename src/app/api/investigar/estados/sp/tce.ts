// app/api/investigar/municipios/sao_paulo.ts

import { buscarCpfNoTSE } from "../../tse";

export async function buscarMunicipalSP(nomeBuscado: string): Promise<
	{
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		casa: "CAMARA_MUNICIPAL_SP" | "PREFEITURA";
	}[]
> {
	const termo = nomeBuscado.toLowerCase().trim();
	const resultados: {
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		casa: "CAMARA_MUNICIPAL_SP" | "PREFEITURA";
	}[] = [];

	// Tenta achar como Vereador (Cargo 13)
	let tseResult = await buscarCpfNoTSE(termo, "SP", "13");
	let tipoCargo: "CAMARA_MUNICIPAL_SP" | "PREFEITURA" = "CAMARA_MUNICIPAL_SP";
	let tituloCargo = "Vereador";

	// Se não achar vereador, tenta Prefeito (Cargo 11)
	if (!tseResult) {
		tseResult = await buscarCpfNoTSE(termo, "SP", "11");
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
			// Padroniza a REFERENCIA para os nós do sistema
			ref: `SP:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
			id: tseResult.documentoPrincipal,
			nome: nomeExibicao,
			cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, " ").toUpperCase()}`,
			uf: "SP",
			casa: tipoCargo,
		});
	}

	return resultados;
}

export async function buscarDespesasVereadorSP(
	identificador: string,
	municipioTce: string,
) {
	const termoBusca = String(identificador).toLowerCase();
	const isCpf = /^\d{11}$/.test(termoBusca);
	const mioloCpf = isCpf ? termoBusca.substring(3, 9) : null;

	const anoAtual = new Date().getFullYear();
	const anoAnterior = anoAtual - 1;
	const despesasEncontradas: any[] = [];

	try {
		// Busca final de ano passado (Novembro e Dezembro) e meses iniciais do atual
		const consultas = [
			{ ano: anoAnterior, mes: 11 },
			{ ano: anoAnterior, mes: 12 },
			{ ano: anoAtual, mes: 1 },
			{ ano: anoAtual, mes: 2 },
		];

		for (const { ano, mes } of consultas) {
			const url = `https://transparencia.tce.sp.gov.br/api/json/despesas/${municipioTce}/${ano}/${mes}`;

			const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
			if (!res.ok) continue;

			const data = await res.json();
			if (!Array.isArray(data)) continue;

			// Filtra pagamentos: se temos CPF, cruza pelo miolo (6 dígitos centrais) para combater mascaramento LGPD
			const notasDoPolitico = data.filter((d: any) => {
				if (isCpf && mioloCpf && d.id_fornecedor) {
					const docTce = d.id_fornecedor.replace(/\D/g, "");
					if (docTce.includes(mioloCpf)) return true;
				}
				const credor = (d.nm_fornecedor || "").toLowerCase();
				return credor.includes(termoBusca);
			});

			const formatado = notasDoPolitico
				.map((d: any) => {
					const valorStr = (d.vl_despesa || "0")
						.toString()
						.replace(/\./g, "")
						.replace(",", ".");
					const valorNum = Number(valorStr);

					return {
						cnpjCpfFornecedor: d.id_fornecedor
							? d.id_fornecedor.replace(/\D/g, "")
							: "",
						nomeFornecedor: d.nm_fornecedor,
						tipoDespesa: d.evento || d.funcao || "DESPESA MUNICIPAL",
						valorDocumento: Number.isNaN(valorNum) ? 0 : valorNum,
						dataDocumento: `${ano}-${String(mes).padStart(2, "0")}-01`,
						urlDocumento: null,
					};
				})
				.filter(
					(d: any) => d.cnpjCpfFornecedor.length >= 11 && d.nomeFornecedor,
				);

			despesasEncontradas.push(...formatado);
		}

		return despesasEncontradas.slice(0, 60);
	} catch (error) {
		console.error(
			`[MUNICIPAL SP] Erro ao buscar despesas de ${municipioTce} no TCE-SP:`,
			error,
		);
		return [];
	}
}
