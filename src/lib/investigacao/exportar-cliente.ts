/* Exportação do dossiê (.docx) no navegador: POST na API e download do blob. */
import type { DossieNode } from "./dossie-state";
import { montarPayloadExportacao, nomeArquivoDossie } from "./exportacao";

export async function exportarDossieDocx(
	nodes: DossieNode[],
	evidencias: DossieNode[],
	nomeBusca: string,
): Promise<string> {
	const payload = montarPayloadExportacao(nodes, evidencias, nomeBusca);
	const res = await fetch("/api/exportar-dossie", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw new Error("Falha ao gerar dossiê.");
	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = nomeArquivoDossie(payload.nomePolitico);
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
	return payload.nomePolitico;
}
