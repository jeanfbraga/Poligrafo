/**
 * Investigação principal (rota /api/investigar, SSE).
 *
 * Sem ref: busca de candidatos e encerra. Com ref: dossiê guardado (24 h) ou a investigação
 * completa, em etapas — cada uma num módulo de services/core/investigacao/ (contexto.ts
 * explica o que elas compartilham). Até 12/10/2026 era uma função de ~2.000 linhas com
 * exceção de complexidade; a ordem das etapas e os eventos são os mesmos (conferido com a
 * gravação de referência, npm run qa:golden).
 */
import { ColecaoNos, envolverEmissor } from "@/services/core/colecao-nos";
import { redirecionarEtapasPara } from "@/services/core/etapas-ao-vivo";
import { resolverAlvoDireto } from "./investigacao/alvo-direto";
import { restaurarDoCache } from "./investigacao/cache";
import { sigaODinheiro } from "./investigacao/campanha";
import { type Execucao, type Investigacao, type ParamsInvestigacao, status } from "./investigacao/contexto";
import { contextoParaIA } from "./investigacao/contexto-ia";
import { despesasDoMandato, noCnpjCampanha } from "./investigacao/despesas-por-casa";
import { emendasDoAutor, emendasIndividuais, emendasPix, imoveisDaUniao } from "./investigacao/emendas";
import { finalizar } from "./investigacao/finalizacao";
import { identificar } from "./investigacao/identificacao";
import { malhaSocietaria } from "./investigacao/malha-societaria";
import { executarModoBusca } from "./investigacao/modo-busca";
import { indicadoresDoMunicipio } from "./investigacao/municipio-fiscal";
import { emitirPessoa } from "./investigacao/no-pessoa";
import { aeronaves, certidoesTcu, emendasPixParaEmpresas, financiamentosBndes } from "./investigacao/osint-empresas";
import { osintFederalDaPessoa, tribunaisDeContas } from "./investigacao/osint-pessoa";
import { executarPrePassos } from "./investigacao/pre-passos";
import { contarPesquisa, gravarParcialInicial } from "./investigacao/registro";
import { triagemDaMalha, triagemDasDespesas } from "./investigacao/triagem";

function prepararExecucao(params: ParamsInvestigacao): Execucao {
	// Tudo que vai para a tela também vai para o cache, com o score final da IA.
	const nos = new ColecaoNos();
	const sendEvent = envolverEmissor(params.sendEvent, nos);
	// Os avisos de conexão (ETAPA) também passam pelo emissor que guarda no cache.
	redirecionarEtapasPara(sendEvent);
	return { p: params, sendEvent, nos, malha: [] };
}

/** Quem é o alvo da ref; sem alvo, avisa e encerra. */
async function alvoDaRef(e: Execucao): Promise<any | null> {
	status(e, `Extraindo dossiê completo da casa legislativa...`);
	const dep = await resolverAlvoDireto(e);
	if (!dep) {
		e.sendEvent("ERROR", { mensagem: `Parlamentar ref ${e.p.forceRef} não encontrado.` });
		e.p.safeClose();
	}
	return dep;
}

/** PASSO 2: emendas por autor, Emendas PIX, imóveis da União e emendas individuais. */
async function emendas(inv: Investigacao): Promise<void> {
	const doAutor = await emendasDoAutor(inv);
	const transfereGov = await emendasPix(inv);
	await imoveisDaUniao(inv);
	await emendasIndividuais(inv, doAutor, transfereGov);
}

/** E a E7: aeronaves, BNDES, TCU, município (prefeito) e Emendas PIX para as empresas. */
async function osintDasEmpresas(inv: Investigacao, cnpjs: string[]): Promise<void> {
	await aeronaves(inv, cnpjs);
	await financiamentosBndes(inv, cnpjs);
	await certidoesTcu(inv, cnpjs);
	await indicadoresDoMunicipio(inv);
	await emendasPixParaEmpresas(inv, cnpjs);
}

async function investigar(inv: Investigacao): Promise<void> {
	const { empresasDeclaradas } = emitirPessoa(inv);
	await gravarParcialInicial(inv);
	await contarPesquisa(inv);
	await executarPrePassos(inv);
	await emendas(inv);
	noCnpjCampanha(inv);
	const despesas = await despesasDoMandato(inv);
	// Deep OSINT para todas as alçadas (federal, estadual, municipal)
	await tribunaisDeContas(inv);
	await osintFederalDaPessoa(inv);
	const cnpjsEmpresas = await malhaSocietaria(inv, empresasDeclaradas);
	await osintDasEmpresas(inv, cnpjsEmpresas);
	const doadores = await sigaODinheiro(inv);
	await contextoParaIA(inv, doadores);
	await triagemDaMalha(inv);
	await triagemDasDespesas(inv, despesas, doadores, cnpjsEmpresas);
	await finalizar(inv, { despesas, doadores, cnpjsEmpresas });
}

export async function executarInvestigacaoPrincipal(params: any): Promise<void> {
	const e = prepararExecucao(params as ParamsInvestigacao);
	// Sem ref: alçadas em paralelo, candidatos para a tela escolher
	if (!e.p.forceRef) return executarModoBusca(e);
	if (await restaurarDoCache(e)) return;
	const dep = await alvoDaRef(e);
	if (dep) await investigar(await identificar(e, dep));
}
