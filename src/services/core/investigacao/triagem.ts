/**
 * Triagem pela IA: a malha OSINT (emitida depois de avaliada) e as despesas do mandato,
 * roteadas por risco. Despesa muito suspeita (nota ≥ 85) aprofunda o fornecedor; fretamento
 * de aeronave consulta a ANAC, a frota do fornecedor e se ele é empresa ou doador do político.
 */
import { analisarLoteComInteligencia, analisarMalhaOsintComInteligencia } from "@/app/api/investigar/ai_helpers";
import { verificarAeronaveAnac } from "@/app/api/investigar/scrapers/osint-contratos";
import { investigarFornecedorNivelHard } from "@/app/api/investigar/scrapers/osint-societario";
import { normalizeString } from "@/app/api/investigar/tse";
import { normalizarDespesa } from "@/services/core/despesa-normalizada";
import { buscarAeronavesProprietario } from "@/services/integrations/anac/client";
import { buscarDadosCnpj } from "@/services/integrations/receita/cnpj";
import { type Investigacao, naMalha, naTela, status } from "./contexto";
import { gravarFotoParcial } from "./registro";

/* ------------------------------- Malha OSINT ------------------------------- */

/** Despejo da malha OSINT na IA; os nós avaliados vão à tela. */
export async function triagemDaMalha(inv: Investigacao): Promise<void> {
	if (inv.malha.length === 0) return;
	status(inv, `[OSINT] Submetendo ${inv.malha.length} achados para auditoria de fraude/lavagem (Global AI Triage)...`);
	const avaliada = await analisarMalhaOsintComInteligencia(inv.malha, inv.dep.uf || "N/I", inv.perfil.esfera, inv.dep.casa);
	avaliada.forEach((node: any) => inv.sendEvent("NODE_NOVO", node));
}

/* -------------------------- Avaliação de despesas -------------------------- */

interface Avaliacao {
	score: number;
	alertas: string[];
	social: Record<string, unknown>;
}

/** O que vale para todas as despesas da investigação. */
interface Rodada {
	inv: Investigacao;
	doadores: any[];
	cnpjsEmpresas: string[];
	frotaCache: Map<string, any[]>;
	frotaEmitida: Set<string>;
}

/** Nota ≥ 85: Full OSINT do fornecedor (capital, abertura, sócios); senão só a resenha da IA. */
async function aprofundarOuResumir(r: Rodada, d: any, av: Avaliacao): Promise<void> {
	if (av.score < 85) {
		if (d.motivo_ia) av.alertas.push(`[POLÍGRAFO IA INFO]: ${d.motivo_ia}`);
		return;
	}
	status(r.inv, `[POLÍGRAFO] Aprofundando Dossiê no CNPJ: ${d.cnpjCpfFornecedor}...`);
	const hard = await investigarFornecedorNivelHard(d.cnpjCpfFornecedor);
	av.score = Math.min(av.score + hard.scorePenalidade, 100);
	av.alertas = hard.alertas;
	av.social = { capitalSocial: hard.capitalSocial, dataAbertura: hard.dataAbertura, socios: hard.socios };
	if (d.motivo_ia) av.alertas.unshift(`[POLÍGRAFO IA]: ${d.motivo_ia}`);
}

const FRETAMENTO = /TÁXI AÉREO|AERONAVE|FRETAMENTO|CHARTER|VOO FRETADO|LOCAÇÃO.*AERONAVE/;

/** 1. Prefixo de aeronave no texto da despesa. */
async function aeronaveNoTexto(r: Rodada, texto: string, av: Avaliacao): Promise<void> {
	const anac = await verificarAeronaveAnac(texto);
	if (!anac?.marca) return;
	status(r.inv, `[OSINT LAZY] Aeronave suspeita detectada. Puxando Dossiê do prefixo ${anac.marca} na ANAC...`);
	av.alertas.push(`[ANAC/RAB] Aeronave Prefixo ${anac.marca} localizada. Proprietário: ${anac.proprietario_nome}. Status: ${anac.situacao_aeronavegabilidade}.`);
	av.score += 40;
}

