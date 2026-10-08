/**
 * Despesas de gabinete das assembleias legislativas fora de SP e RJ (que têm
 * caminho próprio: ALESP e ALERJ/DOCIGP), por UF. Ver nota 29 do Obsidian.
 *
 * Cada UF nova entra nesta tabela quando houver fonte aberta conferida. Sem
 * fonte, o log diz isso — nada é inventado.
 */
import { despesasAlmgParaOPipe } from "./almg";

type Emissor = (tipo: string, payload: any) => void;
type Fonte = (nome: string, sendEvent: Emissor) => Promise<any[]>;

export const FONTES_ASSEMBLEIA: Record<string, Fonte> = {
	MG: (nome, sendEvent) => despesasAlmgParaOPipe(nome, sendEvent),
};

export async function despesasDaAssembleia(uf: string, nome: string, sendEvent: Emissor, fontes: Record<string, Fonte> = FONTES_ASSEMBLEIA): Promise<any[]> {
	const fonte = fontes[String(uf).toUpperCase()];
	if (!fonte) {
		sendEvent("STATUS", { msg: `Assembleia Legislativa de ${uf}: sem fonte aberta de despesas de gabinete integrada. Seguindo com as demais fontes.` });
		return [];
	}
	try {
		return await fonte(nome, sendEvent);
	} catch (erro) {
		console.warn(`[ASSEMBLEIA ${uf}] Falha nas despesas de gabinete:`, erro);
		return [];
	}
}
