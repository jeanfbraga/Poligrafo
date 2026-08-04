import { buscarCpfNoTSE } from "../../tse";

export async function buscarDeputadoEstadualSP(nomeBuscado: string): Promise<
	{
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		casa: "ALESP";
	}[]
> {
	const termo = nomeBuscado.toLowerCase().trim();
	const resultados: {
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		casa: "ALESP";
	}[] = [];

	// Busca o CPF no TSE do candidato a Deputado Estadual (Cargo 7) em SP
	const tseResult = await buscarCpfNoTSE(termo, "SP", "7");

	if (tseResult) {
		const nomeCompleto =
			tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
		const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
		const documento = tseResult.documentoPrincipal || tseResult.cpf;
		const nomeExibicao =
			nomeUrna && nomeUrna !== nomeCompleto
				? `${nomeCompleto} (${nomeUrna})`
				: nomeCompleto;
		resultados.push({
			// Ref agora carrega NOME e DOCUMENTO separados: ALESP:DEPUTADO_ESTADUAL:{nome}:{documento}
			ref: `ALESP:DEPUTADO_ESTADUAL:${encodeURIComponent(nomeCompleto)}:${documento}`,
			id: nomeCompleto, // O ID é o NOME — o scraper da ALESP filtra por nome
			nome: nomeExibicao,
			cargo: "Deputado Estadual (SP)",
			uf: "SP",
			casa: "ALESP",
		});
	}

	return resultados;
}

export async function buscarDespesasDeputadoEstadualSP(
	identificador: string,
	nomePolitico: string,
	sendEvent?: any,
) {
	// A ALESP descontinuou a rota REST /dados-abertos/despesa/{ano}/{mes}.
	// Fonte oficial vigente: XML único do repositório de dados abertos
	// (todas as despesas de gabinete, ~170MB) — filtrado aqui em streaming.
	const _matricula = identificador;
	const anoAtual = new Date().getFullYear();
	const anoMinimo = anoAtual - 1;
	const urlXml =
		"https://www.al.sp.gov.br/repositorioDados/deputados/despesas_gabinetes.xml";

	const normaliza = (s: string) =>
		(s || "")
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toUpperCase()
			.replace(/\s+/g, " ")
			.trim();

	const alvoNorm = normaliza(nomePolitico);
	const alvoTokens = alvoNorm.split(" ");

	// Tolera omissão de nomes do meio (ex.: "ANDRE LUIS DO PRADO" vs "ANDRE DO PRADO")
	const nomesBatem = (nomeXml: string) => {
		const n = normaliza(nomeXml);
		if (!n) return false;
		if (n === alvoNorm || alvoNorm.includes(n) || n.includes(alvoNorm))
			return true;
		const tokensXml = n.split(" ");
		const [menor, maior] =
			tokensXml.length <= alvoTokens.length
				? [tokensXml, alvoTokens]
				: [alvoTokens, tokensXml];
		return menor.every((t) => maior.includes(t));
	};

	const despesasExtraidas: any[] = [];
	try {
		const res = await fetch(urlXml, { signal: AbortSignal.timeout(60000) });
		if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

		const reader = res.body.getReader();
		const decoder = new TextDecoder("utf-8");
		let buffer = "";
		let bytesLidos = 0;
		const MAX_BYTES = 200_000_000;
		const MAX_DESPESAS = 300; // coleta bruta antes do corte final

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			bytesLidos += value?.length || 0;
			buffer += decoder.decode(value, { stream: true });

			let idx: number;
			while ((idx = buffer.indexOf("</despesa>")) !== -1) {
				const bloco = buffer.slice(0, idx + 10);
				buffer = buffer.slice(idx + 10);
				if (!bloco.includes("<Deputado>")) continue;
				const mNome = bloco.match(/<Deputado>([^<]*)<\/Deputado>/);
				if (!mNome || !nomesBatem(mNome[1])) continue;
				const mAno = bloco.match(/<Ano>(\d{4})<\/Ano>/);
				const ano = mAno ? Number(mAno[1]) : 0;
				if (ano < anoMinimo) continue;
				const campo = (tag: string) =>
					bloco.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] || "";
				despesasExtraidas.push({
					cnpjCpfFornecedor:
						(campo("CNPJ") || "").replace(/\D/g, "") || "00000000000000",
					nomeFornecedor: campo("Fornecedor") || "Fornecedor ALESP",
					tipoDespesa: campo("Tipo") || "Verba Indenizatória / Gabinete",
					valorDocumento: Number.parseFloat(campo("Valor")) || 0,
					dataDocumento: `${campo("Ano")}-${String(campo("Mes")).padStart(2, "0")}-01`,
					urlDocumento: urlXml,
				});
				if (despesasExtraidas.length >= MAX_DESPESAS) break;
			}
			if (
				despesasExtraidas.length >= MAX_DESPESAS ||
				bytesLidos >= MAX_BYTES
			) {
				await reader.cancel().catch(() => {});
				break;
			}
		}

		despesasExtraidas.sort((a, b) => b.valorDocumento - a.valorDocumento);
		const corte = despesasExtraidas.slice(0, 60);
		if (corte.length === 0 && sendEvent) {
			sendEvent("API_WARNING", {
				fonte: "Assembleia Legislativa de SP (ALESP)",
				mensagem: `Nenhuma despesa de gabinete encontrada para "${nomePolitico}" nos exercícios recentes da ALESP.`,
			});
		}
		return corte;
	} catch (error: any) {
		console.error(`[ESTADUAL SP] Falha na extração ALESP: ${error?.message}`);
		if (sendEvent) {
			sendEvent("API_WARNING", {
				fonte: "Assembleia Legislativa de SP (ALESP)",
				mensagem:
					"O repositório de dados da AL-SP recusou a conexão ou deu timeout. Tente novamente mais tarde.",
			});
		}
		return [];
	}
}
