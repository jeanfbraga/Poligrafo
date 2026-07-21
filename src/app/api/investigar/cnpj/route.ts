import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function fetchWithTimeout(resource: string, options: any = {}) {
	const timeout = 4500;
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(resource, {
			...options,
			signal: controller.signal,
		});
		clearTimeout(id);
		return response;
	} catch (e) {
		clearTimeout(id);
		throw e;
	}
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const cnpj = searchParams.get("cnpj");
	const origemIdBruto = searchParams.get("origemId");

	const cnpjLimpo = cnpj ? cnpj.replace(/\D/g, "") : "";
	const origemId = origemIdBruto
		? origemIdBruto.replace(/[^a-zA-Z0-9\-_]/g, "").trim()
		: null;

	if (cnpjLimpo?.length !== 14 || !origemId) {
		return NextResponse.json(
			{
				error:
					"Parâmetros ?cnpj (14 dígitos) e ?origemId válidos são obrigatórios.",
			},
			{ status: 400 },
		);
	}
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			let isStreamClosed = false;
			const safeClose = () => {
				if (!isStreamClosed) {
					isStreamClosed = true;
					try {
						controller.close();
					} catch (_e) {}
				}
			};
			const sendEvent = (tipo: string, payload: any) => {
				if (isStreamClosed) return;
				try {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify({ tipo, payload })}\n\n`),
					);
				} catch (_e) {}
			};

			try {
				sendEvent("STATUS", {
					msg: `Levantando Dossiê Societário do CNPJ ${cnpj}...`,
				});

				let empresa = null;

				try {
					const resBrasil = await fetchWithTimeout(
						`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,
					);
					if (resBrasil.ok) {
						empresa = await resBrasil.json();
					} else {
						// Fallback para ReceitaWS se a BrasilAPI falhar (ex: Forbidden / Rate Limit)
						const resWS = await fetchWithTimeout(
							`https://receitaws.com.br/v1/cnpj/${cnpjLimpo}`,
						);
						if (resWS.ok) {
							const wsData = await resWS.json();
							if (wsData.status !== "ERROR") {
								empresa = {
									razao_social: wsData.nome,
									cnae_fiscal_descricao: wsData.atividade_principal?.[0]?.text,
									descricao_situacao_cadastral: wsData.situacao,
									capital_social: wsData.capital_social,
									municipio: wsData.municipio,
									uf: wsData.uf,
									qsa:
										wsData.qsa?.map((s: any) => ({
											nome_socio: s.nome,
											qualificacao_socio: s.qual,
											faixa_etaria: "",
										})) || [],
								};
							}
						}
					}
				} catch (_e) {
					// Ignora erro de parse/rede temporário e deixa o block abaixo tratar o null
				}

				if (!empresa) {
					sendEvent("ERROR", {
						mensagem: `Não foi possível localizar o CNPJ ${cnpj} nas bases públicas (BrasilAPI / ReceitaWS).`,
					});
					safeClose();
					return;
				}

				// Cria o nó da Empresa
				const empresaId = `empresa-${cnpjLimpo}-${Date.now()}`;
				sendEvent("NODE_NOVO", {
					id: empresaId,
					type: "EMPRESA",
					_origemId: origemId, // Frontend usará isso para ligar a aresta
					data: {
						label: empresa.razao_social || "RAZÃO SOCIAL INDISPONÍVEL",
						cnpj: cnpj,
						cnae: empresa.cnae_fiscal_descricao,
						situacao: empresa.descricao_situacao_cadastral,
						capitalSocial: empresa.capital_social,
						municipio: empresa.municipio,
						uf: empresa.uf,
					},
				});

				// 2. Cria os Nós dos Sócios
				if (empresa.qsa && Array.isArray(empresa.qsa)) {
					sendEvent("STATUS", {
						msg: `Extraindo Quadro de Sócios e Administradores (QSA)...`,
					});

					empresa.qsa.forEach((socio: any, idx: number) => {
						sendEvent("NODE_NOVO", {
							id: `socio-${cnpjLimpo}-${idx}-${Date.now()}`,
							type: "SOCIO",
							_origemId: empresaId, // Sócios se ligam à Empresa
							data: {
								label: socio.nome_socio,
								cargo: socio.qualificacao_socio,
								faixaEtaria: socio.faixa_etaria,
							},
						});
					});
				}

				// 3. Busca Sanções / Contratos (Portal da Transparência / Compras)
				const apiKey = process.env.TRANSPARENCIA_API_KEY;
				if (apiKey) {
					sendEvent("STATUS", { msg: `Buscando Contratos Federais Ativos...` });
					try {
						const resCompras = await fetchWithTimeout(
							`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${cnpjLimpo}`,
						);
						if (resCompras.ok) {
							const comprasData = await resCompras.json();
							const contratos = comprasData?._embedded?.contratos || [];

							contratos.slice(0, 3).forEach((contrato: any, idx: number) => {
								sendEvent("NODE_NOVO", {
									id: `contrato-empresa-${cnpjLimpo}-${idx}-${Date.now()}`,
									type: "CONTRATO",
									_origemId: empresaId, // Contratos se ligam à Empresa
									data: {
										label: `Contrato Gov. Federal`,
										objeto: contrato.objeto,
										valor: contrato.valor_inicial,
									},
								});
							});
						}
					} catch (_e) {
						console.warn("Falha ao buscar contratos da empresa.");
					}

					// Fix 5: Checagem de SANÇÕES CGU no CNPJ da empresa
					sendEvent("STATUS", {
						msg: `Verificando cadastro de Sancionados/Inidôneos na CGU...`,
					});
					try {
						const resSancoes = await fetchWithTimeout(
							`https://api.portaldatransparencia.gov.br/api-de-dados/sancoes?cnpjSancionado=${cnpjLimpo}&pagina=1`,
							{
								headers: { "chave-api-dados": apiKey },
							},
						);
						if (resSancoes.ok) {
							const sancoes = await resSancoes.json();
							if (Array.isArray(sancoes) && sancoes.length > 0) {
								sendEvent("STATUS", {
									msg: `[ALERTA] Empresa consta no Cadastro de Sancionados da CGU! ${sancoes.length} registro(s).`,
								});
								sancoes.slice(0, 3).forEach((s: any, idx: number) => {
									sendEvent("NODE_NOVO", {
										id: `sancao-${cnpjLimpo}-${idx}-${Date.now()}`,
										type: "CONTRATO",
										_origemId: empresaId,
										data: {
											label: `SANÇÃO CGU: ${s.tipoSancao || "Sanção"}`,
											objeto:
												s.fundamentacaoLegal ||
												s.orgaoSancionador ||
												"Detalhes indisponíveis",
											valor: 0,
											codigo: "CGU-SANÇÃO",
											ano: s.dataInicioSancao || "N/I",
										},
									});
								});
							}
						}
					} catch (_e) {}

					// Fix 6: Consultar Transferegov por convênios federais ativos
					sendEvent("STATUS", {
						msg: `Buscando convênios federais no Transferegov...`,
					});
					try {
						const resConv = await fetchWithTimeout(
							`https://api.transferegov.gestao.gov.br/convenios?cnpj_convenente=${cnpjLimpo}`,
						);
						if (resConv.ok) {
							const convData = await resConv.json();
							if (Array.isArray(convData) && convData.length > 0) {
								const valorTotal = convData.reduce(
									(acc: number, c: any) => acc + (Number(c.valor_global) || 0),
									0,
								);
								sendEvent("STATUS", {
									msg: `[ATENÇÃO] ${convData.length} convênio(s) federal(is). Valor total: R$ ${valorTotal.toLocaleString("pt-BR")}`,
								});
								sendEvent("NODE_NOVO", {
									id: `convenio-drill-${cnpjLimpo}-${Date.now()}`,
									type: "CONTRATO",
									_origemId: empresaId,
									data: {
										label: `Convênio Transferegov`,
										objeto: `${convData.length} convênio(s) federal(is)`,
										valor: valorTotal,
										codigo: cnpjLimpo,
										ano: "Atual",
									},
								});
							}
						}
					} catch (_e) {}

					// Fix 7: Checagem ANAC/RAB por aeronaves registradas neste CNPJ
					sendEvent("STATUS", {
						msg: `Varrendo Registro Aeronáutico Brasileiro (ANAC/RAB)...`,
					});
					try {
						const resAnac = await fetchWithTimeout(
							`https://rab.api.aero/v1/aeronaves?proprietario=${encodeURIComponent(cnpjLimpo)}`,
						);
						if (resAnac.ok) {
							const anacData = await resAnac.json();
							const aeronaves = Array.isArray(anacData)
								? anacData
								: anacData.aeronaves || [];
							aeronaves.slice(0, 3).forEach((anv: any, idx: number) => {
								sendEvent("NODE_NOVO", {
									id: `anac-drill-${cnpjLimpo}-${idx}-${Date.now()}`,
									type: "CONTRATO",
									_origemId: empresaId,
									data: {
										label: `AERONAVE ${anv.marca || anv.prefixo || "N/I"}`,
										objeto: `Proprietário: ${anv.proprietario_nome || empresa.razao_social} | Modelo: ${anv.modelo || "N/I"} | Fabricante: ${anv.fabricante || "N/I"}`,
										valor: 0,
										codigo: anv.marca || anv.prefixo || "ANAC",
										ano: "RAB/ANAC",
									},
								});
							});
						}
					} catch (_e) {}
				}

				sendEvent("DONE", { msg: `Expansão de Grafo concluída.` });
				safeClose();
			} catch (err: any) {
				sendEvent("ERROR", { mensagem: err.message });
				safeClose();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
