/**
 * Despesas de gabinete das assembleias legislativas fora de SP e RJ (que têm
 * caminho próprio: ALESP e ALERJ/DOCIGP), por UF. Ver nota 29 do Obsidian.
 *
 * Cada UF nova entra nesta tabela quando houver fonte aberta conferida. Sem
 * fonte, o log diz isso — nada é inventado.
 */
import { despesasAlmgParaOPipe } from "./almg";
import { despesasCldfParaOPipe } from "./cldf";

type Emissor = (tipo: string, payload: any) => void;

/** Nome do deputado e, quando a identidade confirmou, o CPF (a CLDF publica o CPF em cada lançamento). */
export interface AlvoAssembleia {
	nome: string;
	cpf?: string | null;
}

type Fonte = (alvo: AlvoAssembleia, sendEvent: Emissor) => Promise<any[]>;

export const FONTES_ASSEMBLEIA: Record<string, Fonte> = {
	MG: (alvo, sendEvent) => despesasAlmgParaOPipe(alvo.nome, sendEvent),
	DF: (alvo, sendEvent) => despesasCldfParaOPipe(alvo, sendEvent),
};

export async function despesasDaAssembleia(uf: string, deputado: string | AlvoAssembleia, sendEvent: Emissor, fontes: Record<string, Fonte> = FONTES_ASSEMBLEIA): Promise<any[]> {
	const alvo = typeof deputado === "string" ? { nome: deputado } : deputado;
	const fonte = fontes[String(uf).toUpperCase()];
	if (!fonte) {
		sendEvent("STATUS", { msg: `Assembleia Legislativa de ${uf}: sem fonte aberta de despesas de gabinete integrada. Seguindo com as demais fontes.` });
		return [];
	}
	try {
		return await fonte(alvo, sendEvent);
	} catch (erro) {
		console.warn(`[ASSEMBLEIA ${uf}] Falha nas despesas de gabinete:`, erro);
		return [];
	}
}
