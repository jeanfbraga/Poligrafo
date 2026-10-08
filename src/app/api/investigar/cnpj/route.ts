import { buscarContratosPorFornecedor } from "@/services/integrations/contratos/fornecedor";
import { buscarConveniosEntidade } from "@/services/integrations/transparencia/convenios-client";
import { buscarSancoesEmpresa } from "@/services/integrations/transparencia/sancoes-empresa";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { documentoFormatado } from "@/lib/format";
import { resolverCnpjDaEmpresa } from "@/services/core/empresas-declaradas";
import { type EmpresaQsa, nomesDeReferencia } from "@/services/core/socio-confirmacao";
import { buscarDadosCnpj } from "@/services/integrations/receita/cnpj";

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

interface ParametrosPivo {
	/** 14 dígitos, ou vazio no modo por nome. */
	cnpj: string;
	/** Nome da empresa sem CNPJ (empresa declarada ao TSE). */
	nome: string;
	/** Nomes do político: no modo por nome, o QSA do CNPJ achado precisa tê-lo. */
	socios: string[];
	origemId: string;
}

/** Lê e valida a URL. O cliente antigo mandava o nome da empresa no próprio ?cnpj=. */
function lerParametros(url: string): ParametrosPivo | null {
	const sp = new URL(url).searchParams;
	const cnpjParam = sp.get("cnpj") ?? "";
	const temLetras = /[a-zA-Z]/.test(cnpjParam);
	const p: ParametrosPivo = {
		cnpj: temLetras ? "" : cnpjParam.replace(/\D/g, ""),
		nome: (sp.get("nome") || (temLetras ? cnpjParam : "")).trim(),
		socios: sp.getAll("socio").map((s) => s.trim()).filter(Boolean).slice(0, 4),
		origemId: (sp.get("origemId") ?? "").replace(/[^a-zA-Z0-9\-_]/g, "").trim(),
	};
	const alvoValido = p.cnpj.length === 14 || (!p.cnpj && p.nome.length >= 3);
	return alvoValido && p.origemId ? p : null;
}

/** Modo por nome: só aceita CNPJ com a razão social do nome e o político no QSA (empresas-declaradas.ts). */
async function cnpjPeloNome(p: ParametrosPivo, sendEvent: any): Promise<string | null> {
	const nomes = nomesDeReferencia(p.socios);
	if (nomes.length === 0) {
		sendEvent("ERROR", { mensagem: `Para achar o CNPJ de "${p.nome}" pelo nome é preciso saber quem é o sócio (o político investigado).` });
		return null;
	}
	sendEvent("STATUS", { msg: `Procurando o CNPJ de "${p.nome}" e conferindo o quadro de sócios na Receita...` });
	const achado = await resolverCnpjDaEmpresa(p.nome, { nomes, cpf: null });
	if (!achado) {
		sendEvent("ERROR", {
			mensagem: `Não foi possível confirmar o CNPJ de "${p.nome}": nenhum CNPJ encontrado nas fontes abertas tem essa razão social com o político no quadro de sócios.`,
		});
	}
	return achado?.cnpj ?? null;
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

/** Nó da empresa. Pivô a partir do próprio nó (empresa declarada sem CNPJ): atualiza o mesmo nó, sem trocar o motivo. */
function noDaEmpresa(empresa: EmpresaQsa, cnpjLimpo: string, p: ParametrosPivo) {
	const mesmoNo = p.origemId.startsWith("empresa-");
	const situacao = empresa.descricao_situacao_cadastral;
	return {
		id: mesmoNo ? p.origemId : `empresa-${cnpjLimpo}-${Date.now()}`,
		type: "EMPRESA",
		_origemId: p.origemId,
		data: {
			label: empresa.razao_social || p.nome || "RAZÃO SOCIAL INDISPONÍVEL",
			cnpj: documentoFormatado(cnpjLimpo),
			cnae: empresa.cnae_fiscal_descricao,
			situacao,
			capitalSocial: empresa.capital_social,
			municipio: empresa.municipio,
			uf: empresa.uf,
			...(mesmoNo || !situacao ? {} : { motivo_ia: `Empresa com situação cadastral ${situacao} na Receita Federal.` }),
		},
	};
}

async function pivotarEmpresa(p: ParametrosPivo, sendEvent: any): Promise<void> {
	const cnpjLimpo = p.cnpj || (await cnpjPeloNome(p, sendEvent));
	if (!cnpjLimpo) return;
	sendEvent("STATUS", { msg: `Levantando Dossiê Societário do CNPJ ${documentoFormatado(cnpjLimpo)}...` });
	const r = await buscarDadosCnpj(cnpjLimpo);
	if (!r.ok) {
		sendEvent("ERROR", {
			mensagem: `Não foi possível localizar o CNPJ ${documentoFormatado(cnpjLimpo)} nas bases públicas (BrasilAPI / Minha Receita / ReceitaWS).`,
		});
		return;
	}
	const no = noDaEmpresa(r.dados, cnpjLimpo, p);
	sendEvent("NODE_NOVO", no);
	emitirQsa(r.dados.qsa ?? [], no.id, cnpjLimpo, sendEvent);
	await executarVarreduraGovFederal(cnpjLimpo, no.id, r.dados.razao_social || "", sendEvent);
	sendEvent("DONE", { msg: `Expansão de Grafo concluída.` });
}

export async function GET(request: Request) {
	// Consulta Receita, Portal da Transparência e contratos: limite contra uso em massa
	const limitado = checkRateLimit(request, { scope: "cnpj", limit: 30 });
	if (limitado) return limitado;
	const p = lerParametros(request.url);
	if (!p) {
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
				await pivotarEmpresa(p, sendEvent);
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
