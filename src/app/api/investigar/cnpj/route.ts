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

async function buscarDadosCadastraisCnpj(cnpjLimpo: string): Promise<any | null> {
	try {
		const resBrasil = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
		if (resBrasil.ok) return await resBrasil.json();

		const resWS = await fetchWithTimeout(`https://receitaws.com.br/v1/cnpj/${cnpjLimpo}`);
		if (resWS.ok) {
			const wsData = await resWS.json();
			if (wsData.status !== "ERROR") {
				return {
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
	} catch (_e) {}
	return null;
}

function emitirQsa(qsa: any[], empresaId: string, cnpjLimpo: string, sendEvent: any) {
	if (!Array.isArray(qsa) || qsa.length === 0) return;
	sendEvent("STATUS", { msg: `Extraindo Quadro de Sócios e Administradores (QSA)...` });
	qsa.forEach((socio: any, idx: number) => {
		sendEvent("NODE_NOVO", {
			id: `socio-${cnpjLimpo}-${idx}-${Date.now()}`,
			type: "SOCIO",
			_origemId: empresaId,
			data: { label: socio.nome_socio, cargo: socio.qualificacao_socio, faixaEtaria: socio.faixa_etaria },
		});
	});
}

async function emitirContratosCompras(cnpjLimpo: string, empresaId: string, sendEvent: any) {
	try {
		const res = await fetchWithTimeout(
			`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${cnpjLimpo}`,
		);
		if (!res.ok) return;
		const comprasData = await res.json();
		const contratos = comprasData?._embedded?.contratos || [];
		contratos.slice(0, 3).forEach((contrato: any, idx: number) => {
			sendEvent("NODE_NOVO", {
				id: `contrato-empresa-${cnpjLimpo}-${idx}-${Date.now()}`,
				type: "CONTRATO",
				_origemId: empresaId,
				data: { label: `Contrato Gov. Federal`, objeto: contrato.objeto, valor: contrato.valor_inicial },
			});
		});
	} catch (_e) {}
}

async function emitirSancoesCgu(cnpjLimpo: string, empresaId: string, apiKey: string, sendEvent: any) {
	try {
		const res = await fetchWithTimeout(
			`https://api.portaldatransparencia.gov.br/api-de-dados/sancoes?cnpjSancionado=${cnpjLimpo}&pagina=1`,
			{ headers: { "chave-api-dados": apiKey } },
		);
		if (!res.ok) return;
		const sancoes = await res.json();
		if (!Array.isArray(sancoes) || sancoes.length === 0) return;
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
					objeto: s.fundamentacaoLegal || s.orgaoSancionador || "Detalhes indisponíveis",
					valor: 0,
					codigo: "CGU-SANÇÃO",
					ano: s.dataInicioSancao || "N/I",
				},
			});
		});
	} catch (_e) {}
}

async function emitirConveniosTransferegov(cnpjLimpo: string, empresaId: string, sendEvent: any) {
	try {
		const res = await fetchWithTimeout(
			`https://api.transferegov.gestao.gov.br/convenios?cnpj_convenente=${cnpjLimpo}`,
		);
		if (!res.ok) return;
		const convData = await res.json();
		if (!Array.isArray(convData) || convData.length === 0) return;
		const valorTotal = convData.reduce((acc: number, c: any) => acc + (Number(c.valor_global) || 0), 0);
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
	} catch (_e) {}
}

async function emitirAeronavesAnac(
	cnpjLimpo: string,
	empresaId: string,
	razaoSocial: string,
	sendEvent: any,
) {
	try {
		const res = await fetchWithTimeout(
			`https://rab.api.aero/v1/aeronaves?proprietario=${encodeURIComponent(cnpjLimpo)}`,
		);
		if (!res.ok) return;
		const anacData = await res.json();
		const aeronaves = Array.isArray(anacData) ? anacData : anacData?.aeronaves || [];
		aeronaves.slice(0, 3).forEach((anv: any, idx: number) => {
			sendEvent("NODE_NOVO", {
				id: `anac-drill-${cnpjLimpo}-${idx}-${Date.now()}`,
				type: "CONTRATO",
				_origemId: empresaId,
				data: {
					label: `AERONAVE ${anv.marca || anv.prefixo || "N/I"}`,
					objeto: `Proprietário: ${anv.proprietario_nome || razaoSocial} | Modelo: ${anv.modelo || "N/I"} | Fabricante: ${anv.fabricante || "N/I"}`,
					valor: 0,
					codigo: anv.marca || anv.prefixo || "ANAC",
					ano: "RAB/ANAC",
				},
			});
		});
	} catch (_e) {}
}

async function executarVarreduraGovFederal(
	cnpjLimpo: string,
	empresaId: string,
	razaoSocial: string,
	sendEvent: any,
) {
	const apiKey = process.env.TRANSPARENCIA_API_KEY;
	if (!apiKey) return;
	sendEvent("STATUS", { msg: `Buscando Contratos Federais Ativos...` });
	await emitirContratosCompras(cnpjLimpo, empresaId, sendEvent);
	sendEvent("STATUS", { msg: `Verificando cadastro de Sancionados/Inidôneos na CGU...` });
	await emitirSancoesCgu(cnpjLimpo, empresaId, apiKey, sendEvent);
	sendEvent("STATUS", { msg: `Buscando convênios federais no Transferegov...` });
	await emitirConveniosTransferegov(cnpjLimpo, empresaId, sendEvent);
	sendEvent("STATUS", { msg: `Varrendo Registro Aeronáutico Brasileiro (ANAC/RAB)...` });
	await emitirAeronavesAnac(cnpjLimpo, empresaId, razaoSocial, sendEvent);
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
				sendEvent("STATUS", { msg: `Levantando Dossiê Societário do CNPJ ${cnpj}...` });
				const empresa = await buscarDadosCadastraisCnpj(cnpjLimpo);

				if (!empresa) {
					sendEvent("ERROR", {
						mensagem: `Não foi possível localizar o CNPJ ${cnpj} nas bases públicas (BrasilAPI / ReceitaWS).`,
					});
					safeClose();
					return;
				}

				const empresaId = `empresa-${cnpjLimpo}-${Date.now()}`;
				sendEvent("NODE_NOVO", {
					id: empresaId,
					type: "EMPRESA",
					_origemId: origemId,
					data: {
						label: empresa.razao_social || "RAZÃO SOCIAL INDISPONÍVEL",
						cnpj,
						cnae: empresa.cnae_fiscal_descricao,
						situacao: empresa.descricao_situacao_cadastral,
						capitalSocial: empresa.capital_social,
						municipio: empresa.municipio,
						uf: empresa.uf,
					},
				});

				emitirQsa(empresa.qsa, empresaId, cnpjLimpo, sendEvent);
				await executarVarreduraGovFederal(cnpjLimpo, empresaId, empresa.razao_social || "", sendEvent);

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
