/**
 * Motor de cruzamentos — entrada única para o pipe. Ver nota 31 do Obsidian.
 *
 * Junta os fatos do que a investigação já coletou, confere sanções dos CNPJs
 * que importam, aplica as regras e devolve os achados como nós "ACHADO"
 * (com os fatos, as fontes e os links). Nenhuma nota é inventada: a severidade
 * vem da regra; a IA, depois, só explica.
 */
import { documentoParaPrompt } from "@/lib/documento";
import { type DespesaNormalizada, normalizarDespesa } from "@/services/core/despesa-normalizada";
import type { EmpresaQsa } from "@/services/core/socio-confirmacao";
import { buscarContasCampanha, type ContasCampanha } from "@/services/integrations/tse/campanha";
import type { SancaoEmpresa } from "@/services/integrations/transparencia/sancoes-empresa";
import {
	completarNomes,
	fatosDeContasCampanha,
	fatosDeContratosDoEnte,
	fatosDeDespesasMandato,
	fatosDeDoadores,
	fatosDeEmpresasDoPolitico,
	fatosDeNos,
	type NoGrafo,
	semFatoRepetido,
} from "./adaptadores";
import { emitirEtapa } from "@/services/core/etapas-ao-vivo";
import { carregarGabinete } from "@/services/integrations/gabinete/pessoal";
import { type ExplicacaoAchado, explicarAchados } from "./explicacao-ia";
import { type AlvoGabinete, type DadosGabinete, fatosDoGabinete, pessoasDoGabinete } from "./gabinete";
import { documentoLegivel, executarCruzamentos } from "./motor";
import { fatosDeSancoes } from "./sancoes";
import { fatosDeServidores } from "./servidores";
import { fatosDeSocios, LIMITE_QSA, type Politico } from "./socios";
import type { FuncaoComissionada } from "@/services/integrations/transparencia/servidores";
import type { Achado, Fato, Severidade } from "./tipos";

export { alvoDoGabinete } from "./gabinete";
export type { Achado, Fato } from "./tipos";

export interface EntradaCruzamentos {
	pessoaId: string;
	/** Casa/fonte das despesas do mandato (ex.: "CAMARA"). */
	casa: string;
	/** Lista antiga de CPF/CNPJ do TSE (por nome); ignorada quando há contas por sq_candidato. */
	doadores: unknown;
	empresasDoPolitico: string[];
	/** Despesas do mandato como chegaram da fonte (são normalizadas aqui). */
	despesasMandato: unknown[];
	nos: NoGrafo[];
	/** TODOS os contratos do órgão ligado ao mandato (PNCP); no dossiê só aparecem os maiores. */
	contratosDoEnte?: DespesaNormalizada[];
	/** Número do candidato confirmado pela identidade (base de eleitos). */
	sqCandidato?: string | null;
	/** Nomes e CPF confirmado do político (para achá-lo no QSA dos fornecedores). */
	politico?: Politico | null;
	agora?: () => Date;
	buscarSancoes?: (cnpj: string) => Promise<SancaoEmpresa[]>;
	buscarContas?: (sq: string | null | undefined) => Promise<ContasCampanha | null>;
	buscarQsa?: (cnpj: string) => Promise<EmpresaQsa | null>;
	buscarFuncoes?: (cpf: string) => Promise<FuncaoComissionada[]>;
	/** Gabinete do próprio político (Câmara ou CMRJ); `alvoDoGabinete` decide. Outras casas: null. */
	gabinete?: AlvoGabinete | null;
	carregarGabinete?: (alvo: AlvoGabinete) => Promise<DadosGabinete | null>;
	/** IA que só explica (padrão: gateway gratuito); injetável nos testes. */
	explicar?: (nos: ReturnType<typeof achadoParaNo>[]) => Promise<ExplicacaoAchado[]>;
}

/** Contas por sq_candidato (sem homônimo) substituem a lista antiga por nome. */
function fatosDeCampanha(e: EntradaCruzamentos, contas: ContasCampanha | null, coletadoEm: string): Fato[] {
	if (contas && (contas.doadores.length || contas.fornecedores.length)) {
		return fatosDeContasCampanha([...contas.doadores, ...contas.fornecedores], coletadoEm, String(e.sqCandidato));
	}
	return fatosDeDoadores(Array.isArray(e.doadores) ? e.doadores : [], coletadoEm);
}

