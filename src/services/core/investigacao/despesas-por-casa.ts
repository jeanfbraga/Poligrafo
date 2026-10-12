/**
 * Gasto do mandato por casa (cota da Câmara/Senado, TCE e CMRJ, DOCIGP da ALERJ, ALESP,
 * assembleias por UF) e o nó do CNPJ de campanha. Uma função por casa, escolhida por tabela.
 */
import { buscarPerfilDOCIGP } from "@/app/api/investigar/estados/rj/alerj";
import { buscarServidoresCMRJ } from "@/app/api/investigar/estados/rj/camara-rj-client";
import { buscarDespesasDeputadoEstadualSP } from "@/app/api/investigar/estados/sp/alesp";
import { buscarDespesasCamara, buscarDespesasSenado } from "@/app/api/investigar/etl_extractors";
import { buscarDespesasMunicipalMestre } from "@/app/api/investigar/municipios/router";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizarDespesa, nosDeContratosDoEnte, separarPorNatureza } from "@/services/core/despesa-normalizada";
import { despesasAlerjParaOPipe } from "@/services/integrations/alerj/despesas-base";
import { despesasDaAssembleia } from "@/services/integrations/assembleias/despesas";
import { type Investigacao, naMalha, status } from "./contexto";

/** PASSO 2.6: CNPJ de campanha do TSE. Emissão única: só o buffer (a triagem da malha emite). */
export function noCnpjCampanha(inv: Investigacao): void {
	const cnpj = inv.dep._tseResult?.cnpjCampanha;
	if (!cnpj) return;
	naMalha(inv, {
		id: `cnpj-campanha-${cnpj}`,
		type: "EMPRESA" as const,
		_origemId: inv.pessoaId,
		data: { label: "Comitê/CNPJ de Campanha", cnpj, situacao: "REGISTRO TSE", cnae: "Campanha Eleitoral" },
	});
}

/* --------------------------------- Municipal -------------------------------- */

/** Servidores do gabinete (SERVIDOR, não PESSOA: a tela funde toda PESSOA no investigado). */
async function servidoresCmrj(inv: Investigacao): Promise<void> {
	status(inv, `Consultando API de Servidores da CMRJ...`);
	const servidores = await buscarServidoresCMRJ(inv.dep.nome);
	servidores.forEach((serv: any, i: number) => {
		naMalha(inv, {
			id: `servidor-cmrj-${Date.now()}-${i}`,
			type: "SERVIDOR",
			_origemId: inv.pessoaId,
			data: {
				label: serv.nome,
				cargo: serv.cargo,
				salario: serv.salario,
				vinculo: serv.tipoVinculo,
				score_letalidade: 10,
				motivo_ia: `Servidor do gabinete do vereador na CMRJ.`,
			},
		});
	});
}

/** Nó gatilho do Raio-X de Gastos (o dashboard da cota da CMRJ), com o total do banco. */
async function raioXCmrj(inv: Investigacao): Promise<void> {
	const nomeVereador = inv.dep._tseResult?.nomeUrna || inv.dep.nome;
	status(inv, `Extraindo gastos da Cota de Gabinete para a malha...`);
	const { data, error } = await supabaseAdmin
		.from("cmrj_despesas")
		.select("*")
		.ilike("vereador_nome", `%${nomeVereador.trim()}%`)
		.order("data_despesa", { ascending: false });
	const total = !error && data ? data.reduce((acc: number, d: any) => acc + (Number(d.valor) || 0), 0) : 0;
	naMalha(inv, {
		id: `dashboard-cota-cmrj-${Date.now()}`,
		type: "RESUMO_GASTOS",
		_origemId: inv.pessoaId,
		data: { label: "Raio-X de Gastos", valor: total, ano: "Ver Dashboard", nomeVereador, score_letalidade: 0 },
	});
}

