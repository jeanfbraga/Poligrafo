import { buscarAcordaosTcePA } from "../../app/api/investigar/estados/pa/tce";
import { buscarProcessosTceTo } from "../../app/api/investigar/estados/to/tce";
import { buscarProjetosLeiCamara } from "../../app/api/investigar/scrapers/legislativo";
import {
	buscarContratosPNCP,
	buscarConveniosTransferegov,
} from "../../app/api/investigar/scrapers/osint-contratos";
import {
	buscarCartaoCorporativo,
	buscarReceitasFederais,
	buscarViagensFAB,
} from "../../app/api/investigar/scrapers/osint-fiscal";
import { expandirMalhaSocietaria } from "../../app/api/investigar/scrapers/osint-societario";
import { buscarDoadoresTSE } from "../../app/api/investigar/tse";
import { buscarAeronavesProprietario } from "../integrations/anac/client";
import { buscarOperacoesBNDES } from "../integrations/bndes/client";
import {
	consultarFUNDEB,
	consultarPNAE,
	consultarPNATE,
} from "../integrations/fnde/client";
import { buscarInfracoesIbama } from "../integrations/ibama/client";
import {
	buscarEnteSiconfi,
	consultarIndicadoresLRF,
} from "../integrations/siconfi/client";
import { buscarCertidaoTCU } from "../integrations/tcu/client";
import { buscarEmendasPorCNPJ } from "../integrations/transferegov/client";

export interface OsintExecutorParams {
	deputadoBasico: any;
	cpfLimpo: string;
	pessoaId: string;
	sendEvent: (tipo: string, payload: any) => void;
	fichaPolitico: any;
	malhaOsintBuffer: any[];
	supabaseNodes: any[];
}