function noAeronaveDoFornecedor(inv: Investigacao, cnpj: string, anv: any) {
	return {
		id: `anac-forn-${cnpj}-${anv.prefixo || Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
		type: "CONTRATO" as const,
		_origemId: inv.pessoaId,
		data: {
			label: `AERONAVE DO FORNECEDOR: ${anv.prefixo || "N/I"}`,
			objeto: `Empresa: ${cnpj} | Modelo: ${anv.modelo || "N/I"} | Fabricante: ${anv.fabricante || "N/I"} | Status: ${anv.situacao || "N/I"}`,
			valor: 0,
			codigo: anv.prefixo || "ANAC",
			ano: "RAB/ANAC",
		},
	};
}

/** 2. Frota da empresa de táxi aéreo (uma consulta e uma emissão por CNPJ). */
async function frotaDoFornecedor(r: Rodada, cnpj: string, av: Avaliacao): Promise<void> {
	try {
		if (!r.frotaCache.has(cnpj)) {
			status(r.inv, `[ANAC DEEP] Rastreando frota do fornecedor de táxi aéreo (CNPJ: ${cnpj})...`);
			r.frotaCache.set(cnpj, await buscarAeronavesProprietario(cnpj));
		}
		const frota = r.frotaCache.get(cnpj)!;
		if (frota.length === 0 || r.frotaEmitida.has(cnpj)) return;
		r.frotaEmitida.add(cnpj);
		status(r.inv, `[ANAC] ${frota.length} aeronave(s) registrada(s) no CNPJ do fornecedor de fretamento!`);
		for (const anv of frota) {
			naMalha(r.inv, noAeronaveDoFornecedor(r.inv, cnpj, anv));
			av.alertas.push(`[ANAC/RAB] Frota do fornecedor: ${anv.prefixo} (${anv.modelo || "N/I"})`);
		}
	} catch (e) {
		console.warn("[ANAC DEEP] Erro ao buscar frota do fornecedor:", e);
	}
}

/** 3 e 4. A empresa de fretamento é do político ou doadora da campanha? */
function conflitosDoFretamento(r: Rodada, cnpj: string, av: Avaliacao): void {
	if (r.cnpjsEmpresas.includes(cnpj)) {
		av.alertas.push("[CONFLITO GRAVÍSSIMO] A empresa de táxi aéreo/fretamento pertence ao próprio parlamentar ou a sócio direto!");
		av.score = 100;
		status(r.inv, `[RED FLAG] Conflito de interesses! Empresa de fretamento (${cnpj}) está vinculada ao patrimônio do político!`);
	}
	if (r.doadores.includes(cnpj)) {
		av.alertas.push("[CONFLITO GRAVE] A empresa de táxi aéreo é doadora de campanha do parlamentar! Caracteriza toma-lá-dá-cá em fretamento.");
		av.score = 100;
		status(r.inv, `[RED FLAG] A empresa de fretamento (${cnpj}) financiou a campanha do parlamentar!`);
	}
}

/** Alerta se o sócio do QSA contém o nome (ou o nome civil) do político. */
function alertaDeSocio(r: Rodada, socio: any, empresa: any, cnpj: string): string | null {
	const { dep, detalhes } = r.inv;
	const socioNorm = normalizeString(socio.nome_socio || "");
	const nomeNorm = normalizeString(dep.nome);
	const nomeCivilNorm = normalizeString(detalhes?.nomeCivil || "");
	const razao = empresa.razao_social || cnpj;
	if (nomeNorm && socioNorm.includes(nomeNorm)) return `[CONFLITO GRAVÍSSIMO] O político "${dep.nome}" é SÓCIO da empresa de táxi aéreo (${razao})!`;
	if (nomeCivilNorm && nomeCivilNorm.length > 5 && socioNorm.includes(nomeCivilNorm)) {
		return `[CONFLITO GRAVÍSSIMO] O nome civil do político "${detalhes?.nomeCivil}" consta como SÓCIO da empresa de táxi aéreo (${razao})!`;
	}
	return null;
}

/** 5. QSA reverso: o político é sócio da empresa de táxi aéreo? */
async function politicoNoQsaDoFornecedor(r: Rodada, cnpj: string, av: Avaliacao): Promise<void> {
	try {
		// BrasilAPI com reserva no Minha Receita e fila (receita/cnpj.ts).
		const res = await buscarDadosCnpj(cnpj);
		if (!res.ok) return;
		const empresa: any = res.dados;
		for (const socio of empresa.qsa || []) {
			const alerta = alertaDeSocio(r, socio, empresa, cnpj);
			if (!alerta) continue;
			av.alertas.push(alerta);
			av.score = 100;
			break;
		}
	} catch (e) {
		console.warn("[QSA REVERSO FRETAMENTO] Erro:", e);
	}
}

async function fretamentoComCnpj(r: Rodada, d: any, av: Avaliacao): Promise<void> {
	const cnpj = (d.cnpjCpfFornecedor || "").replace(/\D/g, "");
	if (cnpj.length !== 14) return;
	await frotaDoFornecedor(r, cnpj, av);
	conflitosDoFretamento(r, cnpj, av);
	await politicoNoQsaDoFornecedor(r, cnpj, av);
}

/** Lazy loading OSINT: aeronaves (ANAC) e fretamento. */
async function osintDeAeronave(r: Rodada, d: any, av: Avaliacao): Promise<void> {
	const texto = `${d.tipoDespesa} ${d.nomeFornecedor} ${d.motivo_ia}`.toUpperCase();
	const fretamento = FRETAMENTO.test(texto);
	if (!fretamento && !texto.includes("LOCAÇÃO")) return;
	await aeronaveNoTexto(r, texto, av);
	if (fretamento) await fretamentoComCnpj(r, d, av);
}

async function avaliarDespesa(r: Rodada, d: any): Promise<Avaliacao> {
	const av: Avaliacao = { score: d.score_letalidade || 50, alertas: [], social: {} };
	// SE a IA achou muuuito suspeito, rodamos The Full OSINT nas bases de dados estatais
	await aprofundarOuResumir(r, d, av);
	await osintDeAeronave(r, d, av);
	// Lazy loading OSINT TSE Doadores
	if (r.doadores.includes(d.cnpjCpfFornecedor)) {
		av.alertas.push(`[TSE ALERTA MÁXIMO] Conflito de Interesse! Este fornecedor consta entre os doadores de campanha do político (TSE).`);
		av.score = 100;
	}
	av.score = Math.min(av.score, 100);
	return av;
}

/* ------------------------------ Nó da despesa ------------------------------ */

function nivelDoScore(score: number): string {
	if (score >= 70) return "ALTO";
	return score >= 50 ? "MEDIO" : "BAIXO";
}

function primeiro(...valores: unknown[]): any {
	return valores.find(Boolean);
}

/** Campos principais em qualquer formato de cliente (Câmara, Senado, TCE, assembleias). */
function camposDaDespesa(d: any) {
	return {
		label: primeiro(d.nomeFornecedor, d.fornecedor, d.favorecido, d.razaoSocial, d.contratado) || "FORNECEDOR IDENTIFICADO",
		tipo: primeiro(d.tipoDespesa, d.tipo, d.categoria_despesa, d.descricao) || "DESPESA PÚBLICA",
		valor: Number(d.valorDocumento ?? d.valorLiquido ?? d.valor ?? 0),
		dataDocumento: primeiro(d.dataDocumento, d.data, d.data_despesa) || "",
		documento: primeiro(d.cnpjCpfFornecedor, d.cnpjFornecedor, d.cnpj, d.cpfCnpj) || "",
	};
}

function detalhesDaDespesa(d: any) {
	return {
		avaliado_por_ia: d.avaliado_por_ia,
		descricao: d.descricao || null,
		numeroDocumento: primeiro(d.numeroDocumento, d.numero_documento) || null,
		orgao: primeiro(d.orgao, d.orgaoNome, d.orgaoSigla) || null,
		modalidade: primeiro(d.modalidade, d.categoria_despesa) || null,
		urlDocumento: primeiro(d.urlDocumento, d.fonte_url) || null,
	};
}

function riscoDaDespesa(d: any, av: Avaliacao, documento: string) {
	return {
		nivel: nivelDoScore(av.score),
		motivo: d.motivo_ia || "Investigação Automatizada",
		alertas: av.alertas,
		cnpjFornecedor: documento,
		classificacao: d.classificacao ?? "REGULAR_COM_RESSALVA",
		enquadramento_normativo: d.enquadramento_normativo ?? "-",
		fundamentacao_tecnica: d.fundamentacao_tecnica ?? "Sem avaliação técnica específica associada.",
		...av.social,
	};
}

function noDaDespesa(inv: Investigacao, d: any, av: Avaliacao) {
	const campos = camposDaDespesa(d);
	return {
		id: `despesa-${campos.documento}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
		type: "DESPESA",
		_origemId: inv.pessoaId,
		data: {
			...campos,
			...detalhesDaDespesa(d),
			score_letalidade: av.score,
			motivo_ia: d.motivo_ia,
			risco: riscoDaDespesa(d, av, campos.documento),
		},
	};
}