/** TCE/ProxyOSINT: contratos do município inteiro são contexto; só o MANDATO vai à triagem. */
async function despesasMunicipais(inv: Investigacao): Promise<any[]> {
	const { dep } = inv;
	status(inv, `Roteando varredura TCE/ProxyOSINT para a alçada municipal (${dep.uf})...`);
	const brutas = await buscarDespesasMunicipalMestre(dep.uf, inv.cpf ?? "", dep.nome, dep.uri, dep.casa);
	const { mandato, ente } = separarPorNatureza(brutas.map((d: any) => normalizarDespesa(d, { fonte: `TCE-${dep.uf}`, natureza: "ENTE" })));
	for (const noEnte of nosDeContratosDoEnte(ente, inv.pessoaId)) inv.sendEvent("NODE_NOVO", noEnte);
	if (ente.length > 0) {
		status(inv, `${ente.length} contrato(s)/empenho(s) do órgão encontrados no TCE (contexto; não são gastos do mandato).`);
	}
	if (dep.casa === "CAMARA_MUNICIPAL_RJ") {
		await servidoresCmrj(inv);
		await raioXCmrj(inv);
	}
	return mandato;
}

/* --------------------------------- Estadual --------------------------------- */

async function despesasAlerj(inv: Investigacao): Promise<any[]> {
	// Enrichment via DOCIGP (perfil público)
	status(inv, "Consultando sistema DOCIGP da ALERJ (Descentralização Orçamentária)...");
	const perfil = await buscarPerfilDOCIGP(inv.dep.nome, inv.sendEvent);
	if (perfil) {
		status(inv, `DOCIGP: ${perfil.apelido} (${perfil.partido}) — Mandato ${perfil.temMandato ? "ATIVO" : "INATIVO"}`);
	}
	// Despesas de gabinete pela base do DOCIGP (Banco de Perfil); o nó do Órgão fica para o deep dive manual.
	const despesas = await despesasAlerjParaOPipe(inv.dep.nome, inv.sendEvent);
	status(inv, "Instanciando núcleo da Assembleia Legislativa do RJ...");
	naMalha(inv, {
		id: `orgao-alerj-${Date.now()}`,
		type: "ORGAO",
		_origemId: inv.pessoaId,
		data: { label: "ALERJ - Assembleia Legislativa do Estado do RJ", esfera: "Estadual", nomePolitico: inv.dep.nome, casa: "ALERJ" },
	});
	return despesas;
}

async function despesasAlesp(inv: Investigacao): Promise<any[]> {
	status(inv, "Buscando Cotas da Assembleia Legislativa de São Paulo (ALESP)...");
	return buscarDespesasDeputadoEstadualSP(String(inv.dep.id), inv.dep.nome, inv.sendEvent);
}

async function despesasGovernador(inv: Investigacao): Promise<any[]> {
	status(inv, "Governador detectado. Foco exclusivo em repasses federais transversais...");
	return [];
}

/** Deputado estadual fora de SP/RJ: fonte por UF (MG = ALMG, DF = CLDF pelo CPF); sem fonte, o log diz isso. */
async function despesasOutrasAssembleias(inv: Investigacao): Promise<any[]> {
	return despesasDaAssembleia(inv.dep.uf, { nome: inv.dep.nome, cpf: inv.cpf }, inv.sendEvent);
}

/* --------------------------------- Federal ---------------------------------- */

async function despesasCamara(inv: Investigacao): Promise<any[]> {
	return buscarDespesasCamara(Number(inv.dep.id), inv.sendEvent);
}

async function despesasSenado(inv: Investigacao): Promise<any[]> {
	return buscarDespesasSenado(inv.dep.id, inv.dep.nome, inv.sendEvent);
}

type Coletor = (inv: Investigacao) => Promise<any[]>;

const POR_CASA: Record<string, Coletor> = {
	CAMARA: despesasCamara,
	SENADO: despesasSenado,
	PREFEITURA: despesasMunicipais,
	ALERJ: despesasAlerj,
	ALESP: despesasAlesp,
	GOVERNO_ESTADUAL: despesasGovernador,
	ASSEMBLEIA_LEGISLATIVA: despesasOutrasAssembleias,
};

function coletorDaCasa(casa: unknown): Coletor | undefined {
	if (String(casa).startsWith("CAMARA_MUNICIPAL")) return despesasMunicipais;
	return POR_CASA[String(casa)];
}

/** PASSO 3: gasto bruto do mandato. Casa sem fonte: nenhuma despesa. */
export async function despesasDoMandato(inv: Investigacao): Promise<any[]> {
	status(inv, `Carregando lote massivo de Cotas do portal da ${inv.dep.casa}...`);
	const coletor = coletorDaCasa(inv.dep.casa);
	return coletor ? coletor(inv) : [];
}
