/**
 * Motor de cruzamentos — entrada única para o pipe. Ver nota 31 do Obsidian.
 *
 * Junta os fatos do que a investigação já coletou, confere sanções dos CNPJs
 * que importam, aplica as regras e devolve os achados como nós "ACHADO"
 * (com os fatos, as fontes e os links). Nenhuma nota é inventada: a severidade
 * vem da regra; a IA, depois, só explica.
 */
import { documentoParaPrompt } from "@/lib/documento";
import { normalizarDespesa } from "@/services/core/despesa-normalizada";
import type { SancaoEmpresa } from "@/services/integrations/transparencia/sancoes-empresa";
import {
	completarNomes,
	fatosDeDespesasMandato,
	fatosDeDoadores,
	fatosDeEmpresasDoPolitico,
	fatosDeNos,
	type NoGrafo,
} from "./adaptadores";
import { type ExplicacaoAchado, explicarAchados } from "./explicacao-ia";
import { executarCruzamentos } from "./motor";
import { fatosDeSancoes } from "./sancoes";
import type { Achado, Fato, Severidade } from "./tipos";

export type { Achado, Fato } from "./tipos";

export interface EntradaCruzamentos {
	pessoaId: string;
	/** Casa/fonte das despesas do mandato (ex.: "CAMARA"). */
	casa: string;
	/** Lista de CPF/CNPJ do TSE (qualquer outra coisa é ignorada). */
	doadores: unknown;
	empresasDoPolitico: string[];
	/** Despesas do mandato como chegaram da fonte (são normalizadas aqui). */
	despesasMandato: unknown[];
	nos: NoGrafo[];
	agora?: () => Date;
	buscarSancoes?: (cnpj: string) => Promise<SancaoEmpresa[]>;
	/** IA que só explica (padrão: gateway gratuito); injetável nos testes. */
	explicar?: (nos: ReturnType<typeof achadoParaNo>[]) => Promise<ExplicacaoAchado[]>;
}

export async function cruzarDadosDaInvestigacao(e: EntradaCruzamentos): Promise<{ fatos: Fato[]; achados: Achado[] }> {
	const coletadoEm = (e.agora?.() ?? new Date()).toISOString();
	const despesas = (e.despesasMandato ?? []).map((d) => normalizarDespesa(d, { fonte: e.casa, natureza: "MANDATO" }));
	const base = [
		...fatosDeDoadores(Array.isArray(e.doadores) ? e.doadores : [], coletadoEm),
		...fatosDeEmpresasDoPolitico(e.empresasDoPolitico ?? [], coletadoEm),
		...fatosDeDespesasMandato(despesas, coletadoEm),
		...fatosDeNos(e.nos ?? [], coletadoEm),
	];
	const sancoes = await fatosDeSancoes(base, coletadoEm, e.buscarSancoes);
	const fatos = completarNomes([...base, ...sancoes]);
	return { fatos, achados: executarCruzamentos(fatos) };
}

/** Severidade → nota no padrão do dossiê (lib/investigacao/risco.ts: ≥85 crítico, ≥60 atenção). */
export const NOTA_SEVERIDADE: Record<Severidade, number> = { ALTA: 90, MEDIA: 70, BAIXA: 50 };

function fatoParaTela(f: Fato) {
	return {
		papel: f.papel,
		nome: f.nome,
		detalhe: f.detalhe ?? null,
		valor: f.valor ?? null,
		data: f.data ?? null,
		fonte: f.procedencia.fonte,
		url: f.procedencia.url ?? null,
		chave: f.procedencia.chave.replace(/\d{11,14}/g, (d) => documentoParaPrompt(d)),
		coletadoEm: f.procedencia.coletadoEm,
	};
}

type Emissor = (tipo: string, payload: any) => void;

/** Reemite o nó com a explicação da IA (mesmo id: o cache guarda a última versão). Gravidade intocada. */
async function explicarComIA(
	nos: ReturnType<typeof achadoParaNo>[],
	explicar: NonNullable<EntradaCruzamentos["explicar"]>,
	sendEvent: Emissor,
): Promise<void> {
	if (nos.length === 0) return;
	const explicacoes = await explicar(nos).catch(() => []);
	const porId = new Map(explicacoes.map((x) => [x.achado_id, x]));
	for (const no of nos) {
		const x = porId.get(no.id);
		if (x) sendEvent("NODE_NOVO", { ...no, data: { ...no.data, explicacao_ia: x.texto, prioridade_ia: x.prioridade, fatos_citados_ia: x.fatos_citados } });
	}
}

/** Roda o motor e emite um nó "ACHADO" por cruzamento. Falha aqui nunca derruba o dossiê. */
export async function emitirCruzamentos(e: EntradaCruzamentos, sendEvent: Emissor): Promise<Achado[]> {
	try {
		sendEvent("STATUS", { msg: "Cruzando doadores, empresas, cota, contratos e sanções (regras fixas, sem IA)..." });
		const { fatos, achados } = await cruzarDadosDaInvestigacao(e);
		const nos = achados.map((achado) => achadoParaNo(achado, fatos, e.pessoaId));
		for (const no of nos) sendEvent("NODE_NOVO", no);
		sendEvent("STATUS", {
			msg: achados.length
				? `[CRUZAMENTO] ${achados.length} cruzamento(s) entre ${fatos.length} fatos verificados.`
				: `[CRUZAMENTO] Nenhum cruzamento entre os ${fatos.length} fatos coletados.`,
		});
		await explicarComIA(nos, e.explicar ?? explicarAchados, sendEvent);
		return achados;
	} catch (erro) {
		console.warn("[CRUZAMENTOS] Falha no motor:", erro);
		return [];
	}
}

/** Achado → nó do grafo. CPF de pessoa física sai mascarado (LGPD). */
export function achadoParaNo(achado: Achado, fatos: Fato[], pessoaId: string) {
	const porId = new Map(fatos.map((f) => [f.id, f]));
	// O id vai para o cache e para links: CPF só com os 6 dígitos do meio.
	const idDoc = achado.documento.length === 11 ? `cpf${achado.documento.slice(3, 9)}` : achado.documento;
	return {
		id: `achado-${achado.regra}-${idDoc}`,
		type: "ACHADO",
		_origemId: pessoaId,
		data: {
			label: achado.titulo,
			regra: achado.regra,
			severidade: achado.severidade,
			documento: documentoParaPrompt(achado.documento),
			nome: achado.nome,
			somenteRaiz: achado.somenteRaiz,
			score_letalidade: NOTA_SEVERIDADE[achado.severidade],
			motivo_ia: achado.resumo,
			gerado_por: "regra (sem IA)",
			fatos: achado.fatos.map((id) => porId.get(id)).filter((f): f is Fato => Boolean(f)).map(fatoParaTela),
		},
	};
}
