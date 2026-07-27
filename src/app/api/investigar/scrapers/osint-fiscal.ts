import { transparenciaLimiter } from "@/services/core/rate-limiter";
import { listarAtividadesAuditoria } from "@/services/integrations/denasus/client";
import {
	buscarCadirregTCU,
	buscarInabilitadosTCU,
} from "@/services/integrations/tcu/client";
import { traduzirJuridiquesSancoes } from "../ai_helpers";
import { fetchWithTimeout } from "../tse";
import { buscarProcessosDataJud } from "./judiciario";

export async function investigarPolitico(
	cpfLimpo: string,
	nome: string,
	uf: string,
	pessoaId: string,
	sendEvent: any,
) {
	let patrimonioTotal = 0;
	let sancoesCgu = false;
	const alertasPessoais: string[] = [];
	const bensDeclarados: any[] = [];

	if (!cpfLimpo || cpfLimpo === "00000000000")
		return { patrimonioTotal, sancoesCgu, alertasPessoais, bensDeclarados };

	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";

	try {
		// 1. Busca Patrimônio no TSE
		const urlBusca = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${uf}/2/2040602022/candidato`;
		const resBusca = await fetchWithTimeout(urlBusca, { timeout: 4000 });

		if (resBusca.ok) {
			const dataBusca = await resBusca.json();
			const candidato = dataBusca.candidatos?.find(
				(c: any) =>
					c.nomeUrna.toLowerCase() === nome.toLowerCase() ||
					c.nomeCompleto.toLowerCase() === nome.toLowerCase(),
			);

			if (candidato) {
				const urlBens = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/candidato/2040602022/${uf}/6/${candidato.id}/bens`;
				const resBens = await fetchWithTimeout(urlBens, { timeout: 4000 });
				if (resBens.ok) {
					const dataBens = await resBens.json();
					patrimonioTotal = dataBens.totalDeBens || 0;
					if (patrimonioTotal > 0)
						alertasPessoais.push(
							`[TSE] Patrimônio Declarado (2022): R$ ${patrimonioTotal.toLocaleString("pt-BR")}`,
						);
				}
			}
		}

		// 2. Busca Sanções/Ficha Suja na CGU
		if (apiKey) {
			const BASE_TRANSPARENCIA =
				"https://api.portaldatransparencia.gov.br/api-de-dados";
			const headers = { "chave-api-dados": apiKey };

			await transparenciaLimiter.acquire();

			const pSancao =
				cpfLimpo && cpfLimpo !== "00000000000" && cpfLimpo.length === 11
					? `codigoSancionado=${cpfLimpo}`
					: `nomeSancionado=${encodeURIComponent(nome)}`;
			const pCeaf =
				cpfLimpo && cpfLimpo !== "00000000000" && cpfLimpo.length === 11
					? `cpfSancionado=${cpfLimpo}`
					: `nomeSancionado=${encodeURIComponent(nome)}`;

			const basesSancoes = [
				{
					key: "ceis",
					url: `${BASE_TRANSPARENCIA}/ceis?${pSancao}&pagina=1`,
					nome: "CEIS (Empresas Inidôneas e Suspensas)",
				},
				{
					key: "cnep",
					url: `${BASE_TRANSPARENCIA}/cnep?${pSancao}&pagina=1`,
					nome: "CNEP (Empresas Punidas)",
				},
				{
					key: "ceaf",
					url: `${BASE_TRANSPARENCIA}/ceaf?${pCeaf}&pagina=1`,
					nome: "CEAF (Expulsões da Adm. Federal)",
				},
			];

			const pPep =
				cpfLimpo && cpfLimpo !== "00000000000" && cpfLimpo.length === 11
					? `cpf=${cpfLimpo}`
					: `nome=${encodeURIComponent(nome)}`;

			const consultasSancoesPEP = [
				...basesSancoes.map((b) =>
					fetchWithTimeout(b.url, { headers, timeout: 5000 })
						.then(async (r) => ({
							key: b.key,
							nome: b.nome,
							data: r.ok ? await r.json() : [],
						}))
						.catch(() => ({ key: b.key, nome: b.nome, data: [] })),
				),
				fetchWithTimeout(`${BASE_TRANSPARENCIA}/peps?${pPep}&pagina=1`, {
					headers,
					timeout: 5000,
				})
					.then(async (r) => ({
						key: "pep",
						nome: "PEP",
						data: r.ok ? await r.json() : [],
					}))
					.catch(() => ({ key: "pep", nome: "PEP", data: [] })),
			];

			const resultadosSancoesPEP =
				await Promise.allSettled(consultasSancoesPEP);

			for (const res of resultadosSancoesPEP) {
				if (res.status !== "fulfilled") continue;
				const { key, nome, data } = res.value as {
					key: string;
					nome: string;
					data: any;
				};

				if (key === "pep") {
					if (Array.isArray(data) && data.length > 0) {
						const pep = data[0];
						const funcao =
							pep.funcao || pep.descricaoFuncao || "Cargo de Alta Relevância";
						const orgao = pep.orgao?.nome || pep.orgao || "Órgão Federal";
						alertasPessoais.push(
							`[PEP] Pessoa Politicamente Exposta: ${funcao} — ${orgao}`,
						);
						sendEvent("STATUS", {
							msg: `[PEP] Confirmado: Pessoa Politicamente Exposta registrada na base federal (${funcao}).`,
						});
					}
				} else {
					if (Array.isArray(data) && data.length > 0) {
						sancoesCgu = true;
						alertasPessoais.push(
							`[ALERTA MÁXIMO] CPF consta na base ${nome}. ${data.length} registro(s) de sanção.`,
						);
						try {
							const ts = await traduzirJuridiquesSancoes(data);
							if (ts?.resumo_improbidade) {
								alertasPessoais.push(
									`[TCU/CGU RESUMO IA] ${ts.resumo_improbidade} (Gravidade: ${ts.gravidade})`,
								);
								sendEvent("NODE_NOVO", {
									id: `sancao-${key}-${cpfLimpo}`,
									type: "PROCESSO_JUDICIAL",
									_origemId: pessoaId,
									data: {
										label: `Sanção CGU: ${nome}`,
										tribunal: nome,
										assunto:
											"Ato de Improbidade / Irregularidade Administrativa",
										score_letalidade: ts.gravidade || 90,
										motivo_ia: ts.resumo_improbidade,
									},
								});
							} else {
								sendEvent("NODE_NOVO", {
									id: `sancao-${key}-${cpfLimpo}`,
									type: "PROCESSO_JUDICIAL",
									_origemId: pessoaId,
									data: {
										label: `Sanção CGU: ${nome}`,
										tribunal: nome,
										assunto: "Sanção Administrativa",
										score_letalidade: 95,
										motivo_ia: `O cidadão consta na base ${nome} da CGU. Restrição de Direitos e impedimento de contratar com a Administração Pública.`,
									},
								});
							}
						} catch (_err) {
							alertasPessoais.push(
								`[ALERTA MÁXIMO] O CPF consta na base ${nome} da CGU.`,
							);
						}
					}
				}
			}
		}

		// 3. Integração Oficial DATAJUD: Extrai Ações Judiciais (Classe 129)
		sendEvent("STATUS", {
			msg: `Verificando processos de Improbidade (Classe 129) no DataJud/CNJ...`,
		});
		await buscarProcessosDataJud(
			cpfLimpo,
			uf,
			pessoaId,
			sendEvent,
			alertasPessoais,
		);

		// 4. Integração DENASUS (Auditorias do SUS)
		try {
			sendEvent("STATUS", {
				msg: `Consultando auditorias do SUS no DENASUS...`,
			});
			const auditorias = await listarAtividadesAuditoria();

			const nomeLower = nome.toLowerCase().trim();
			const auditoriasPolitico = auditorias.filter((a) =>
				a.titulo.toLowerCase().includes(nomeLower),
			);

			auditoriasPolitico.forEach((aud, idx) => {
				alertasPessoais.push(
					`[DENASUS] Alvo citado em auditoria do SUS: "${aud.titulo}"`,
				);
				sendEvent("NODE_NOVO", {
					id: `denasus-auditoria-${cpfLimpo}-${idx}-${Date.now()}`,
					type: "PROCESSO_JUDICIAL",
					_origemId: pessoaId,
					data: {
						label: `Auditoria SUS (DENASUS)`,
						tribunal: `Departamento Nacional de Auditoria do SUS (${aud.uf || "Nacional"})`,
						assunto: aud.tipo || "Atividade de Auditoria",
						score_letalidade: aud.tipo === "Auditoria" ? 80 : 50,
						motivo_ia: `${aud.titulo}. Situação: ${aud.situacao}. Data: ${aud.data || "N/I"}. Resumo: ${aud.resumo || "N/A"}`,
					},
				});
			});
		} catch (err: any) {
			console.error("[DENASUS] Erro ao buscar auditorias:", err.message);
		}

		// 5. TCU Expandido (Inabilitados e CADIRREG)
		try {
			sendEvent("STATUS", {
				msg: `Consultando bases do TCU (Inabilitados e Contas Irregulares)...`,
			});
			const [inabilitados, cadirreg] = await Promise.all([
				buscarInabilitadosTCU(cpfLimpo),
				buscarCadirregTCU(cpfLimpo),
			]);

			if (inabilitados.length > 0) {
				alertasPessoais.push(
					`[TCU] Alerta Crítico: Pessoa INABILITADA para cargo público`,
				);
				inabilitados.forEach((inab, idx) => {
					const payload = {
						id: `tcu-inab-${cpfLimpo}-${idx}-${Date.now()}`,
						type: "PROCESSO_JUDICIAL" as const,
						_origemId: pessoaId,
						data: {
							label: `Inabilitado TCU`,
							tribunal: `Tribunal de Contas da União`,
							assunto: `Inabilitação para Cargo Público`,
							score_letalidade: 98,
							motivo_ia: `Pessoa inabilitada pelo TCU. Motivo: ${inab.motivo}. Deliberação: ${inab.deliberacao}. Período: ${inab.dataInicio} a ${inab.dataFim}.`,
						},
					};
					sendEvent("NODE_NOVO", payload);
				});
			}

			if (cadirreg.length > 0) {
				alertasPessoais.push(
					`[TCU] Alerta: Pessoa possui contas IRREGULARES no CADIRREG`,
				);
				cadirreg.forEach((cad, idx) => {
					const payload = {
						id: `tcu-cadirreg-${cpfLimpo}-${idx}-${Date.now()}`,
						type: "PROCESSO_JUDICIAL" as const,
						_origemId: pessoaId,
						data: {
							label: `CADIRREG TCU`,
							tribunal: `Tribunal de Contas da União`,
							assunto: `Contas Irregulares`,
							score_letalidade: 90,
							motivo_ia: `Registro no CADIRREG (Cadastro de Responsáveis com Contas Irregulares). Processo: ${cad.processo}. Situação: ${cad.situacao}.`,
						},
					};
					sendEvent("NODE_NOVO", payload);
				});
			}
		} catch (err: any) {
			console.error("[TCU] Erro ao buscar dados do TCU:", err.message);
		}

		// 6. Convênios Federais por CPF (Portal da Transparência)
		if (apiKey) {
			try {
				sendEvent("STATUS", {
					msg: `Consultando Convênios Federais do cidadão no Portal da Transparência...`,
				});
				await transparenciaLimiter.acquire();
				const urlConvenios = `https://api.portaldatransparencia.gov.br/api-de-dados/convenios?convenente=${cpfLimpo}&pagina=1`;
				const resConvenios = await fetchWithTimeout(urlConvenios, {
					headers: { "chave-api-dados": apiKey },
					timeout: 8000,
				});
				if (resConvenios.ok) {
					const conveniosData = await resConvenios.json();
					if (Array.isArray(conveniosData) && conveniosData.length > 0) {
						const valorTotalConvenio = conveniosData.reduce(
							(acc: number, c: any) =>
								acc + Number(c.valorTotal || c.valor_global || 0),
							0,
						);
						const orgaoConcedente =
							conveniosData[0]?.concedente?.nome ||
							conveniosData[0]?.orgaoConcedente ||
							"Órgão Federal";
						alertasPessoais.push(
							`[TRANSPARÊNCIA] Cidadão figura como convenente em ${conveniosData.length} Convênio(s) Federal(is). Valor total: R$ ${valorTotalConvenio.toLocaleString("pt-BR")}`,
						);
						sendEvent("NODE_NOVO", {
							id: `convenio-cpf-${cpfLimpo}-${Date.now()}`,
							type: "CONTRATO",
							_origemId: pessoaId,
							data: {
								label: `Convênio Federal (${conveniosData.length})`,
								objeto: `Convenente em ${conveniosData.length} convênio(s) com o Governo Federal.`,
								valor: valorTotalConvenio,
								orgao: orgaoConcedente,
								codigo: "CONVENIO_FEDERAL",
								situacao:
									conveniosData[0]?.situacao?.descricao ||
									conveniosData[0]?.situacao ||
									"Vigente",
								numeroConvenio:
									conveniosData[0]?.numeroConvenio ||
									conveniosData[0]?.numero ||
									"N/A",
								score_letalidade: 50,
								motivo_ia: `O cidadão está registrado como convenente em ${conveniosData.length} convênio(s) federal(is) no Portal da Transparência. Valor total: R$ ${valorTotalConvenio.toLocaleString("pt-BR")}. Situação recente: ${conveniosData[0]?.situacao?.descricao || "Vigente"}.`,
							},
						});
					}
				}
			} catch (err: any) {
				console.warn(
					"[TRANSPARÊNCIA] Erro ao buscar convênios por CPF:",
					err.message,
				);
			}
		}
	} catch (e) {
		console.error("[ETL] Erro Investigar Politico:", e);
	}

	return { patrimonioTotal, sancoesCgu, alertasPessoais, bensDeclarados };
}

