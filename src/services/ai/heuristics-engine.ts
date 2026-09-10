// ===============================================
// NÍVEL 4 (L4): FALLBACK HEURÍSTICO PURAMENTE MATEMÁTICO
// ===============================================
// Despesas corriqueiras com baixo risco intrínseco
const regexSafe =
	/passagem|bilhete|sigepa|aeroporto|\bgol\b|\blatam\b|\bazul\b|\btam\b|voepass|telefonia|internet|correios|\bect\b|energia|água|\buber\b|99app|pedágio|índice|gestão fiscal/i;
// Serviços intangíveis — alvo clássico de notas frias (mas NÃO inclui divulgação parlamentar)
const regexConsultoria = /consultoria|assessoria|serviços gráficos/i;
// Locação de VEÍCULO terrestre apenas (carro, van, ônibus) — exclui aeronaves
const regexLocacaoVeiculo =
	/locação de veículo|aluguel de veículo|locação.*van|locação.*ônibus|locação.*carro/i;
const regexCombustivel = /combustível|combustiveis|posto/i;
// Fretamento e táxi aéreo — tratamento específico e mais conservador
const regexFretamento =
	/fretamento|táxi aéreo|locação de aeronave|charter|voo fretado/i;

const PADRAO_ENQUADRAMENTO = "Análise Automática (sem IA disponível)";
const PADRAO_FUNDAMENTACAO =
	"Despesa analisada por critérios objetivos. Nenhum padrão de risco matemático ativado.";

interface AnaliseContext {
	score: number;
	classif: string;
	enquadramento: string;
	fund: string;
	motivos: string[];
}

function obterRegimeJuridico(casaNorm: string, esferaPolitico: string): string {
	if (casaNorm === "CAMARA") return "CEAP — Ato da Mesa nº 43/2009 (Câmara dos Deputados)";
	if (casaNorm === "SENADO") return "CEAPS — normas da Mesa do Senado Federal";
	if (esferaPolitico === "ESTADUAL") return "Cota parlamentar estadual (ato da Mesa da Assembleia Legislativa local)";
	if (esferaPolitico === "MUNICIPAL") return "Verba de gabinete municipal (legislação municipal local)";
	return "Normas da casa legislativa";
}

function calcularMedianaPorRubrica(despesas: any[], regex: RegExp): number | null {
	const valores = despesas
		.filter((d: any) => regex.test(`${d.tipoDespesa} ${d.nomeFornecedor}`.toLowerCase()))
		.map((d: any) => Number(d.valorDocumento || 0))
		.filter((v: number) => v > 0)
		.sort((a: number, b: number) => a - b);
	if (valores.length < 3) return null;
	return valores[Math.floor(valores.length / 2)];
}

function calcularCombustivelMensal(despesas: any[], regex: RegExp): Map<string, number> {
	const combustivelMensal = new Map<string, number>();
	for (const desp of despesas) {
		const str = `${desp.tipoDespesa} ${desp.nomeFornecedor}`.toLowerCase();
		if (!regex.test(str)) continue;
		const v = Number(desp.valorDocumento || 0);
		if (v <= 0) continue;
		const doc = (desp.cnpjCpfFornecedor || "").replace(/\D/g, "");
		const mes = String(desp.dataDocumento || "").slice(0, 7);
		const chave = `${doc}|${mes}`;
		combustivelMensal.set(chave, (combustivelMensal.get(chave) || 0) + v);
	}
	return combustivelMensal;
}

function avaliarDoador(eFornecedorDoador: boolean, ctx: AnaliseContext) {
	if (!eFornecedorDoador) return;
	ctx.score = 100;
	ctx.classif = "INDICIO_PENAL_RELEVANTE";
	ctx.enquadramento = "Conflito de Interesses — Retorno Eleitoral";
	ctx.motivos.push(
		"Este fornecedor consta na declaração oficial de doadores da campanha (TSE) e recebeu pagamento de verba parlamentar. Forte indício de conflito de interesses a ser apurado.",
	);
	ctx.fund =
		"O documento do fornecedor foi identificado na base de financiadores eleitorais do TSE. A coincidência entre doação de campanha registrada e recebimento de recursos públicos configura indício objetivo de conflito de interesses (princípio da moralidade administrativa, art. 37 da CF), a ser confirmado por análise dos contratos.";
}