function fatosColetados(e: EntradaCruzamentos, contas: ContasCampanha | null, coletadoEm: string): Fato[] {
	const despesas = (e.despesasMandato ?? []).map((d) => normalizarDespesa(d, { fonte: e.casa, natureza: "MANDATO" }));
	return completarNomes(semFatoRepetido([
		...fatosDeCampanha(e, contas, coletadoEm),
		...fatosDeEmpresasDoPolitico(e.empresasDoPolitico ?? [], coletadoEm),
		...fatosDeDespesasMandato(despesas, coletadoEm),
		...fatosDeContratosDoEnte(e.contratosDoEnte ?? [], coletadoEm),
		...fatosDeNos(e.nos ?? [], coletadoEm),
	]));
}

async function gabineteDoAlvo(e: EntradaCruzamentos): Promise<DadosGabinete | null> {
	if (!e.gabinete) return null;
	return (e.carregarGabinete ?? carregarGabinete)(e.gabinete).catch(() => null);
}

export async function cruzarDadosDaInvestigacao(e: EntradaCruzamentos): Promise<{ fatos: Fato[]; achados: Achado[]; gabinete: DadosGabinete | null }> {
	const coletadoEm = (e.agora?.() ?? new Date()).toISOString();
	const [contas, gabinete] = await Promise.all([
		(e.buscarContas ?? buscarContasCampanha)(e.sqCandidato).catch(() => null),
		gabineteDoAlvo(e),
	]);
	const base = fatosColetados(e, contas, coletadoEm);
	const doGabinete = gabinete ? fatosDoGabinete(gabinete, base, coletadoEm) : [];
	const pessoas = gabinete ? pessoasDoGabinete(gabinete.assessores) : [];
	const [sancoes, socios, servidores] = await Promise.all([
		fatosDeSancoes(base, coletadoEm, e.buscarSancoes),
		fatosDeSocios(base, e.politico ?? null, coletadoEm, e.buscarQsa, LIMITE_QSA, pessoas),
		fatosDeServidores(base, coletadoEm, e.buscarFuncoes),
	]);
	const fatos = completarNomes([...base, ...doGabinete, ...sancoes, ...socios, ...servidores]);
	return { fatos, achados: executarCruzamentos(fatos), gabinete };
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
		emitirEtapa(sendEvent, { fonte: "cruzamentos", estado: "consultando" });
		const { fatos, achados, gabinete } = await cruzarDadosDaInvestigacao(e);
		if (gabinete) {
			sendEvent("STATUS", { msg: `[GABINETE] ${pessoasDoGabinete(gabinete.assessores).length} pessoa(s) do gabinete (${gabinete.fonte}) conferidas com os doadores da campanha, os sócios dos fornecedores e os eleitos da UF.` });
		}
		const nos = achados.map((achado) => achadoParaNo(achado, fatos, e.pessoaId));
		for (const no of nos) sendEvent("NODE_NOVO", no);
		sendEvent("STATUS", {
			msg: achados.length
				? `[CRUZAMENTO] ${achados.length} cruzamento(s) entre ${fatos.length} fatos verificados.`
				: `[CRUZAMENTO] Nenhum cruzamento entre os ${fatos.length} fatos coletados.`,
		});
		// "Nenhum cruzamento" também é resultado: a regra olhou os fatos e não achou coincidência.
		emitirEtapa(sendEvent, {
			fonte: "cruzamentos",
			estado: "concluida",
			detalhe: achados.length ? `${achados.length} cruzamento(s) entre ${fatos.length} fatos` : `nenhuma coincidência entre ${fatos.length} fatos`,
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
			documento: documentoLegivel(achado.documento),
			nome: achado.nome,
			somenteRaiz: achado.somenteRaiz,
			score_letalidade: NOTA_SEVERIDADE[achado.severidade],
			motivo_ia: achado.resumo,
			gerado_por: "regra (sem IA)",
			fatos: achado.fatos.map((id) => porId.get(id)).filter((f): f is Fato => Boolean(f)).map(fatoParaTela),
		},
	};
}