export async function buscarReceitasFederais(
	docLimpo: string,
	pessoaId: string,
	sendEvent: any,
) {
	const isCnpj = docLimpo.length === 14;
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return;

	try {
		const paramCgu = isCnpj
			? `cnpjFornecedor=${docLimpo}&pagina=1`
			: `cpfFornecedor=${docLimpo}&pagina=1`;
		const res = await fetchWithTimeout(
			`https://api.portaldatransparencia.gov.br/api-de-dados/despesas/por-favorecido?${paramCgu}`,
			{ headers: { "chave-api-dados": apiKey }, timeout: 8000 },
		);
		if (res.ok) {
			const json = await res.json();
			const items = Array.isArray(json) ? json : json.data || [];
			items.slice(0, 5).forEach((item: any, i: number) => {
				sendEvent("NODE_NOVO", {
					id: `cgu-desp-${docLimpo}-${i}`,
					type: "DESPESA",
					_origemId: pessoaId,
					data: {
						label: item.nomeFavorecido || item.nomeCredor || "Recebedor",
						valor: Number(item.valor || item.valorPago || 0),
						type:
							item.funcao || item.elementoDespesa || "Despesa Federal (CGU)",
						dataDocumento: item.data || item.dataDocumento || "2024-01-01",
						score_letalidade: 70,
						motivo_ia: "[CGU] Repasse Federal Direto detectado.",
					},
				});
			});
		}
	} catch (e) {
		console.error("Erro CGU:", e);
	}

	if (isCnpj) {
		try {
			const res = await fetchWithTimeout(
				`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${docLimpo}`,
				{ timeout: 5000 },
			);
			if (res.ok) {
				const comprasData = await res.json();
				const contratos = comprasData?._embedded?.contratos || [];
				contratos.slice(0, 5).forEach((c: any, i: number) => {
					sendEvent("NODE_NOVO", {
						id: `compras-${docLimpo}-${i}`,
						type: "CONTRATO",
						_origemId: pessoaId,
						data: {
							label: c.fornecedor?.nome || "Contrato Federal",
							objeto: c.objeto || "Não Informado",
							valor: Number(c.valorInicial || 0),
						},
					});
				});
			}
		} catch (_e) {}
	}
}