function avaliarConsultoria(strBusca: string, valorNum: number, ctx: AnaliseContext) {
	if (!regexConsultoria.test(strBusca) || valorNum % 500 !== 0 || valorNum < 1000) return;
	ctx.score = Math.max(ctx.score, 55);
	if (ctx.classif === "REGULAR_COM_RESSALVA") ctx.classif = "PONTO_DE_ATENCAO";
	if (ctx.enquadramento === PADRAO_ENQUADRAMENTO) ctx.enquadramento = "Padrão estatístico atípico — conferência manual";
	ctx.motivos.push(
		`Serviço intangível (consultoria/assessoria/gráfica) com valor exatamente redondo (R$ ${valorNum.toLocaleString("pt-BR")}). Padrão atípico que merece conferência da nota e do comprovante de prestação — isoladamente, NÃO caracteriza irregularidade.`,
	);
	if (ctx.fund === PADRAO_FUNDAMENTACAO) {
		ctx.fund =
			"Valores perfeitamente redondos em rubricas de serviços intangíveis são estatisticamente menos frequentes em prestações reais (que costumam ter centavos). É apenas um sinal de atenção documental, sem qualquer conclusão de simulação ou fraude.";
	}
}

function avaliarLocacao(strBusca: string, valorNum: number, medianaLocacao: number | null, ctx: AnaliseContext) {
	if (!regexLocacaoVeiculo.test(strBusca) || medianaLocacao === null || valorNum < 8000 || valorNum <= 3 * medianaLocacao) return;
	ctx.score = Math.max(ctx.score, 55);
	if (ctx.classif === "REGULAR_COM_RESSALVA") ctx.classif = "PONTO_DE_ATENCAO";
	if (ctx.enquadramento === PADRAO_ENQUADRAMENTO) ctx.enquadramento = "Despesa atípica na rubrica (lote analisado)";
	ctx.motivos.push(
		`Locação de veículo (R$ ${valorNum.toLocaleString("pt-BR")}) mais de 3× acima da mediana desta rubrica no próprio mandato (R$ ${medianaLocacao.toLocaleString("pt-BR")}). Pode ser pagamento trimestral/anual legítimo — recomenda-se verificar o contrato.`,
	);
	if (ctx.fund === PADRAO_FUNDAMENTACAO) {
		ctx.fund =
			"O valor é atípico apenas em comparação com as demais locações do próprio parlamentar no período. Não existe teto legal específico para esta rubrica no regime aplicável; o alerta é estatístico, não normativo.";
	}
}

function avaliarCombustivelInviabilidade(
	fornecedorDoc: string,
	dataDoc: string,
	combustivelMensal: Map<string, number>,
	ctx: AnaliseContext,
): boolean {
	const mes = String(dataDoc || "").slice(0, 7);
	const chave = `${fornecedorDoc}|${mes}`;
	const acumuladoMensal = combustivelMensal.get(chave) || 0;
	if (acumuladoMensal <= 8000) return false;

	ctx.score = Math.max(ctx.score, 85);
	ctx.classif = "DESVIO_DE_FINALIDADE";
	ctx.enquadramento = "Inviabilidade Física — Acórdão TCU 3.048/2019";
	ctx.motivos.push(
		`Acumulado mensal de combustível neste posto (R$ ${acumuladoMensal.toLocaleString("pt-BR")}) excede o limite físico aceitável para um único veículo (aprox. R$ 8.000/mês). Forte indício de nota fria ou abastecimento de frota de terceiros.`,
	);
	ctx.fund =
		"Gasto mensal acumulado em um único fornecedor incompatível com a capacidade de consumo de um veículo de mandato, sugerindo simulação de despesa, conforme tipologia do TCU.";
	return true;
}

