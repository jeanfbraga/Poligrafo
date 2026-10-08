/**
 * Doadores pessoa física com cargo de confiança no governo federal.
 *
 * Para os maiores doadores (CPF, por valor doado), consulta `/servidores?cpf=`
 * no Portal da Transparência e cria o fato SERVIDOR_COMISSIONADO no CPF do
 * doador quando há função/cargo de confiança. Limite por investigação por causa
 * da cota do Portal (~80 consultas/min, dividida com as sanções).
 */
import { buscarFuncoesPorCpf, type FuncaoComissionada } from "@/services/integrations/transparencia/servidores";
import { dataIso } from "./datas";
import type { Fato } from "./tipos";

export const LIMITE_DOADORES_SERVIDORES = 15;

type BuscarFuncoes = (cpf: string) => Promise<FuncaoComissionada[]>;

/** CPFs dos doadores, do maior valor doado ao menor. */
export function doadoresParaConferir(fatos: Fato[], limite = LIMITE_DOADORES_SERVIDORES): string[] {
	const total = new Map<string, number>();
	for (const f of fatos) {
		if (f.papel !== "DOADOR" || f.documento.length !== 11) continue;
		total.set(f.documento, (total.get(f.documento) ?? 0) + (f.valor ?? 0));
	}
	return [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, limite).map(([cpf]) => cpf);
}

export function funcaoParaFato(cpf: string, nome: string, f: FuncaoComissionada, i: number, coletadoEm: string): Fato {
	const desde = f.dataIngressoFuncao ? `desde ${f.dataIngressoFuncao}` : "";
	return {
		id: `fato-servidor_comissionado-${cpf}-${i}`,
		papel: "SERVIDOR_COMISSIONADO",
		documento: cpf,
		nome,
		data: dataIso(f.dataIngressoFuncao) ?? undefined,
		periodo: { inicio: dataIso(f.dataIngressoFuncao), fim: null },
		detalhe: [f.funcao, f.atividade, f.orgao, desde].filter(Boolean).join(" — "),
		procedencia: {
			fonte: "Portal da Transparência — servidores do Executivo federal",
			chave: `cpf=${cpf}`,
			coletadoEm,
			url: "https://portaldatransparencia.gov.br/servidores",
		},
	};
}

export async function fatosDeServidores(
	fatos: Fato[],
	coletadoEm: string,
	buscar: BuscarFuncoes = (cpf) => buscarFuncoesPorCpf(cpf),
	limite = LIMITE_DOADORES_SERVIDORES,
): Promise<Fato[]> {
	const cpfs = doadoresParaConferir(fatos, limite);
	const nomes = new Map(fatos.filter((f) => f.papel === "DOADOR").map((f) => [f.documento, f.nome]));
	const respostas = await Promise.allSettled(cpfs.map((cpf) => buscar(cpf)));
	return respostas.flatMap((r, k) =>
		r.status === "fulfilled" ? r.value.map((f, i) => funcaoParaFato(cpfs[k], nomes.get(cpfs[k]) ?? "", f, i, coletadoEm)) : [],
	);
}