/* ------------------------------- Triagem IA -------------------------------- */

/** Batimento a cada 15 s: mantém a conexão viva enquanto a IA analisa (evita timeout da Vercel). */
async function avaliarComIA(inv: Investigacao, despesas: any[], doadores: any[]): Promise<any[]> {
	status(inv, "[POLÍGRAFO IA] Operando Triagem Documental e Cruzamento Geográfico...");
	let segundos = 0;
	const batimento = setInterval(() => {
		segundos += 15;
		status(inv, `[POLÍGRAFO IA] Triagem em progresso... (${segundos}s) - Aguarde.`);
	}, 15000);
	try {
		// Formato único: a IA nunca mais recebe campos undefined de clientes com outros nomes.
		const normalizadas = despesas.map((d: any) => normalizarDespesa(d, { fonte: String(inv.dep.casa), natureza: "MANDATO" }));
		return await analisarLoteComInteligencia(normalizadas, inv.dep.uf, doadores, inv.perfil.esfera, inv.dep.casa);
	} finally {
		clearInterval(batimento);
	}
}

/** PASSO 4 e 5: triagem das despesas pela IA e roteamento por risco. */
export async function triagemDasDespesas(inv: Investigacao, despesas: any[], doadores: any[], cnpjsEmpresas: string[]): Promise<void> {
	if (despesas.length === 0) {
		status(inv, `Nenhuma despesa recente encontrada no portal da ${inv.dep.casa} para avaliação.`);
		status(inv, "O político não possui despesas recentes elegíveis para análise.");
		return;
	}
	const avaliadas = await avaliarComIA(inv, despesas, doadores);
	const r: Rodada = { inv, doadores, cnpjsEmpresas, frotaCache: new Map(), frotaEmitida: new Set() };
	for (let i = 0; i < avaliadas.length; i++) {
		const d = avaliadas[i];
		naTela(inv, noDaDespesa(inv, d, await avaliarDespesa(r, d)));
		// Foto parcial a cada 5 faturas complexas processadas
		await gravarFotoParcial(inv, i);
	}
}
