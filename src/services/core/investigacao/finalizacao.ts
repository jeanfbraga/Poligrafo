/**
 * Fechamento: contratos do órgão ligado ao mandato e da própria casa (PNCP), motor de
 * cruzamentos (regras fixas, sem IA, com fonte e link — services/cruzamentos, nota 31),
 * gravação do dossiê, matemática de grafos e o DONE.
 */
import { analyzeGraphNetwork } from "@/lib/graph-analysis";
import { emitirColetaDoMandato } from "@/services/core/contratos-do-ente";
import { nomesDeReferencia } from "@/services/core/socio-confirmacao";
import { alvoDaCota, alvoDoGabinete, emitirCruzamentos } from "@/services/cruzamentos";
import { type Investigacao, status } from "./contexto";
import { gravarDossieFinal } from "./registro";

export interface Coletado {
	despesas: any[];
	doadores: any[];
	cnpjsEmpresas: string[];
}

async function cruzamentos(inv: Investigacao, c: Coletado): Promise<void> {
	const contratosDoEnte = emitirColetaDoMandato(await inv.coletaEnte, inv.pessoaId, inv.sendEvent);
	await emitirCruzamentos(
		{
			pessoaId: inv.pessoaId,
			casa: String(inv.dep.casa),
			doadores: c.doadores,
			empresasDoPolitico: c.cnpjsEmpresas,
			despesasMandato: c.despesas,
			nos: inv.nos,
			contratosDoEnte,
			sqCandidato: inv.identidade.sqCandidato,
			politico: { nomes: nomesDeReferencia([inv.dep.nome, inv.detalhes?.nomeCivil, inv.eleito?.nm_candidato]), cpf: inv.identidade.cpf },
			// Funcionários do gabinete (Câmara/CMRJ) × doadores, sócios de fornecedores e eleitos: cruzamentos/gabinete.ts
			gabinete: alvoDoGabinete(inv.dep),
			// A cota inteira (4 anos, agrupada por fornecedor) entra no cruzamento: cruzamentos/cota.ts
			cota: alvoDaCota(inv.dep),
		},
		inv.sendEvent,
	);
}

function analiseDoGrafo(inv: Investigacao): void {
	try {
		status(inv, "Executando matemática avançada de grafos...");
		inv.sendEvent("GRAPH_ANALYSIS_SCORES", analyzeGraphNetwork(inv.nos));
	} catch (e) {
		console.error("[Graphology] Falha ao analisar e enviar scores do grafo:", e);
	}
}

export async function finalizar(inv: Investigacao, c: Coletado): Promise<void> {
	await cruzamentos(inv, c);
	await gravarDossieFinal(inv);
	analiseDoGrafo(inv);
	inv.sendEvent("DONE", { msg: "Dossiê finalizado e entregue." });
	inv.p.safeClose();
}