export async function buscarCartaoCorporativo(
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	casaPolitico?: string,
) {
	if (!cpfLimpo || cpfLimpo === "00000000000") return;
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return;
	try {
		const anoAtual = new Date().getFullYear();
		const mesInicio = `01/01/${anoAtual - 2}`;
		const mesFim = `31/12/${anoAtual}`;
		let data: any[] = [];

		await transparenciaLimiter.acquire();

		if (cpfLimpo.length === 11) {
			const urlComData = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?cpfPortador=${cpfLimpo}&mesExtratoInicio=${mesInicio}&mesExtratoFim=${mesFim}&pagina=1`;
			let res = await fetchWithTimeout(urlComData, {
				headers: { "chave-api-dados": apiKey },
				timeout: 8000,
			});
			if (res.ok) {
				data = await res.json();
			}
			if (!data || data.length === 0) {
				const urlSimples = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?cpfPortador=${cpfLimpo}&pagina=1`;
				res = await fetchWithTimeout(urlSimples, {
					headers: { "chave-api-dados": apiKey },
					timeout: 6000,
				});
				if (res.ok) data = await res.json();
			}
		}

		if (casaPolitico === "PRESIDENCIA_DA_REPUBLICA") {
			sendEvent("STATUS", {
				msg: "Analisando faturas de Cartão de Pagamento do Governo Federal (CPGF)...",
			});
			const urlPresidencia = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?codigoOrgao=20000&dataTransacaoInicio=${mesInicio}&dataTransacaoFim=${mesFim}&pagina=1`;
			const resPresidencia = await fetchWithTimeout(urlPresidencia, {
				headers: { "chave-api-dados": apiKey },
				timeout: 8000,
			});
			if (resPresidencia.ok) {
				data = await resPresidencia.json();
				if (Array.isArray(data) && data.length > 0) {
					sendEvent("STATUS", {
						msg: `[CPGF] Consultando as faturas governamentais do Órgão Presidência da República...`,
					});
				}
			}
		}

		if (Array.isArray(data) && data.length > 0) {
			sendEvent("STATUS", {
				msg: `[CPGF] Detectados gastos com Cartão Corporativo. Rastreando...`,
			});

			data.slice(0, 10).forEach((item: any, idx: number) => {
				const isSigiloso = item.estabelecimento?.cnpjFormatado === "SIGILOSO";
				const tipoCartao = item.tipoCartao?.descricao || "CPGF";
				const nomeEstabelecimento =
					item.estabelecimento?.nomeRecebedor || "Fornecedor Desconhecido";
				const cnpjEstabelecimento =
					item.estabelecimento?.cnpjFormatado || "SIGILOSO";
				sendEvent("NODE_NOVO", {
					id: `cpgf-${cpfLimpo}-${idx}-${Date.now()}`,
					type: "DESPESA",
					_origemId: pessoaId,
					data: {
						label: isSigiloso
							? `GASTO SIGILOSO (${tipoCartao})`
							: nomeEstabelecimento,
						valor: item.valorTransacao,
						tipo: `Cartão Corporativo - ${tipoCartao}`,
						documento: cnpjEstabelecimento,
						estabelecimento: isSigiloso ? "SIGILOSO" : nomeEstabelecimento,
						tipoCartao: tipoCartao,
						dataDocumento: item.dataTransacao,
						orgao:
							item.unidadeGestora?.orgaoVinculado?.nomeOrgao || "Órgão Federal",
						portador: item.portador?.nome || "Portador Não Identificado",
						motivo_ia: isSigiloso
							? "Risco Alto: Transação protegida por sigilo de Estado."
							: `Gasto via Cartão Corporativo (${tipoCartao}) no estabelecimento: ${nomeEstabelecimento} (CNPJ: ${cnpjEstabelecimento}). Órgão: ${item.unidadeGestora?.orgaoVinculado?.nomeOrgao || "Órgão Federal"}. Portador: ${item.portador?.nome || "Não Ident."}. Data: ${item.dataTransacao}.`,
						score_letalidade: isSigiloso ? 85 : 55,
					},
				});
			});
		}
	} catch (e) {
		console.error("[OSINT CPGF Error]", e);
	}
}

export async function buscarViagensFAB(
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	_casaPolitico?: string,
) {
	if (!cpfLimpo || cpfLimpo === "00000000000") return;
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return;
	try {
		const url = `https://api.portaldatransparencia.gov.br/api-de-dados/viagens?cpfViajante=${cpfLimpo}&pagina=1`;
		let data: any[] = [];

		if (cpfLimpo.length === 11) {
			const res = await fetchWithTimeout(url, {
				headers: { "chave-api-dados": apiKey },
				timeout: 6000,
			});
			if (res.ok) {
				data = await res.json();
			}
		}

		if (Array.isArray(data) && data.length > 0) {
			sendEvent("STATUS", {
				msg: `[VIAGENS] Rastreando diárias governamentais e voos da Força Aérea Brasileira (FAB).`,
			});

			data.slice(0, 5).forEach((item: any, idx: number) => {
				sendEvent("NODE_NOVO", {
					id: `viagem-${cpfLimpo}-${idx}-${Date.now()}`,
					type: "DESPESA",
					_origemId: pessoaId,
					data: {
						label: `Viagem Oficial: ${item.destinos?.[0]?.localidadeDestino || "N/I"}`,
						valor: item.valorTotalViagem,
						tipo: item.tipoViagem?.descricao || "Viagem a Serviço",
						documento: cpfLimpo,
						dataDocumento: `${item.dataInicio} a ${item.dataFim}`,
						motivo_ia: item.motivo || "Motivo de viagem financiada pelo Estado",
						score_letalidade: item.valorTotalViagem > 25000 ? 75 : 45,
					},
				});
			});
		}
	} catch (e) {
		console.error("[OSINT Viagens Error]", e);
	}
}