function avaliarCombustivelAtipico(
	valorNum: number,
	medianaCombustivel: number | null,
	regimeJuridico: string,
	ctx: AnaliseContext,
) {
	if (
		medianaCombustivel === null ||
		valorNum < 5000 ||
		valorNum <= 3 * medianaCombustivel
	)
		return;

	ctx.score = Math.max(ctx.score, 55);
	if (ctx.classif === "REGULAR_COM_RESSALVA") ctx.classif = "PONTO_DE_ATENCAO";
	if (ctx.enquadramento === PADRAO_ENQUADRAMENTO)
		ctx.enquadramento = "Despesa atípica na rubrica (lote analisado)";
	ctx.motivos.push(
		`Gasto com combustível (R$ ${valorNum.toLocaleString("pt-BR")}) mais de 3× acima da mediana desta rubrica no próprio mandato (R$ ${medianaCombustivel.toLocaleString("pt-BR")}). Recomenda-se conferir a nota e a compatibilidade com a frota utilizada.`,
	);
	if (ctx.fund === PADRAO_FUNDAMENTACAO) {
		ctx.fund = `O valor é atípico apenas em comparação com os demais gastos de combustível do próprio parlamentar. O regime aplicável (${regimeJuridico}) não fixa teto monetário específico para esta rubrica; o alerta é estatístico, não normativo.`;
	}
}

function avaliarCombustivel(
	strBusca: string,
	valorNum: number,
	fornecedorDoc: string,
	dataDoc: string,
	combustivelMensal: Map<string, number>,
	medianaCombustivel: number | null,
	regimeJuridico: string,
	ctx: AnaliseContext,
) {
	if (!regexCombustivel.test(strBusca)) return;

	const inviavel = avaliarCombustivelInviabilidade(
		fornecedorDoc,
		dataDoc,
		combustivelMensal,
		ctx,
	);
	if (!inviavel) {
		avaliarCombustivelAtipico(
			valorNum,
			medianaCombustivel,
			regimeJuridico,
			ctx,
		);
	}
}

function avaliarFretamento(strBusca: string, valorNum: number, eFornecedorDoador: boolean, ctx: AnaliseContext) {
	if (!regexFretamento.test(strBusca) || valorNum <= 50000) return;
	if (eFornecedorDoador) {
		ctx.motivos.push(
			`Agravante: a empresa de táxi aéreo é doadora de campanha do parlamentar (valor do fretamento: R$ ${valorNum.toLocaleString("pt-BR")}).`,
		);
		return;
	}
	ctx.score = Math.max(ctx.score, 35);
	if (ctx.enquadramento === PADRAO_ENQUADRAMENTO) ctx.enquadramento = "Fretamento de Aeronave — Valor Relevante";
	ctx.motivos.push(
		`Fretamento de aeronave com valor significativo (R$ ${valorNum.toLocaleString("pt-BR")}). Despesa legal, mas requer atenção ao trecho voado e à idoneidade do fornecedor.`,
	);
	if (ctx.fund === PADRAO_FUNDAMENTACAO) {
		ctx.fund =
			"Fretamento de aeronave em valor expressivo. Na ausência de conflito de interesses (empresa do parlamentar ou doador), esta despesa pode ser regular se compatível com o deslocamento à base eleitoral. A análise manual do trecho e da nota fiscal é recomendada.";
	}
}

