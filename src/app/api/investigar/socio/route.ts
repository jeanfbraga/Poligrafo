import { NextResponse } from "next/server";
import { buscarEmpresasDoSocio } from "@/services/core/socio-search";

export const dynamic = "force-dynamic";

function emitirEmpresasReversas(empresasAssociadas: any[], origemId: string, sendEvent: any) {
	empresasAssociadas.forEach((empresa: any, idx: number) => {
		sendEvent("NODE_NOVO", {
			id: `empresa-rev-${empresa.cnpj}-${idx}-${Date.now()}`,
			type: "EMPRESA",
			_origemId: origemId,
			data: {
				label: empresa.razao_social,
				cnpj: empresa.cnpj,
				situacao: empresa.situacao,
				cnae: empresa.cnae,
				capitalSocial: undefined,
			},
		});
	});
}

async function verificarContratosEmpresa(empresa: any, empIdx: number, sendEvent: any) {
	const cnpjEmp = (empresa.cnpj || "").replace(/\D/g, "");
	if (!cnpjEmp) return;
	try {
		const resCompras = await fetch(
			`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${cnpjEmp}`,
			{ signal: AbortSignal.timeout(4000) },
		);
		if (!resCompras.ok) return;
		const comprasData = await resCompras.json();
		const contratos = comprasData?._embedded?.contratos || [];
		contratos.slice(0, 2).forEach((c: any, cidx: number) => {
			sendEvent("NODE_NOVO", {
				id: `contrato-rev-${cnpjEmp}-${cidx}-${Date.now()}`,
				type: "CONTRATO",
				_origemId: `empresa-rev-${empresa.cnpj}-${empIdx}-${Date.now()}`,
				data: {
					label: `Contrato Gov. Federal`,
					objeto: c.objeto || "Não Informado",
					valor: Number(c.valor_inicial || 0),
				},
			});
		});
		if (contratos.length > 0) {
			sendEvent("STATUS", {
				msg: `[OSINT] ${contratos.length} contrato(s) federal(is) encontrado(s) para ${empresa.razao_social}`,
			});
		}
	} catch (_e) {}
}

async function verificarContratosEmpresas(empresasAssociadas: any[], sendEvent: any) {
	sendEvent("STATUS", {
		msg: `Verificando contratos federais nas ${empresasAssociadas.length} empresa(s)...`,
	});
	for (let i = 0; i < Math.min(empresasAssociadas.length, 5); i++) {
		await verificarContratosEmpresa(empresasAssociadas[i], i, sendEvent);
	}
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const nomeBruto = searchParams.get("nome");
	const origemIdBruto = searchParams.get("origemId");

	const nomeSocio = nomeBruto
		? nomeBruto.replace(/[^a-zA-Z0-9\sÁ-ÿ\-.]/g, "").trim()
		: null;
	const origemId = origemIdBruto
		? origemIdBruto.replace(/[^a-zA-Z0-9\-_]/g, "").trim()
		: null;

	if (!nomeSocio || !origemId) {
		return NextResponse.json(
			{ error: "Parâmetros ?nome e ?origemId válidos são obrigatórios." },
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
					msg: `Fazendo busca reversa de empresas para o sócio: ${nomeSocio}...`,
				});

				const empresasAssociadas = await buscarEmpresasDoSocio(nomeSocio);

				if (!empresasAssociadas || empresasAssociadas.length === 0) {
					sendEvent("STATUS", {
						msg: `Busca reversa concluída: Nenhuma outra empresa foi localizada publicamente para ${nomeSocio}.`,
					});
					sendEvent("DONE", {
						msg: `Aprofundamento de Malha Societária finalizado sem novas empresas.`,
					});
					safeClose();
					return;
				}

				sendEvent("STATUS", {
					msg: `Encontradas ${empresasAssociadas.length} empresas. Expandindo rede...`,
				});

				emitirEmpresasReversas(empresasAssociadas, origemId, sendEvent);
				await verificarContratosEmpresas(empresasAssociadas, sendEvent);

				sendEvent("DONE", {
					msg: `Aprofundamento de Malha Societária concluído para ${nomeSocio}.`,
				});
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
