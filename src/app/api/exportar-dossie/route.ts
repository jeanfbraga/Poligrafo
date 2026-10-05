import { type NextRequest, NextResponse } from "next/server";
import { gerarDossieDocx } from "@/lib/investigacao/dossie-docx/documento";
import { nomeArquivoDossie, type PayloadExportacao } from "@/lib/investigacao/exportacao";

/**
 * POST /api/exportar-dossie
 *
 * Gera o Dossiê de dados públicos em DOCX (A4 retrato):
 * capa → sumário executivo → registros detalhados → fontes → metodologia.
 * Montagem em lib/investigacao/dossie-docx (modelo puro + renderização).
 */
export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as Partial<PayloadExportacao>;
		const nomePolitico = typeof body.nomePolitico === "string" ? body.nomePolitico.trim() : "";

		if (!nomePolitico) {
			return NextResponse.json({ error: "Nome do político é obrigatório." }, { status: 400 });
		}

		const agora = new Date();
		const buffer = await gerarDossieDocx(
			{
				nomePolitico,
				politico: body.politico,
				despesasCriticas: Array.isArray(body.despesasCriticas) ? body.despesasCriticas : [],
				urlsNotasFiscais: Array.isArray(body.urlsNotasFiscais) ? body.urlsNotasFiscais : [],
			},
			agora,
		);

		return new Response(new Uint8Array(buffer), {
			headers: {
				"Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				"Content-Disposition": `attachment; filename="${nomeArquivoDossie(nomePolitico, agora)}"`,
			},
		});
	} catch (error: any) {
		console.error("[Exportar Dossiê] Erro:", error);
		return NextResponse.json({ error: error.message || "Erro ao gerar DOCX." }, { status: 500 });
	}
}