function analisarDespesaIndividual(
	d: any,
	listaDoadores: string[],
	medianaLocacao: number | null,
	medianaCombustivel: number | null,
	combustivelMensal: Map<string, number>,
	regimeJuridico: string,
) {
	const strBusca = `${d.tipoDespesa} ${d.nomeFornecedor}`.toLowerCase();
	if (regexSafe.test(strBusca)) {
		return {
			...d,
			score_letalidade: 20,
			classificacao: "REGULAR_COM_RESSALVA",
			enquadramento_normativo: "Despesa de rotina",
			fundamentacao_tecnica:
				"Gasto identificado como despesa operacional padrão do mandato (passagens, telefonia, combustível, postagem etc.).",
			motivo_ia:
				"Despesa de rotina do mandato. Sem indícios de irregularidade.",
		};
	}

	const fornecedorDoc = (d.cnpjCpfFornecedor || "").replace(/\D/g, "");
	const valorNum = Number(d.valorDocumento || 0);
	const eFornecedorDoador =
		fornecedorDoc.length === 14 && listaDoadores.includes(fornecedorDoc);

	const ctx: AnaliseContext = {
		score: 30,
		classif: "REGULAR_COM_RESSALVA",
		enquadramento: PADRAO_ENQUADRAMENTO,
		fund: PADRAO_FUNDAMENTACAO,
		motivos: [],
	};

	avaliarDoador(eFornecedorDoador, ctx);
	avaliarConsultoria(strBusca, valorNum, ctx);
	avaliarLocacao(strBusca, valorNum, medianaLocacao, ctx);
	avaliarCombustivel(
		strBusca,
		valorNum,
		fornecedorDoc,
		d.dataDocumento,
		combustivelMensal,
		medianaCombustivel,
		regimeJuridico,
		ctx,
	);
	avaliarFretamento(strBusca, valorNum, eFornecedorDoador, ctx);

	const alertaStr =
		ctx.motivos.length > 0
			? ctx.motivos.join(" | ")
			: "Despesa sem padrões de risco identificados pela análise automática.";

	return {
		...d,
		score_letalidade: ctx.score,
		classificacao: ctx.classif,
		enquadramento_normativo: ctx.enquadramento,
		fundamentacao_tecnica: ctx.fund,
		motivo_ia: alertaStr,
	};
}

export function fallbackL4HeuristicaMatematica(
	despesas: any[],
	listaDoadores: string[],
	esferaPolitico: string = "FEDERAL",
	casaLegislativa: string = "CAMARA",
) {
	console.warn(
		"[FALLBACK L4] Acionando Heurística Matemática Pura (Sem IA)...",
	);

	const casaNorm = String(casaLegislativa || "").toUpperCase();
	const regimeJuridico = obterRegimeJuridico(casaNorm, esferaPolitico);

	const medianaCombustivel = calcularMedianaPorRubrica(despesas, regexCombustivel);
	const medianaLocacao = calcularMedianaPorRubrica(despesas, regexLocacaoVeiculo);
	const combustivelMensal = calcularCombustivelMensal(despesas, regexCombustivel);

	return despesas.map((d: any) =>
		analisarDespesaIndividual(
			d,
			listaDoadores,
			medianaLocacao,
			medianaCombustivel,
			combustivelMensal,
			regimeJuridico,
		),
	);
}

