// ===============================================
// NÍVEL 4 (L4): FALLBACK HEURÍSTICO PURAMENTE MATEMÁTICO
// ===============================================
export function fallbackL4HeuristicaMatematica(
	despesas: any[],
	listaDoadores: string[],
	esferaPolitico: string = "FEDERAL",
	casaLegislativa: string = "CAMARA",
) {
	console.warn(
		"[FALLBACK L4] Acionando Heurística Matemática Pura (Sem IA)...",
	);

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

	const casaNorm = String(casaLegislativa || "").toUpperCase();
	const regimeJuridico =
		casaNorm === "CAMARA"
			? "CEAP — Ato da Mesa nº 43/2009 (Câmara dos Deputados)"
			: casaNorm === "SENADO"
				? "CEAPS — normas da Mesa do Senado Federal"
				: esferaPolitico === "ESTADUAL"
					? "Cota parlamentar estadual (ato da Mesa da Assembleia Legislativa local)"
					: esferaPolitico === "MUNICIPAL"
						? "Verba de gabinete municipal (legislação municipal local)"
						: "Normas da casa legislativa";

	const medianaPorRubrica = (regex: RegExp) => {
		const valores = despesas
			.filter((d: any) =>
				regex.test(`${d.tipoDespesa} ${d.nomeFornecedor}`.toLowerCase()),
			)
			.map((d: any) => Number(d.valorDocumento || 0))
			.filter((v: number) => v > 0)
			.sort((a: number, b: number) => a - b);
		if (valores.length < 3) return null;
		return valores[Math.floor(valores.length / 2)];
	};
	const medianaCombustivel = medianaPorRubrica(regexCombustivel);
	const medianaLocacao = medianaPorRubrica(regexLocacaoVeiculo);

	const combustivelMensal = new Map<string, number>();
	for (const desp of despesas) {
		const str =
			`${desp.tipoDespesa} ${desp.nomeFornecedor}`.toLowerCase();
		if (!regexCombustivel.test(str)) continue;
		const v = Number(desp.valorDocumento || 0);
		if (v <= 0) continue;
		const doc = (desp.cnpjCpfFornecedor || "").replace(/\D/g, "");
		const mes = String(desp.dataDocumento || "").slice(0, 7);
		const chave = `${doc}|${mes}`;
		combustivelMensal.set(chave, (combustivelMensal.get(chave) || 0) + v);
	}

	return despesas.map((d: any) => {
		const strBusca = `${d.tipoDespesa} ${d.nomeFornecedor}`.toLowerCase();
		const fornecedorDoc = (d.cnpjCpfFornecedor || "").replace(/\D/g, "");
		const valorNum = Number(d.valorDocumento || 0);
		const eFornecedorDoador =
			fornecedorDoc.length === 14 && listaDoadores.includes(fornecedorDoc);

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

		let score = 30;
		let classif = "REGULAR_COM_RESSALVA";
		const motivos: string[] = [];
		let enquadramento = "Análise Automática (sem IA disponível)";
		let fund =
			"Despesa analisada por critérios objetivos. Nenhum padrão de risco matemático ativado.";

		if (eFornecedorDoador) {
			score = 100;
			classif = "INDICIO_PENAL_RELEVANTE";
			enquadramento = "Conflito de Interesses — Retorno Eleitoral";
			motivos.push(
				"Este fornecedor consta na declaração oficial de doadores da campanha (TSE) e recebeu pagamento de verba parlamentar. Forte indício de conflito de interesses a ser apurado.",
			);
			fund =
				"O documento do fornecedor foi identificado na base de financiadores eleitorais do TSE. A coincidência entre doação de campanha registrada e recebimento de recursos públicos configura indício objetivo de conflito de interesses (princípio da moralidade administrativa, art. 37 da CF), a ser confirmado por análise dos contratos.";
		}

		if (
			regexConsultoria.test(strBusca) &&
			valorNum % 500 === 0 &&
			valorNum >= 1000
		) {
			score = Math.max(score, 55);
			if (classif === "REGULAR_COM_RESSALVA") classif = "PONTO_DE_ATENCAO";
			if (enquadramento === "Análise Automática (sem IA disponível)")
				enquadramento = "Padrão estatístico atípico — conferência manual";
			motivos.push(
				`Serviço intangível (consultoria/assessoria/gráfica) com valor exatamente redondo (R$ ${valorNum.toLocaleString("pt-BR")}). Padrão atípico que merece conferência da nota e do comprovante de prestação — isoladamente, NÃO caracteriza irregularidade.`,
			);
			if (
				fund ===
				"Despesa analisada por critérios objetivos. Nenhum padrão de risco matemático ativado."
			)
				fund =
					"Valores perfeitamente redondos em rubricas de serviços intangíveis são estatisticamente menos frequentes em prestações reais (que costumam ter centavos). É apenas um sinal de atenção documental, sem qualquer conclusão de simulação ou fraude.";
		}

		if (
			regexLocacaoVeiculo.test(strBusca) &&
			medianaLocacao !== null &&
			valorNum >= 8000 &&
			valorNum > 3 * medianaLocacao
		) {
			score = Math.max(score, 55);
			if (classif === "REGULAR_COM_RESSALVA") classif = "PONTO_DE_ATENCAO";
			if (enquadramento === "Análise Automática (sem IA disponível)")
				enquadramento = "Despesa atípica na rubrica (lote analisado)";
			motivos.push(
				`Locação de veículo (R$ ${valorNum.toLocaleString("pt-BR")}) mais de 3× acima da mediana desta rubrica no próprio mandato (R$ ${medianaLocacao.toLocaleString("pt-BR")}). Pode ser pagamento trimestral/anual legítimo — recomenda-se verificar o contrato.`,
			);
			if (
				fund ===
				"Despesa analisada por critérios objetivos. Nenhum padrão de risco matemático ativado."
			)
				fund =
					"O valor é atípico apenas em comparação com as demais locações do próprio parlamentar no período. Não existe teto legal específico para esta rubrica no regime aplicável; o alerta é estatístico, não normativo.";
		}

		if (regexCombustivel.test(strBusca)) {
			const mes = String(d.dataDocumento || "").slice(0, 7);
			const chave = `${fornecedorDoc}|${mes}`;
			const acumuladoMensal = combustivelMensal.get(chave) || 0;
			if (acumuladoMensal > 8000) {
				score = Math.max(score, 85);
				classif = "DESVIO_DE_FINALIDADE";
				enquadramento = "Inviabilidade Física — Acórdão TCU 3.048/2019";
				motivos.push(
					`Acumulado mensal de combustível neste posto (R$ ${acumuladoMensal.toLocaleString("pt-BR")}) excede o limite físico aceitável para um único veículo (aprox. R$ 8.000/mês). Forte indício de nota fria ou abastecimento de frota de terceiros.`,
				);
				fund =
					"Gasto mensal acumulado em um único fornecedor incompatível com a capacidade de consumo de um veículo de mandato, sugerindo simulação de despesa, conforme tipologia do TCU.";
			}
		}

		if (
			regexCombustivel.test(strBusca) &&
			medianaCombustivel !== null &&
			valorNum >= 5000 &&
			valorNum > 3 * medianaCombustivel
		) {
			score = Math.max(score, 55);
			if (classif === "REGULAR_COM_RESSALVA") classif = "PONTO_DE_ATENCAO";
			if (enquadramento === "Análise Automática (sem IA disponível)")
				enquadramento = "Despesa atípica na rubrica (lote analisado)";
			motivos.push(
				`Gasto com combustível (R$ ${valorNum.toLocaleString("pt-BR")}) mais de 3× acima da mediana desta rubrica no próprio mandato (R$ ${medianaCombustivel.toLocaleString("pt-BR")}). Recomenda-se conferir a nota e a compatibilidade com a frota utilizada.`,
			);
			if (
				fund ===
				"Despesa analisada por critérios objetivos. Nenhum padrão de risco matemático ativado."
			)
				fund =
					"O valor é atípico apenas em comparação com os demais gastos de combustível do próprio parlamentar. O regime aplicável (" +
					regimeJuridico +
					") não fixa teto monetário específico para esta rubrica; o alerta é estatístico, não normativo.";
		}

		if (regexFretamento.test(strBusca) && valorNum > 50000) {
			if (eFornecedorDoador) {
				motivos.push(
					`Agravante: a empresa de táxi aéreo é doadora de campanha do parlamentar (valor do fretamento: R$ ${valorNum.toLocaleString("pt-BR")}).`,
				);
			} else {
				score = Math.max(score, 35);
				if (enquadramento === "Análise Automática (sem IA disponível)")
					enquadramento = "Fretamento de Aeronave — Valor Relevante";
				motivos.push(
					`Fretamento de aeronave com valor significativo (R$ ${valorNum.toLocaleString("pt-BR")}). Despesa legal, mas requer atenção ao trecho voado e à idoneidade do fornecedor.`,
				);
				if (
					fund ===
					"Despesa analisada por critérios objetivos. Nenhum padrão de risco matemático ativado."
				)
					fund =
						"Fretamento de aeronave em valor expressivo. Na ausência de conflito de interesses (empresa do parlamentar ou doador), esta despesa pode ser regular se compatível com o deslocamento à base eleitoral. A análise manual do trecho e da nota fiscal é recomendada.";
			}
		}

		const alertaStr =
			motivos.length > 0
				? motivos.join(" | ")
				: "Despesa sem padrões de risco identificados pela análise automática.";

		return {
			...d,
			score_letalidade: score,
			classificacao: classif,
			enquadramento_normativo: enquadramento,
			fundamentacao_tecnica: fund,
			motivo_ia: alertaStr,
		};
	});
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
export function fallbackL4OSINT(malhaOsint: any[]) {
	console.warn(
		"[OSINT TRIAGE] Todas as LLMs falharam. Aplicando Heurística Local L3...",
	);
	const contextNodes = malhaOsint.filter((n: any) => n._isContextOnly);
	const doadoresComContrato = new Set<string>();

	for (const ctx of contextNodes) {
		if (
			ctx.tipoContexto === "CONTRATOS_MUNICIPAIS_DOADORES" &&
			ctx.contratosPNCP
		) {
			for (const item of ctx.contratosPNCP) {
				if (item.cnpj) {
					doadoresComContrato.add(item.cnpj.replace(/\D/g, ""));
				}
			}
		}
	}

	return malhaOsint
		.filter((n: any) => !n._isContextOnly)
		.map((orig: any) => {
			let score = orig.data.score_letalidade ?? 20;
			let classificacao = "SEM_INDICIO_RELEVANTE";
			let motivo = orig.data.motivo_ia;
			let enquadramento = "-";
			let fundamentacao = "Nó avaliado limpo pela heurística de fallback.";

			const labelUpper = (orig.data.label || "").toUpperCase();
			const tipoUpper = (orig.data.tipo || "").toUpperCase();
			const codigoLimpo = String(
				orig.data.codigo || orig.data.cnpj || "",
			).replace(/\D/g, "");

			// Regra 1: Doador com contratos no PNCP (Toma-Lá-Dá-Cá)
			if (
				tipoUpper === "DOAÇÃO ELEITORAL" &&
				(doadoresComContrato.has(codigoLimpo) ||
					labelUpper.includes("FANTASMA"))
			) {
				score = 85;
				classificacao = "CONFLITO_INTERESSE";
				motivo = `[HEURÍSTICA] Doador de campanha com contratos públicos ativos identificados no PNCP ou indício de empresa fantasma. Risco elevado de conflito de interesses.`;
				enquadramento =
					"Lei nº 9.504/1997 / Princípio da Moralidade Administrativa";
				fundamentacao =
					"A empresa realizou doações eleitorais ao candidato e concomitantemente possui contratos ativos com a administração pública.";
			} else if (
				labelUpper.includes("FANTASMA") ||
				labelUpper.includes("FACHADA")
			) {
				score = 90;
				classificacao = "INDICIO_PENAL_RELEVANTE";
				motivo = `[HEURÍSTICA] Empresa com forte suspeita de ser de fachada/fantasma.`;
				enquadramento = "Código Penal, Art. 299 (Falsidade Ideológica)";
				fundamentacao =
					"Denominação ou características do fornecedor levantam suspeitas de inexistência física ou simulação societária.";
			}

			return {
				...orig,
				data: {
					...orig.data,
					score_letalidade: score,
					classificacao: classificacao,
					enquadramento_normativo: enquadramento,
					fundamentacao_tecnica: fundamentacao,
					motivo_ia: motivo,
				},
			};
		});
}

export function aplicarSafetyNetOSINT(resultado: any[], malhaOriginal: any[]): any[] {
	const contextNodes = malhaOriginal.filter((n: any) => n._isContextOnly);
	const doadoresComContrato = new Set<string>();

	for (const ctx of contextNodes) {
		if (
			ctx.tipoContexto === "CONTRATOS_MUNICIPAIS_DOADORES" &&
			ctx.contratosPNCP
		) {
			for (const item of ctx.contratosPNCP) {
				if (item.cnpj) {
					doadoresComContrato.add(item.cnpj.replace(/\D/g, ""));
				}
			}
		}
	}

	return resultado.map((n: any) => {
		const labelUpper = (n.data?.label || "").toUpperCase();
		const tipoUpper = (n.data?.tipo || "").toUpperCase();
		const codigoLimpo = String(n.data?.codigo || n.data?.cnpj || "").replace(
			/\D/g,
			"",
		);

		if (
			tipoUpper === "DOAÇÃO ELEITORAL" &&
			(doadoresComContrato.has(codigoLimpo) || labelUpper.includes("FANTASMA"))
		) {
			const currentScore = n.data?.score_letalidade ?? 0;
			if (currentScore < 85) {
				return {
					...n,
					data: {
						...n.data,
						score_letalidade: 85,
						classificacao: "CONFLITO_INTERESSE",
						motivo_ia:
							n.data.motivo_ia &&
							n.data.motivo_ia !== "Dado objetivo insuficiente para análise"
								? `[SAFETY_NET] ${n.data.motivo_ia}`
								: "[SAFETY_NET] Doador de campanha com contratos públicos ativos identificados no PNCP ou indício de empresa fantasma.",
						enquadramento_normativo:
							"Lei nº 9.504/1997 / Princípio da Moralidade Administrativa",
						fundamentacao_tecnica:
							"A empresa realizou doações eleitorais ao candidato e concomitantemente possui contratos ativos com a administração pública.",
					},
				};
			}
		} else if (
			labelUpper.includes("FANTASMA") ||
			labelUpper.includes("FACHADA")
		) {
			const currentScore = n.data?.score_letalidade ?? 0;
			if (currentScore < 90) {
				return {
					...n,
					data: {
						...n.data,
						score_letalidade: 90,
						classificacao: "INDICIO_PENAL_RELEVANTE",
						motivo_ia: "[SAFETY_NET] Empresa com forte suspeita de ser de fachada/fantasma.",
						enquadramento_normativo:
							"Código Penal, Art. 299 (Falsidade Ideológica)",
						fundamentacao_tecnica:
							"Denominação ou características do fornecedor levantam suspeitas de inexistência física ou simulação societária.",
					},
				};
			}
		}

		return n;
	});
}