export async function executarMalhaOsint(params: OsintExecutorParams) {
	const {
		deputadoBasico,
		cpfLimpo,
		pessoaId,
		sendEvent,
		fichaPolitico,
		malhaOsintBuffer,
		supabaseNodes,
	} = params;

	const pushNode = (node: any) => {
		malhaOsintBuffer.push(node);
		supabaseNodes.push(node);
		if (node.type !== "PESSOA" || !node.id.includes("servidor")) {
			sendEvent("NODE_NOVO", node);
		}
	};

	// A.5. Investigação Nativa Jurisprudencial (TCE-PA e TCE-TO)
	if (deputadoBasico.uf === "PA") {
		sendEvent("STATUS", {
			msg: "Alvo do Pará detectado. Realizando scraping de Jurisprudência no TCE-PA...",
		});
		const acordaos = await buscarAcordaosTcePA(deputadoBasico.nome);
		if (acordaos.length > 0) {
			sendEvent("STATUS", {
				msg: `[TCE-PA] Foram encontrados ${acordaos.length} Acórdão(s)/Processo(s) atrelados ao nome do político.`,
			});
			acordaos.forEach((acordao, i) => {
				pushNode({
					id: `acordao-pa-${Date.now()}-${i}`,
					type: "PROCESSO_JUDICIAL",
					_origemId: pessoaId,
					data: {
						label: acordao.titulo,
						resumo: acordao.resumo,
						data: acordao.dataPublicacao,
						url: acordao.url,
						ementa: acordao.ementa,
						tribunal: "TCE-PA",
					},
				});
			});
		}
	}
	if (deputadoBasico.uf === "TO") {
		sendEvent("STATUS", {
			msg: "Alvo de Tocantins detectado. Vasculhando processos no TCE-TO (e-Contas)...",
		});
		const processosTO = await buscarProcessosTceTo(deputadoBasico.nome);
		if (processosTO.length > 0) {
			sendEvent("STATUS", {
				msg: `[TCE-TO] ${processosTO.length} processos de contas/denúncia detectados.`,
			});
			processosTO.forEach((proc, i) => {
				pushNode({
					id: `processo-to-${Date.now()}-${i}`,
					type: "PROCESSO_JUDICIAL",
					_origemId: pessoaId,
					data: {
						label: proc.numero_processo,
						resumo: proc.assunto,
						tribunal: "TCE-TO",
						ano: proc.ano,
						motivo_ia: `Processo de ${proc.assunto} referente ao ano de ${proc.ano}. Relator: ${proc.relator}.`,
					},
				});
			});
		}
	}

	if (fichaPolitico.patrimonioTotal > 0) {
		pushNode({
			id: `bens-${Date.now()}`,
			type: "CONTRATO",
			_origemId: pessoaId,
			data: {
				label: "Patrimônio Declarado (TSE)",
				objeto: "Total de Bens em 2022",
				valor: fichaPolitico.patrimonioTotal,
				codigo: "TSE-BENS",
				ano: "2022",
			},
		});
	}

	if (fichaPolitico.sancoesCgu) {
		sendEvent("STATUS", {
			msg: "[ALERTA MÁXIMO] O CPF do político consta no Cadastro de Inidôneos/Sancionados da CGU!",
		});
	}

	sendEvent("STATUS", {
		msg: "Vasculhando repasses diretos e contratos federais ao político na CGU...",
	});
	await buscarReceitasFederais(
		cpfLimpo || String(deputadoBasico.id),
		pessoaId,
		sendEvent,
	);

	sendEvent("STATUS", {
		msg: "Analisando faturas de Cartão de Pagamento do Governo Federal (CPGF)...",
	});
	await buscarCartaoCorporativo(
		cpfLimpo || String(deputadoBasico.id),
		pessoaId,
		sendEvent,
		deputadoBasico.casa,
	);

	sendEvent("STATUS", {
		msg: "Rastreando Viagens a Serviço e Voos da FAB financiados com recursos públicos...",
	});
	await buscarViagensFAB(
		cpfLimpo || String(deputadoBasico.id),
		pessoaId,
		sendEvent,
		deputadoBasico.casa,
	);

	sendEvent("STATUS", {
		msg: "Expandindo malha societária via BrasilAPI para rastrear blindagem patrimonial...",
	});
	const empresasRelacionadasCNPJs = await expandirMalhaSocietaria(
		cpfLimpo || String(deputadoBasico.id),
		pessoaId,
		sendEvent,
	);

	sendEvent("STATUS", {
		msg: `Fazendo busca reversa de empresas vinculadas ao nome "${deputadoBasico.nome}"...`,
	});
	try {
		const { buscarEmpresasDoSocio } = await import("./socio-search");
		const empresasPorNome = await buscarEmpresasDoSocio(deputadoBasico.nome);
		if (empresasPorNome && empresasPorNome.length > 0) {
			sendEvent("STATUS", {
				msg: `[OSINT] ${empresasPorNome.length} empresa(s) vinculada(s) ao nome do político encontrada(s)!`,
			});
			for (const emp of empresasPorNome) {
				const cnpjEmp = (emp.cnpj || "").replace(/\D/g, "");
				if (cnpjEmp && !empresasRelacionadasCNPJs.includes(cnpjEmp)) {
					empresasRelacionadasCNPJs.push(cnpjEmp);
					pushNode({
						id: `empresa-rev-${cnpjEmp}-${Date.now()}`,
						type: "EMPRESA",
						_origemId: pessoaId,
						data: {
							label: emp.razao_social || "Empresa Localizada",
							cnpj: cnpjEmp,
							situacao: emp.situacao || "N/I",
							cnae: emp.cnae || "N/I",
						},
					});
				}
			}
		}
	} catch (e) {
		console.warn("[Deep OSINT] Falha na busca reversa por nome:", e);
	}

	if (empresasRelacionadasCNPJs && empresasRelacionadasCNPJs.length > 0) {
		sendEvent("STATUS", {
			msg: `Localizadas ${empresasRelacionadasCNPJs.length} empresa(s). Varrendo base de Convênios do Transferegov para cada uma em paralelo...`,
		});

		const investigacoesEmpresas = empresasRelacionadasCNPJs.map(
			async (cnpjRastreado) => {
				sendEvent("STATUS", {
					msg: `[OSINT] Checando contratos federais para o CNPJ: ${cnpjRastreado}`,
				});
				await buscarReceitasFederais(
					cnpjRastreado,
					`empresa-${cnpjRastreado}`,
					sendEvent,
				);
				const convenios = await buscarConveniosTransferegov(cnpjRastreado);
				if (convenios && convenios.quantidade > 0) {
					sendEvent("STATUS", {
						msg: `[ALTA SUSPEIÇÃO] A empresa privada (${cnpjRastreado}) possui ${convenios.quantidade} convênio(s) federal(is) ativos milionários.`,
					});
					pushNode({
						id: `convenio-${cnpjRastreado}-${Date.now()}`,
						type: "CONTRATO",
						_origemId: `empresa-${cnpjRastreado}`,
						data: {
							label: "Convênio Transferegov.br",
							objeto: `${convenios.quantidade} convênios ativos milionários.`,
							valor: convenios.valorTotal,
							codigo: cnpjRastreado,
							ano: "Atual",
						},
					});
				}
			},
		);
		await Promise.allSettled(investigacoesEmpresas);
	} else {
		sendEvent("STATUS", {
			msg: "Nenhuma empresa vinculada com contratos federais abertos encontrada (BrasilAPI).",
		});
	}

	sendEvent("STATUS", {
		msg: "Varrendo Registro Aeronáutico Brasileiro (ANAC/RAB) por aeronaves vinculadas em paralelo...",
	});
	const alvosAnac = [deputadoBasico.nome];
	if (empresasRelacionadasCNPJs && empresasRelacionadasCNPJs.length > 0) {
		alvosAnac.push(...empresasRelacionadasCNPJs);
	}

	const investigacoesAnac = alvosAnac.map(async (alvoAnac) => {
		const aeronaves = await buscarAeronavesProprietario(alvoAnac);
		if (aeronaves.length > 0) {
			sendEvent("STATUS", {
				msg: `[ANAC] ${aeronaves.length} aeronave(s) localizada(s) vinculada(s) a "${alvoAnac}"!`,
			});
			for (const anv of aeronaves) {
				pushNode({
					id: `anac-${anv.prefixo || Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
					type: "CONTRATO" as const,
					_origemId: pessoaId,
					data: {
						label: `AERONAVE ${anv.prefixo || "N/I"}`,
						objeto: `Proprietário: ${anv.proprietario_nome || alvoAnac} | Modelo: ${anv.modelo || "N/I"} | Fabricante: ${anv.fabricante || "N/I"} | Status: ${anv.situacao || "N/I"}`,
						valor: 0,
						codigo: anv.prefixo || "ANAC",
						ano: "RAB/ANAC",
					},
				});
			}
		}
	});
	await Promise.allSettled(investigacoesAnac);

	if (empresasRelacionadasCNPJs && empresasRelacionadasCNPJs.length > 0) {
		sendEvent("STATUS", {
			msg: "Consultando financiamentos do BNDES para empresas vinculadas ao político...",
		});
		try {
			const cnpjsParaBNDES = empresasRelacionadasCNPJs.slice(0, 5);
			const resultadosBNDES = await Promise.allSettled(
				cnpjsParaBNDES.map((cnpj) => buscarOperacoesBNDES(cnpj)),
			);
			for (let i = 0; i < resultadosBNDES.length; i++) {
				const res = resultadosBNDES[i];
				if (res.status === "fulfilled" && res.value && res.value.length > 0) {
					const cnpj = cnpjsParaBNDES[i];
					const ops = res.value;
					const totalBNDES = ops.reduce((acc, op) => acc + (op.valor || 0), 0);
					sendEvent("STATUS", {
						msg: `[BNDES] ${ops.length} operação(ões) de financiamento para o CNPJ ${cnpj}. Total: R$ ${totalBNDES.toLocaleString("pt-BR")}`,
					});
					pushNode({
						id: `bndes-${cnpj}-${Date.now()}`,
						type: "CONTRATO" as const,
						_origemId: `empresa-${cnpj}`,
						data: {
							label: `Financiamento BNDES (${ops.length} op.)`,
							objeto: ops
								.slice(0, 3)
								.map((o) => `${o.produto || "N/I"} — ${o.situacao || "N/I"}`)
								.join(" | "),
							valor: totalBNDES,
							codigo: cnpj,
							ano: ops[0]?.data || "N/I",
							score_letalidade: 55,
							motivo_ia: `Empresa vinculada ao político recebeu financiamento subsidiado do BNDES.`,
						},
					});
				}
			}
		} catch (errBNDES: any) {
			console.warn(
				"[BNDES] Erro ao consultar financiamentos:",
				errBNDES.message || errBNDES,
			);
		}

		sendEvent("STATUS", {
			msg: "Consultando bases do IBAMA no cache (Supabase) para infrações ambientais...",
		});
		for (const cnpj of empresasRelacionadasCNPJs) {
			try {
				const infracoes = await buscarInfracoesIbama(cnpj);
				if (infracoes && infracoes.length > 0) {
					const valorTotalMultas = infracoes.reduce(
						(acc, inf) => acc + (inf.valor_multa || 0),
						0,
					);
					pushNode({
						id: `ibama-${cnpj}-${Date.now()}`,
						type: "PROCESSO_JUDICIAL" as const,
						_origemId: `empresa-${cnpj}`,
						data: {
							label: `Infrações Ambientais IBAMA (${infracoes.length})`,
							tribunal: "IBAMA",
							assunto: infracoes
								.slice(0, 3)
								.map((i) => i.tipo_infracao)
								.join(" | "),
							score_letalidade: 85,
							motivo_ia: `Empresa vinculada possui ${infracoes.length} infrações ambientais registradas no IBAMA totalizando R$ ${valorTotalMultas.toLocaleString("pt-BR")}.`,
						},
					});
				}
			} catch (errIbama: any) {
				console.warn(
					"[IBAMA] Erro ao consultar autuações ambientais:",
					errIbama.message || errIbama,
				);
			}
		}

		sendEvent("STATUS", {
			msg: "Consultando certidões unificadas no TCU para empresas...",
		});
		for (const cnpj of empresasRelacionadasCNPJs) {
			try {
				const certidao = await buscarCertidaoTCU(cnpj);
				if (certidao?.temInfracao) {
					const motivos = [];
					if (certidao.situacaoTcu !== "NADA_CONSTA")
						motivos.push(`TCU Inidôneos: ${certidao.situacaoTcu}`);
					if (certidao.situacaoCnj !== "NADA_CONSTA")
						motivos.push(`CNJ CNIA: ${certidao.situacaoCnj}`);
					if (certidao.situacaoCeis !== "NADA_CONSTA")
						motivos.push(`CGU CEIS: ${certidao.situacaoCeis}`);
					if (certidao.situacaoCnep !== "NADA_CONSTA")
						motivos.push(`CGU CNEP: ${certidao.situacaoCnep}`);

					pushNode({
						id: `tcu-certidao-${cnpj}-${Date.now()}`,
						type: "PROCESSO_JUDICIAL" as const,
						_origemId: pessoaId,
						data: {
							label: `Certidão Positiva APF: ${cnpj}`,
							tribunal: "TCU (Certidão Consolidada)",
							assunto: "Restrição em Base Federal",
							score_letalidade: 85,
							motivo_ia: `Empresa vinculada possui restrições ativas. Registros: ${motivos.join(" | ")}`,
						},
					});
				}
			} catch (errCert: any) {
				console.warn(
					"[TCU] Erro ao buscar certidão para empresa:",
					errCert.message || errCert,
				);
			}
		}

		sendEvent("STATUS", {
			msg: "Verificando se empresas vinculadas são beneficiárias diretas de Emendas PIX...",
		});
		for (const cnpj of empresasRelacionadasCNPJs) {
			try {
				const emendasDiretas = await buscarEmendasPorCNPJ(cnpj);
				if (emendasDiretas && emendasDiretas.length > 0) {
					const totalPix = emendasDiretas.reduce(
						(acc, curr) =>
							acc + (curr.valorCusteio || 0) + (curr.valorInvestimento || 0),
						0,
					);
					pushNode({
						id: `emenda-pix-${cnpj}-${Date.now()}`,
						type: "CONTRATO" as const,
						_origemId: pessoaId,
						data: {
							label: `Recebedor de Emenda PIX: ${cnpj}`,
							objeto: `Foram localizadas ${emendasDiretas.length} emendas destinadas DIRETAMENTE para esta empresa.`,
							valor: totalPix,
							codigo: "TRANSFEREGOV",
							ano: emendasDiretas[0].ano || "N/I",
							score_letalidade: 95,
							motivo_ia: `ALERTA MÁXIMO: Uma empresa ligada diretamente ao político investigado está recebendo recursos públicos via Emendas PIX ou Transferências Especiais.`,
						},
					});
				}
			} catch (errTg: any) {
				console.warn(
					"[TransfereGov] Erro ao buscar emendas para empresa:",
					errTg.message || errTg,
				);
			}
		}
	}

	if (
		deputadoBasico.casa === "CAMARA" &&
		deputadoBasico.uf === "RS" &&
		deputadoBasico.uri
	) {
		sendEvent("STATUS", {
			msg: "Alvo Federal do Rio Grande do Sul. Resgatando histórico de Compliance Fiscal no TCE-RS...",
		});
		try {
			const {
				buscarMunicipalRS,
				buscarDespesasVereadorRS: buscarDespesasMunicipalRS,
			} = require("../../app/api/investigar/estados/rs/tce");
			const docTce = cpfLimpo || String(deputadoBasico.id);
			const tceDespesas = await buscarDespesasMunicipalRS(
				docTce,
				deputadoBasico.nome,
				deputadoBasico.casa === "CAMARA" || deputadoBasico.casa === "SENADO" ? undefined : deputadoBasico.uri,
				deputadoBasico.casa,
			);
			if (tceDespesas && tceDespesas.length > 0) {
				tceDespesas.forEach((d: any, i: number) => {
					pushNode({
						id: `tcers-${Date.now()}-${i}`,
						type: "DESPESA_PUBLICA",
						_origemId: pessoaId,
						data: {
							label: d.tipoDespesa || "TCE-RS",
							valor: d.valorDocumento,
							fornecedor:
								d.nomeFornecedor || d.descricao || "Informação do TCE-RS",
							data: d.dataDocumento,
							url: d.urlDocumento || "https://dados.tce.rs.gov.br",
						},
					});
				});
			}
		} catch (e) {
			console.warn("[TCE-RS] Falha na integração federal:", e);
		}
	}

	if (deputadoBasico.casa === "PREFEITURA" && deputadoBasico.uf) {
		sendEvent("STATUS", {
			msg: "Consultando indicadores fiscais LRF do município no SICONFI (Tesouro Nacional)...",
		});
		try {
			const nomeMunicipioAlvo =
				(deputadoBasico as any)._nomeMunicipio || deputadoBasico.nome;
			const enteSiconfi = await buscarEnteSiconfi(
				deputadoBasico.uf,
				nomeMunicipioAlvo,
			);
			if (enteSiconfi) {
				const anoAtual = new Date().getFullYear();
				const indicadores = await consultarIndicadoresLRF(
					enteSiconfi.cod_ibge,
					anoAtual,
				);
				if (indicadores) {
					const pctStr = indicadores.percentualDespesaPessoal.toFixed(1);
					const situMsg =
						indicadores.situacaoLimite === "EXCEDIDO"
							? `[ALERTA CRÍTICO LRF] Limite de gasto com pessoal EXCEDIDO: ${pctStr}% da RCL (limite: ${indicadores.limiteMaximoPercentual}%)`
							: indicadores.situacaoLimite === "PRUDENCIAL"
								? `[ALERTA LRF] Gasto com pessoal no limite prudencial: ${pctStr}% da RCL`
								: indicadores.situacaoLimite === "ALERTA"
									? `[AVISO LRF] Gasto com pessoal em nível de alerta: ${pctStr}% da RCL`
									: `[SICONFI] Gasto com pessoal dentro do limite LRF: ${pctStr}% da RCL`;

					sendEvent("STATUS", { msg: situMsg });
					if (indicadores.situacaoLimite !== "NORMAL") {
						fichaPolitico.alertasPessoais.push(situMsg);
						pushNode({
							id: `siconfi-${enteSiconfi.cod_ibge}-${Date.now()}`,
							type: "PROCESSO_JUDICIAL" as const,
							_origemId: pessoaId,
							data: {
								label: `Saúde Fiscal LRF: ${enteSiconfi.ente}`,
								tribunal: "Tesouro Nacional (SICONFI)",
								assunto: `Despesa com Pessoal ${pctStr}% — ${indicadores.situacaoLimite}`,
								score_letalidade:
									indicadores.situacaoLimite === "EXCEDIDO"
										? 85
										: indicadores.situacaoLimite === "PRUDENCIAL"
											? 65
											: 45,
								motivo_ia: `O município ${enteSiconfi.ente}/${enteSiconfi.uf} está com despesa de pessoal em ${pctStr}% da Receita Corrente Líquida (RCL: R$ ${indicadores.receitaCorrenteLiquidaAjustada.toLocaleString("pt-BR")}). Limite máximo LRF: ${indicadores.limiteMaximoPercentual}%.`,
							},
						});
					}
				}
			}
		} catch (errSiconfi: any) {
			console.warn(
				"[SICONFI] Erro ao consultar indicadores LRF:",
				errSiconfi.message || errSiconfi,
			);
		}

		sendEvent("STATUS", {
			msg: "Consultando repasses educacionais do FNDE (PNAE/FUNDEB/PNATE)...",
		});
		try {
			const nomeMunicipioAlvo =
				(deputadoBasico as any)._nomeMunicipio || deputadoBasico.nome;
			const anoAtual = new Date().getFullYear();

			const [pnae, fundeb, pnate] = await Promise.all([
				consultarPNAE(nomeMunicipioAlvo, deputadoBasico.uf, anoAtual),
				consultarFUNDEB(nomeMunicipioAlvo, deputadoBasico.uf, anoAtual),
				consultarPNATE(deputadoBasico.uf, nomeMunicipioAlvo),
			]);

			const labelFNDE = [];
			const infoPNAE =
				pnae.length > 0
					? `PNAE (Merenda): R$ ${(pnae[0].valorFnde || 0).toLocaleString("pt-BR")} para ${pnae[0].totalAlunos} alunos.`
					: "";
			if (infoPNAE) labelFNDE.push(infoPNAE);

			const infoFUNDEB =
				fundeb.length > 0
					? `FUNDEB: R$ ${(fundeb[0].valorRepasseEstimado || 0).toLocaleString("pt-BR")} (Est.) para ${fundeb[0].quantidadeMatriculas} matrículas.`
					: "";
			if (infoFUNDEB) labelFNDE.push(infoFUNDEB);

			const infoPNATE =
				pnate.length > 0
					? `PNATE (Transporte): Atende ${pnate[0].alunosAtendidos} alunos.`
					: "";
			if (infoPNATE) labelFNDE.push(infoPNATE);

			if (labelFNDE.length > 0) {
				pushNode({
					id: `fnde-${deputadoBasico.uf}-${Date.now()}`,
					type: "CONTRATO" as const,
					_origemId: pessoaId,
					data: {
						label: `Repasses FNDE (${anoAtual})`,
						objeto: labelFNDE.join(" | "),
						valor:
							(pnae[0]?.valorFnde || 0) +
							(fundeb[0]?.valorRepasseEstimado || 0),
						codigo: "FNDE",
						ano: anoAtual.toString(),
						score_letalidade: 30,
						motivo_ia: `O município recebe repasses federais da educação (FNDE). Cruzamentos futuros podem verificar se há empresas financiadas desviando estes recursos.`,
					},
				});
			}
		} catch (errFnde: any) {
			console.warn(
				"[FNDE] Erro ao consultar repasses:",
				errFnde.message || errFnde,
			);
		}
	}

	sendEvent("STATUS", {
		msg: "Iniciando análise: 'Siga o Dinheiro da Campanha'...",
	});
	const tseDataFollow = (deputadoBasico as any)._tseResult;

	let cargoTse = "6"; // Padrão: Federal
	if (deputadoBasico.casa === "SENADO") cargoTse = "5";
	else if (["ALERJ", "ALESP"].includes(deputadoBasico.casa)) cargoTse = "7";
	else if (
		["CAMARA_MUNICIPAL_SP", "CAMARA_MUNICIPAL_RJ"].includes(deputadoBasico.casa)
	)
		cargoTse = "13";
	else if (deputadoBasico.casa === "GOVERNO_ESTADUAL") cargoTse = "3";
	else if (deputadoBasico.casa === "PREFEITURA") cargoTse = "11";

	const eleicaoIdTse = ["3", "5", "6", "7"].includes(cargoTse)
		? "2040602022"
		: "2045202024";
	const localidadeCodigo =
		tseDataFollow?.idUe ||
		(deputadoBasico.casa === "GOVERNO_ESTADUAL"
			? deputadoBasico.uf
			: undefined);

	let doadores = tseDataFollow?.doadores;

	if (localidadeCodigo) {
		if (!doadores) {
			sendEvent("STATUS", {
				msg: `Puxando financiadores de campanha no TSE...`,
			});
			doadores = await buscarDoadoresTSE(
				deputadoBasico.nome,
				localidadeCodigo,
				cargoTse,
				eleicaoIdTse,
			);
		}

		const doadoresUnicosFornecedores = [
			...new Set(doadores.filter((d: string) => d.length === 14)),
		].slice(0, 15);
		if (doadoresUnicosFornecedores.length > 0) {
			sendEvent("STATUS", {
				msg: `Identificados ${doadoresUnicosFornecedores.length} doadores CNPJ. Cruzando com contratos da União...`,
			});
			for (const cnpjDoador of doadoresUnicosFornecedores) {
				sendEvent("STATUS", {
					msg: `Investigando doador CNPJ ${cnpjDoador} no Compras.gov...`,
				});
				try {
					const resComp = await fetch(
						`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${cnpjDoador}`,
					);
					if (resComp.ok) {
						const compJson = await resComp.json();
						const contratos = compJson?._embedded?.contratos || [];
						if (contratos.length > 0) {
							const valorTotal = contratos.reduce(
								(acc: number, c: any) => acc + (Number(c.valor_inicial) || 0),
								0,
							);
							pushNode({
								id: `toma-la-da-ca-${cnpjDoador}-${Date.now()}`,
								type: "DESPESA" as const,
								_origemId: pessoaId,
								data: {
									label: "DOADOR COM CONTRATO PÚBLICO",
									valor: valorTotal,
									tipo: "CONFLITO DE INTERESSE (TOMA-LÁ-DÁ-CÁ)",
									dataDocumento: String(new Date().getFullYear()),
									score_letalidade: 100,
									motivo_ia: `ALERTA TOMA-LÁ-DÁ-CÁ: Empresa financiou a campanha e possui contratos milionários ativos com o governo (CNPJ: ${cnpjDoador}).`,
								},
							});
							sendEvent("STATUS", {
								msg: `[RED FLAG] Doador ${cnpjDoador} possui R$ ${valorTotal.toLocaleString("pt-BR")} em contratos federais!`,
							});
						}
					}
					await new Promise((r) => setTimeout(r, 400));
				} catch (_e) {}
			}
		} else {
			sendEvent("STATUS", {
				msg: "Nenhum doador CNPJ identificado no TSE para este mandato.",
			});
		}
	}

	sendEvent("STATUS", {
		msg: `Extraindo Projetos de Lei e Histórico Legislativo...`,
	});
	let proposicoesLegislativas: any[] = [];
	if (deputadoBasico.casa === "CAMARA") {
		proposicoesLegislativas = await buscarProjetosLeiCamara(deputadoBasico.id);
	}

	sendEvent("STATUS", {
		msg: `Cruzando Financiadores no Portal Nacional de Contratações (PNCP)...`,
	});
	const contratosPNCPGlobais: any[] = [];
	const cnpjsPNCP: string[] = [];

	if (
		Array.isArray(doadores) &&
		doadores.length > 0 &&
		typeof doadores[0] === "string"
	) {
		cnpjsPNCP.push(
			...[...new Set(doadores as string[])]
				.filter((d) => d.length === 14)
				.slice(0, 5),
		);
	}

	if (cnpjsPNCP.length > 0) {
		const promessasPNCP = cnpjsPNCP.map((cnpj) =>
			buscarContratosPNCP(cnpj).then((ct) => {
				if (ct.length > 0) contratosPNCPGlobais.push({ cnpj, contratos: ct });
			}),
		);
		await Promise.allSettled(promessasPNCP);
	}

	if (proposicoesLegislativas.length > 0) {
		malhaOsintBuffer.push({
			_isContextOnly: true,
			tipoContexto: "PROJETOS_LEI_AUTORIA",
			projetos: proposicoesLegislativas,
		});
	}

	if (contratosPNCPGlobais.length > 0) {
		malhaOsintBuffer.push({
			_isContextOnly: true,
			tipoContexto: "CONTRATOS_MUNICIPAIS_DOADORES",
			contratosPNCP: contratosPNCPGlobais,
		});
		sendEvent("STATUS", {
			msg: `[OSINT] Localizados contratos municipais atrelados a financiadores recobrindo a malha na IA!`,
		});
	}
}
