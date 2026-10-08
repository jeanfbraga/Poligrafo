import { buscarContratosPorFornecedor } from "@/services/integrations/contratos/fornecedor";
import { buscarConveniosEntidade } from "@/services/integrations/transparencia/convenios-client";
import { buscarSancoesEmpresa } from "@/services/integrations/transparencia/sancoes-empresa";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";

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

		const resMinha = await fetchWithTimeout(`https://minhareceita.org/${cnpjLimpo}`);
		if (resMinha.ok) {
			const mData = await resMinha.json();
			return {
				razao_social: mData.razao_social || mData.nome_fantasia,
				cnae_fiscal_descricao: mData.cnae_fiscal_descricao,
				descricao_situacao_cadastral: mData.descricao_situacao_cadastral,
				capital_social: mData.capital_social,
				municipio: mData.municipio,
				uf: mData.uf,
				qsa:
					mData.qsa?.map((s: any) => ({
						nome_socio: s.nome_socio,
						qualificacao_socio: s.qualificacao_socio,
						faixa_etaria: s.faixa_etaria,
					})) || [],
			};
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
		// Contratos em que a empresa é fornecedora (CGU + PNCP conferido; compras.dados legado não existe mais).
		const contratos = await buscarContratosPorFornecedor(cnpjLimpo, { paginasCgu: 1, paginasPncp: 1 });
		contratos.slice(0, 3).forEach((contrato) => {
			sendEvent("NODE_NOVO", {
				id: `contrato-empresa-${contrato.id}`,
				type: "CONTRATO",
				_origemId: empresaId,
				data: {
					label: contrato.orgaoEntidade.razaoSocial || "Contrato público",
					objeto: contrato.objetoContrato,
					valor: contrato.valorGlobal,
					url: contrato.url,
				},
			});
		});
	} catch (_e) {}
}

async function emitirSancoesCgu(cnpjLimpo: string, empresaId: string, apiKey: string, sendEvent: any) {
	try {
		// CEIS/CNEP/CEPIM: o antigo /sancoes?cnpjSancionado= não existe.
		const sancoes = (await buscarSancoesEmpresa(cnpjLimpo, apiKey)).map((s) => s.registro);
		if (sancoes.length === 0) return;
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
		// Convênios pelo Portal da Transparência (o /convenios do TransfereGov responde 404).
		const convData = await buscarConveniosEntidade(cnpjLimpo);
		if (convData.length === 0) return;
		const valorTotal = convData.reduce((acc: number, c) => acc + (Number(c.valorGlobal) || 0), 0);
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
	// Consulta Receita, Portal da Transparência e contratos: limite contra uso em massa
	const limitado = checkRateLimit(request, { scope: "cnpj", limit: 30 });
	if (limitado) return limitado;
	const { searchParams } = new URL(request.url);
	const cnpjParam = searchParams.get("cnpj") || "";
	const nomeParam = searchParams.get("nome") || "";
	const origemIdBruto = searchParams.get("origemId");

	let cnpjLimpo = cnpjParam.replace(/\D/g, "");
	const origemId = origemIdBruto
		? origemIdBruto.replace(/[^a-zA-Z0-9\-_]/g, "").trim()
		: null;

	const temNome = Boolean(nomeParam?.trim()) || /[a-zA-Z]/.test(cnpjParam);
	const termoNome = (nomeParam || (temNome ? cnpjParam : "")).trim();

	if ((cnpjLimpo.length !== 14 && (!temNome || termoNome.length < 3)) || !origemId) {
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
				if (cnpjLimpo.length !== 14 && termoNome.length >= 3) {
					sendEvent("STATUS", { msg: `Localizando CNPJ para "${termoNome}" nas fontes públicas...` });
					const { resolverCnpjPorNomeEmpresa } = await import("@/services/core/socio-search");
					const c = await resolverCnpjPorNomeEmpresa(termoNome);
					if (c) {
						cnpjLimpo = c.replace(/\D/g, "");
					} else {
						sendEvent("ERROR", {
							mensagem: `Não foi possível localizar o CNPJ de "${termoNome}" nos registros abertos.`,
						});
						safeClose();
						return;
					}
				}

				const { documentoFormatado } = await import("@/lib/format");
				const cnpjFormatado = documentoFormatado(cnpjLimpo);
				sendEvent("STATUS", { msg: `Levantando Dossiê Societário do CNPJ ${cnpjFormatado}...` });
				const empresa = await buscarDadosCadastraisCnpj(cnpjLimpo);

				if (!empresa) {
					sendEvent("ERROR", {
						mensagem: `Não foi possível localizar o CNPJ ${cnpjFormatado} nas bases públicas (BrasilAPI / ReceitaWS / MinhaReceita).`,
					});
					safeClose();
					return;
				}

				const empresaId = origemId.startsWith("empresa-") ? origemId : `empresa-${cnpjLimpo}-${Date.now()}`;
				sendEvent("NODE_NOVO", {
					id: empresaId,
					type: "EMPRESA",
					_origemId: origemId,
					data: {
						label: empresa.razao_social || termoNome || "EMPRESA LOCALIZADA",
						cnpj: cnpjFormatado,
						cnae: empresa.cnae_fiscal_descricao,
						situacao: empresa.descricao_situacao_cadastral,
						capitalSocial: empresa.capital_social,
						municipio: empresa.municipio,
						uf: empresa.uf,
						motivo_ia: empresa.descricao_situacao_cadastral
							? `Empresa com situação cadastral ${empresa.descricao_situacao_cadastral} na Receita Federal.`
							: undefined,
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
