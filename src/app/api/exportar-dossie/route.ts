import { type NextRequest, NextResponse } from "next/server";
import { gerarDossieDocx } from "@/lib/investigacao/dossie-docx/documento";
import { idCamaraValido } from "@/lib/investigacao/dossie-docx/modelo";
import { montarPerfilDossie, PERFIL_INDISPONIVEL, type PerfilNoDossie } from "@/lib/investigacao/dossie-docx/perfil";
import { buscarDadosPerfilCamara } from "@/lib/investigacao/dossie-docx/perfil-dados";
import { nomeArquivoDossie, type PayloadExportacao } from "@/lib/investigacao/exportacao";

/**
 * POST /api/exportar-dossie
 *
 * Gera o Dossiê de dados públicos em DOCX (A4 retrato):
 * capa → sumário executivo → atuação parlamentar → registros detalhados → fontes → metodologia.
 * Com `idCamara` (deputado federal), anexa gabinete, cota mensal contra o teto e votos do perfil.
 * Montagem em lib/investigacao/dossie-docx (modelo puro + renderização).
 */

async function perfilDoDeputado(idCamara: string, agora: Date): Promise<PerfilNoDossie> {
	const dados = await buscarDadosPerfilCamara(idCamara);
	return dados ? montarPerfilDossie(idCamara, dados, agora) : PERFIL_INDISPONIVEL;
}
export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as Partial<PayloadExportacao>;
		const nomePolitico = typeof body.nomePolitico === "string" ? body.nomePolitico.trim() : "";

		if (!nomePolitico) {
			return NextResponse.json({ error: "Nome do político é obrigatório." }, { status: 400 });
		}

		const agora = new Date();
		const idCamara = idCamaraValido(body.idCamara);
		const buffer = await gerarDossieDocx(
			{
				nomePolitico,
				politico: body.politico,
				idCamara,
				despesasCriticas: Array.isArray(body.despesasCriticas) ? body.despesasCriticas : [],
				urlsNotasFiscais: Array.isArray(body.urlsNotasFiscais) ? body.urlsNotasFiscais : [],
			},
			agora,
			idCamara ? await perfilDoDeputado(idCamara, agora) : null,
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