// ===============================================
// MOTOR INTELIGENTE PARA EMENDAS PARLAMENTARES
// ===============================================
export function fallbackL4Emendas(emendas: any[]) {
	console.warn(
		"[FALLBACK L4 EMENDAS] Calculando riscos com Heurística Fixa...",
	);
	return emendas.map((emenda) => {
		let scoreLet = 30;
		let classif = "REGULAR_COM_RESSALVA";
		let fund = "Emenda em tramitação comum.";

		const risco = emenda._riscoTipo || { nivel: "NORMAL" };
		if (risco.nivel === "CRÍTICO") {
			scoreLet = 70;
			classif = "PONTO_DE_ATENCAO";
			fund =
				"Emenda de relator/transferência especial (RP9/PIX): modalidade legal (art. 166, §§ 16-17, CF), porém com baixa vinculação de objeto e rastreabilidade reduzida — opacidade reconhecida pelo STF na ADPF 850 e pelo TCU. Recomenda-se acompanhar a execução no TransfereGov.";
		} else if (risco.nivel === "ALTO") {
			scoreLet = 40;
			classif = "PONTO_DE_ATENCAO";
			fund =
				"Emenda de bancada estadual: modalidade legal e impositiva (art. 166, § 16, CF). Atenção apenas à execução e à fidelidade à programação aprovada pela bancada.";
		} else if (risco.nivel === "MODERADO") {
			scoreLet = 40;
			classif = "PONTO_DE_ATENCAO";
			fund =
				"Emenda de comissão: modalidade legal. Atenção à execução e à aderência ao objeto aprovado.";
		}

		if (emenda._isFantasma) {
			scoreLet = Math.min(scoreLet + 25, 75);
			classif = "PONTO_DE_ATENCAO";
			fund +=
				" Consta como empenhada sem pagamento registrado no período — pode indicar atraso de execução, dotação insuficiente ou cancelamento posterior. Não configura, por si só, irregularidade.";
		}

		return {
			...emenda,
			score_letalidade: scoreLet,
			classificacao: classif,
			enquadramento_normativo: "Heurística L4 de Execução",
			fundamentacao_tecnica: fund,
			motivo_ia:
				scoreLet >= 50
					? `Heurística: Emenda ${risco.nivel} (Pagamento ${emenda._percentualExecucao}%)`
					: `Emenda Comum.`,
		};
	});
}

// ==========================================
// NÍVEL 4: FALLBACK HEURÍSTICO OSINT L3
// ==========================================
function extrairDoadoresComContrato(malha: any[]): Set<string> {
	const doadores = new Set<string>();
	const contextNodes = malha.filter((n: any) => n._isContextOnly);

	for (const ctx of contextNodes) {
		if (
			ctx.tipoContexto === "CONTRATOS_MUNICIPAIS_DOADORES" &&
			Array.isArray(ctx.contratosPNCP)
		) {
			for (const item of ctx.contratosPNCP) {
				if (item?.cnpj) {
					doadores.add(item.cnpj.replace(/\D/g, ""));
				}
			}
		}
	}
	return doadores;
}

function verificarSuspeitaFachada(labelUpper: string): boolean {
	return labelUpper.includes("FANTASMA") || labelUpper.includes("FACHADA");
}

function classificarNoOsintFallback(
	orig: any,
	doadoresComContrato: Set<string>,
) {
	const labelUpper = (orig.data?.label || "").toUpperCase();
	const tipoUpper = (orig.data?.tipo || "").toUpperCase();
	const codigoLimpo = String(
		orig.data?.codigo || orig.data?.cnpj || "",
	).replace(/\D/g, "");

	const ehDoador = tipoUpper === "DOAÇÃO ELEITORAL";
	const temContratoOuFantasma =
		doadoresComContrato.has(codigoLimpo) || labelUpper.includes("FANTASMA");

	if (ehDoador && temContratoOuFantasma) {
		return {
			score: 85,
			classificacao: "CONFLITO_INTERESSE",
			motivo:
				"[HEURÍSTICA] Doador de campanha com contratos públicos ativos identificados no PNCP ou indício de empresa fantasma. Risco elevado de conflito de interesses.",
			enquadramento:
				"Lei nº 9.504/1997 / Princípio da Moralidade Administrativa",
			fundamentacao:
				"A empresa realizou doações eleitorais ao candidato e concomitantemente possui contratos ativos com a administração pública.",
		};
	}

	if (verificarSuspeitaFachada(labelUpper)) {
		return {
			score: 90,
			classificacao: "INDICIO_PENAL_RELEVANTE",
			motivo:
				"[HEURÍSTICA] Empresa com forte suspeita de ser de fachada/fantasma.",
			enquadramento: "Código Penal, Art. 299 (Falsidade Ideológica)",
			fundamentacao:
				"Denominação ou características do fornecedor levantam suspeitas de inexistência física ou simulação societária.",
		};
	}

	return {
		score: orig.data?.score_letalidade ?? 20,
		classificacao: "SEM_INDICIO_RELEVANTE",
		motivo: orig.data?.motivo_ia,
		enquadramento: "-",
		fundamentacao: "Nó avaliado limpo pela heurística de fallback.",
	};
}

export function fallbackL4OSINT(malhaOsint: any[]) {
	console.warn(
		"[OSINT TRIAGE] Todas as LLMs falharam. Aplicando Heurística Local L3...",
	);
	const doadoresComContrato = extrairDoadoresComContrato(malhaOsint);

	return malhaOsint
		.filter((n: any) => !n._isContextOnly)
		.map((orig: any) => {
			const res = classificarNoOsintFallback(orig, doadoresComContrato);
			return {
				...orig,
				data: {
					...orig.data,
					score_letalidade: res.score,
					classificacao: res.classificacao,
					enquadramento_normativo: res.enquadramento,
					fundamentacao_tecnica: res.fundamentacao,
					motivo_ia: res.motivo,
				},
			};
		});
}

function aplicarSafetyNetDoador(n: any) {
	const currentScore = n.data?.score_letalidade ?? 0;
	if (currentScore >= 85) return n;

	const motivoValido =
		n.data?.motivo_ia &&
		n.data.motivo_ia !== "Dado objetivo insuficiente para análise";

	return {
		...n,
		data: {
			...n.data,
			score_letalidade: 85,
			classificacao: "CONFLITO_INTERESSE",
			motivo_ia: motivoValido
				? `[SAFETY_NET] ${n.data.motivo_ia}`
				: "[SAFETY_NET] Doador de campanha com contratos públicos ativos identificados no PNCP ou indício de empresa fantasma.",
			enquadramento_normativo:
				"Lei nº 9.504/1997 / Princípio da Moralidade Administrativa",
			fundamentacao_tecnica:
				"A empresa realizou doações eleitorais ao candidato e concomitantemente possui contratos ativos com a administração pública.",
		},
	};
}

function aplicarSafetyNetFachada(n: any) {
	const currentScore = n.data?.score_letalidade ?? 0;
	if (currentScore >= 90) return n;

	return {
		...n,
		data: {
			...n.data,
			score_letalidade: 90,
			classificacao: "INDICIO_PENAL_RELEVANTE",
			motivo_ia:
				"[SAFETY_NET] Empresa com forte suspeita de ser de fachada/fantasma.",
			enquadramento_normativo:
				"Código Penal, Art. 299 (Falsidade Ideológica)",
			fundamentacao_tecnica:
				"Denominação ou características do fornecedor levantam suspeitas de inexistência física ou simulação societária.",
		},
	};
}

function ajustarNoSafetyNet(n: any, doadoresComContrato: Set<string>) {
	const labelUpper = (n.data?.label || "").toUpperCase();
	const tipoUpper = (n.data?.tipo || "").toUpperCase();
	const codigoLimpo = String(
		n.data?.codigo || n.data?.cnpj || "",
	).replace(/\D/g, "");

	const ehDoador = tipoUpper === "DOAÇÃO ELEITORAL";
	const temContratoOuFantasma =
		doadoresComContrato.has(codigoLimpo) || labelUpper.includes("FANTASMA");

	if (ehDoador && temContratoOuFantasma) {
		return aplicarSafetyNetDoador(n);
	}

	if (verificarSuspeitaFachada(labelUpper)) {
		return aplicarSafetyNetFachada(n);
	}

	return n;
}

export function aplicarSafetyNetOSINT(
	resultado: any[],
	malhaOriginal: any[],
): any[] {
	const doadoresComContrato = extrairDoadoresComContrato(malhaOriginal);
	return resultado.map((n: any) => ajustarNoSafetyNet(n, doadoresComContrato));
}
