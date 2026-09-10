import { buscarContratosBA } from "../../app/api/investigar/estados/ba/tce";
import { buscarContratosMG } from "../../app/api/investigar/estados/mg/tce";
import { buscarAcordaosTcePA } from "../../app/api/investigar/estados/pa/tce";
import { buscarContratosPR } from "../../app/api/investigar/estados/pr/tce";
import { buscarProcessosTceTo } from "../../app/api/investigar/estados/to/tce";
import { buscarProjetosLeiCamara } from "../../app/api/investigar/scrapers/legislativo";
import {
	buscarContratosPNCP,
	buscarConveniosTransferegov,
} from "../../app/api/investigar/scrapers/osint-contratos";
import {
	buscarCartaoCorporativo,
	buscarReceitasFederais,
	buscarViagensFAB,
} from "../../app/api/investigar/scrapers/osint-fiscal";
import { expandirMalhaSocietaria } from "../../app/api/investigar/scrapers/osint-societario";
import { buscarDoadoresTSE } from "../../app/api/investigar/tse";
import { buscarAeronavesProprietario } from "../integrations/anac/client";
import { buscarOperacoesBNDES } from "../integrations/bndes/client";
import {
	consultarFUNDEB,
	consultarPNAE,
	consultarPNATE,
} from "../integrations/fnde/client";

import {
	buscarEnteSiconfi,
	consultarIndicadoresLRF,
} from "../integrations/siconfi/client";
import { buscarCertidaoTCU } from "../integrations/tcu/client";
import { buscarConveniosEntidade } from "../integrations/transparencia/convenios-client";
import { buscarEmendasPorCNPJ } from "../integrations/transferegov/client";

export interface OsintExecutorParams {
	deputadoBasico: any;
	cpfLimpo: string;
	pessoaId: string;
	sendEvent: (tipo: string, payload: any) => void;
	fichaPolitico: any;
	malhaOsintBuffer: any[];
	supabaseNodes: any[];
}

type PushNodeFn = (node: any) => void;
type SendEventFn = (tipo: string, payload: any) => void;

// ============================================================================
// 1. TRIBUNAIS DE CONTAS ESTADUAIS (PA, TO, MG, BA, PR)
// ============================================================================

async function investigarTcePA(
	nome: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Alvo do Pará detectado. Realizando scraping de Jurisprudência no TCE-PA...",
	});
	const acordaos = await buscarAcordaosTcePA(nome);
	if (acordaos.length === 0) return;

	sendEvent("STATUS", {
		msg: `[TCE-PA] Foram encontrados ${acordaos.length} Acórdão(s)/Processo(s) atrelados ao nome do político.`,
	});
	acordaos.forEach((acordao, i) => {
		pushNode({
			id: `acordao-pa-${Date.now()}-${i}`,
			type: "PROCESSO_JUDICIAL",
			_origemId: pessoaId,
			data: {
				label: acordao.titulo,
				resumo: acordao.resumo,
				data: acordao.dataPublicacao,
				url: acordao.url,
				ementa: acordao.ementa,
				tribunal: "TCE-PA",
			},
		});
	});
}

async function investigarTceTO(
	nome: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Alvo de Tocantins detectado. Vasculhando processos no TCE-TO (e-Contas)...",
	});
	const processosTO = await buscarProcessosTceTo(nome);
	if (processosTO.length === 0) return;

	sendEvent("STATUS", {
		msg: `[TCE-TO] ${processosTO.length} processos de contas/denúncia detectados.`,
	});
	processosTO.forEach((proc, i) => {
		pushNode({
			id: `processo-to-${Date.now()}-${i}`,
			type: "PROCESSO_JUDICIAL",
			_origemId: pessoaId,
			data: {
				label: proc.numero_processo,
				resumo: proc.assunto,
				tribunal: "TCE-TO",
				ano: proc.ano,
				motivo_ia: `Processo de ${proc.assunto} referente ao ano de ${proc.ano}. Relator: ${proc.relator}.`,
			},
		});
	});
}

async function investigarTceMG(
	termo: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Alvo de Minas Gerais detectado. Consultando dados abertos do TCE-MG...",
	});
	const contratosMG = await buscarContratosMG(termo, 10);
	if (contratosMG.length === 0) return;

	sendEvent("STATUS", {
		msg: `[TCE-MG] ${contratosMG.length} contratações municipais rastreadas em MG.`,
	});
	contratosMG.forEach((c, i) => {
		pushNode({
			id: `tce-mg-${Date.now()}-${i}`,
			type: "CONTRATO" as const,
			_origemId: pessoaId,
			data: {
				label: `Contrato TCE-MG: ${c.fornecedor}`,
				objeto: c.objeto,
				valor: c.valor,
				codigo: c.cnpj || "TCE-MG",
				ano: c.data ? c.data.substring(0, 4) : "Atual",
				motivo_ia: `Contratação municipal no TCE-MG vinculada a ${c.municipio}.`,
			},
		});
	});
}

async function investigarTcmBA(
	termo: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Alvo da Bahia detectado. Consultando contratações no TCM-BA...",
	});
	const contratosBA = await buscarContratosBA(termo, 10);
	if (contratosBA.length === 0) return;

	sendEvent("STATUS", {
		msg: `[TCM-BA] ${contratosBA.length} contratações municipais rastreadas na Bahia.`,
	});
	contratosBA.forEach((c, i) => {
		pushNode({
			id: `tcm-ba-${Date.now()}-${i}`,
			type: "CONTRATO" as const,
			_origemId: pessoaId,
			data: {
				label: `Contrato TCM-BA: ${c.fornecedor}`,
				objeto: c.objeto,
				valor: c.valor,
				codigo: c.cnpj || "TCM-BA",
				ano: c.data ? c.data.substring(0, 4) : "Atual",
				motivo_ia: `Contratação municipal no TCM-BA vinculada a ${c.municipio}.`,
			},
		});
	});
}

async function investigarTcePR(
	termo: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Alvo do Paraná detectado. Consultando licitações e contratos no TCE-PR...",
	});
	const contratosPR = await buscarContratosPR(termo, 10);
	if (contratosPR.length === 0) return;

	sendEvent("STATUS", {
		msg: `[TCE-PR] ${contratosPR.length} contratações municipais rastreadas no Paraná.`,
	});
	contratosPR.forEach((c, i) => {
		pushNode({
			id: `tce-pr-${Date.now()}-${i}`,
			type: "CONTRATO" as const,
			_origemId: pessoaId,
			data: {
				label: `Contrato TCE-PR: ${c.fornecedor}`,
				objeto: c.objeto,
				valor: c.valor,
				codigo: c.cnpj || "TCE-PR",
				ano: c.data ? c.data.substring(0, 4) : "Atual",
				motivo_ia: `Contratação municipal no TCE-PR vinculada a ${c.municipio}.`,
			},
		});
	});
}

async function investigarTcesEstaduais(
	deputadoBasico: any,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	const uf = deputadoBasico.uf;
	const termo = deputadoBasico.municipio || deputadoBasico.nome;
	if (uf === "PA")
		await investigarTcePA(deputadoBasico.nome, pessoaId, sendEvent, pushNode);
	if (uf === "TO")
		await investigarTceTO(deputadoBasico.nome, pessoaId, sendEvent, pushNode);
	if (uf === "MG") await investigarTceMG(termo, pessoaId, sendEvent, pushNode);
	if (uf === "BA") await investigarTcmBA(termo, pessoaId, sendEvent, pushNode);
	if (uf === "PR") await investigarTcePR(termo, pessoaId, sendEvent, pushNode);
}

// ============================================================================
// 2. REPASSES E FISCAIS FEDERAIS (CGU, CPGF, FAB)
// ============================================================================

async function investigarRepassesEFiscais(
	deputadoBasico: any,
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	fichaPolitico: any,
) {
	if (fichaPolitico.sancoesCgu) {
		sendEvent("STATUS", {
			msg: "[ALERTA MÁXIMO] O CPF do político consta no Cadastro de Inidôneos/Sancionados da CGU!",
		});
	}

	const docConsulta = cpfLimpo || String(deputadoBasico.id);

	sendEvent("STATUS", {
		msg: "Vasculhando repasses diretos e contratos federais ao político na CGU...",
	});
	await buscarReceitasFederais(docConsulta, pessoaId, sendEvent as any);

	sendEvent("STATUS", {
		msg: "Analisando faturas de Cartão de Pagamento do Governo Federal (CPGF)...",
	});
	await buscarCartaoCorporativo(
		docConsulta,
		pessoaId,
		sendEvent as any,
		deputadoBasico.casa,
	);

	sendEvent("STATUS", {
		msg: "Rastreando Viagens a Serviço e Voos da FAB financiados com recursos públicos...",
	});
	await buscarViagensFAB(
		docConsulta,
		pessoaId,
		sendEvent as any,
		deputadoBasico.casa,
	);
}

// ============================================================================
// 3. EXPANSÃO SOCIETÁRIA E BUSCA REVERSA
// ============================================================================

function adicionarEmpresaReversa(
	emp: any,
	empresasCNPJs: string[],
	pessoaId: string,
	pushNode: PushNodeFn,
) {
	const cnpjEmp = (emp.cnpj ?? "").replace(/\D/g, "");
	if (!cnpjEmp || empresasCNPJs.includes(cnpjEmp)) return;

	empresasCNPJs.push(cnpjEmp);
	pushNode({
		id: `empresa-rev-${cnpjEmp}-${Date.now()}`,
		type: "EMPRESA",
		_origemId: pessoaId,
		data: {
			label: emp.razao_social ?? "Empresa Localizada",
			cnpj: cnpjEmp,
			situacao: emp.situacao ?? "N/I",
			cnae: emp.cnae ?? "N/I",
		},
	});
}

async function buscarEmpresasPorNomeReverso(
	nome: string,
	empresasCNPJs: string[],
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: `Fazendo busca reversa de empresas vinculadas ao nome "${nome}"...`,
	});
	try {
		const { buscarEmpresasDoSocio } = await import("./socio-search");
		const empresasPorNome = await buscarEmpresasDoSocio(nome);
		if (!empresasPorNome || empresasPorNome.length === 0) return;

		sendEvent("STATUS", {
			msg: `[OSINT] ${empresasPorNome.length} empresa(s) vinculada(s) ao nome do político encontrada(s)!`,
		});
		for (const emp of empresasPorNome) {
			adicionarEmpresaReversa(emp, empresasCNPJs, pessoaId, pushNode);
		}
	} catch (e) {
		console.warn("[Deep OSINT] Falha na busca reversa por nome:", e);
	}
}

async function investigarMalhaSocietaria(
	deputadoBasico: any,
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
): Promise<string[]> {
	sendEvent("STATUS", {
		msg: "Expandindo malha societária via BrasilAPI para rastrear blindagem patrimonial...",
	});
	const docConsulta = cpfLimpo || String(deputadoBasico.id);
	const empresasRelacionadasCNPJs = await expandirMalhaSocietaria(
		docConsulta,
		pessoaId,
		sendEvent as any,
	);
	await buscarEmpresasPorNomeReverso(
		deputadoBasico.nome,
		empresasRelacionadasCNPJs,
		pessoaId,
		sendEvent,
		pushNode,
	);
	return empresasRelacionadasCNPJs;
}

// ============================================================================
// 4. CONVÊNIOS TRANSFEREGOV E CGU DE EMPRESAS VINCULADAS
// ============================================================================

async function processarConvenioTransferegov(
	cnpjRastreado: string,
	pushNode: PushNodeFn,
	sendEvent: SendEventFn,
) {
	const convenios = await buscarConveniosTransferegov(cnpjRastreado);
	if (!convenios || convenios.quantidade <= 0) return;

	sendEvent("STATUS", {
		msg: `[ALTA SUSPEIÇÃO] A empresa privada (${cnpjRastreado}) possui ${convenios.quantidade} convênio(s) federal(is) ativos milionários.`,
	});
	pushNode({
		id: `convenio-${cnpjRastreado}-${Date.now()}`,
		type: "CONTRATO",
		_origemId: `empresa-${cnpjRastreado}`,
		data: {
			label: "Convênio Transferegov.br",
			objeto: `${convenios.quantidade} convênios ativos milionários.`,
			valor: convenios.valorTotal,
			codigo: cnpjRastreado,
			ano: "Atual",
		},
	});
}

async function processarConveniosCGU(
	cnpjRastreado: string,
	pushNode: PushNodeFn,
	sendEvent: SendEventFn,
) {
	const conveniosCgu = await buscarConveniosEntidade(cnpjRastreado);
	if (!conveniosCgu || conveniosCgu.length === 0) return;

	sendEvent("STATUS", {
		msg: `[CGU CONVÊNIOS] Entidade/Empresa (${cnpjRastreado}) possui ${conveniosCgu.length} convênio(s) com a União Federal.`,
	});
	for (const conv of conveniosCgu.slice(0, 3)) {
		pushNode({
			id: `cgu-conv-${conv.numeroConvenio}-${Date.now()}`,
			type: "CONTRATO" as const,
			_origemId: `empresa-${cnpjRastreado}`,
			data: {
				label: `Convênio Federal: ${conv.orgaoSuperior}`,
				objeto: `${conv.objeto} (Entidade: ${conv.convenenteNome})`,
				valor: conv.valorGlobal,
				codigo: conv.numeroConvenio,
				ano: conv.dataInicioVigencia
					? conv.dataInicioVigencia.substring(0, 4)
					: "Atual",
				motivo_ia: `Entidade vinculada firmou convênio com o Governo Federal (${conv.orgaoConcedente}). Valor liberado: R$ ${conv.valorLiberado.toLocaleString("pt-BR")}.`,
			},
		});
	}
}

async function investigarConveniosEmpresas(
	empresasCNPJs: string[],
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	if (!empresasCNPJs || empresasCNPJs.length === 0) {
		sendEvent("STATUS", {
			msg: "Nenhuma empresa vinculada com contratos federais abertos encontrada (BrasilAPI).",
		});
		return;
	}

	sendEvent("STATUS", {
		msg: `Localizadas ${empresasCNPJs.length} empresa(s). Varrendo base de Convênios do Transferegov para cada uma em paralelo...`,
	});

	const tasks = empresasCNPJs.map(async (cnpj) => {
		sendEvent("STATUS", {
			msg: `[OSINT] Checando contratos federais para o CNPJ: ${cnpj}`,
		});
		await buscarReceitasFederais(cnpj, `empresa-${cnpj}`, sendEvent as any);
		await processarConvenioTransferegov(cnpj, pushNode, sendEvent);
		await processarConveniosCGU(cnpj, pushNode, sendEvent);
	});
	await Promise.allSettled(tasks);
}

// ============================================================================
// 5. REGISTRO AERONÁUTICO BRASILEIRO (ANAC/RAB)
// ============================================================================

async function investigarAeronavesAnac(
	deputadoBasico: any,
	empresasCNPJs: string[],
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Varrendo Registro Aeronáutico Brasileiro (ANAC/RAB) por aeronaves vinculadas em paralelo...",
	});
	const alvosAnac = [deputadoBasico.nome, ...(empresasCNPJs || [])];

	const tasks = alvosAnac.map(async (alvo) => {
		const aeronaves = await buscarAeronavesProprietario(alvo);
		if (aeronaves.length === 0) return;

		sendEvent("STATUS", {
			msg: `[ANAC] ${aeronaves.length} aeronave(s) localizada(s) vinculada(s) a "${alvo}"!`,
		});
		for (const anv of aeronaves) {
			pushNode({
				id: `anac-${anv.prefixo || Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
				type: "CONTRATO" as const,
				_origemId: pessoaId,
				data: {
					label: `AERONAVE ${anv.prefixo || "N/I"}`,
					objeto: `Proprietário: ${anv.proprietario_nome || alvo} | Modelo: ${anv.modelo || "N/I"} | Fabricante: ${anv.fabricante || "N/I"} | Status: ${anv.situacao || "N/I"}`,
					valor: 0,
					codigo: anv.prefixo || "ANAC",
					ano: "RAB/ANAC",
				},
			});
		}
	});
	await Promise.allSettled(tasks);
}

// ============================================================================
// 6. FINANCIAMENTOS E RESTRIÇÕES DE EMPRESAS (BNDES, TCU, EMENDAS PIX)
// ============================================================================

async function processarOpBNDES(
	cnpj: string,
	ops: any[],
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	const totalBNDES = ops.reduce((acc, op) => acc + (op.valor || 0), 0);
	sendEvent("STATUS", {
		msg: `[BNDES] ${ops.length} operação(ões) de financiamento para o CNPJ ${cnpj}. Total: R$ ${totalBNDES.toLocaleString("pt-BR")}`,
	});
	pushNode({
		id: `bndes-${cnpj}-${Date.now()}`,
		type: "CONTRATO" as const,
		_origemId: `empresa-${cnpj}`,
		data: {
			label: `Financiamento BNDES (${ops.length} op.)`,
			objeto: ops
				.slice(0, 3)
				.map((o) => `${o.produto || "N/I"} — ${o.situacao || "N/I"}`)
				.join(" | "),
			valor: totalBNDES,
			codigo: cnpj,
			ano: ops[0]?.data || "N/I",
			score_letalidade: 55,
			motivo_ia:
				"Empresa vinculada ao político recebeu financiamento subsidiado do BNDES.",
		},
	});
}

async function investigarBNDES(
	cnpjs: string[],
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Consultando financiamentos do BNDES para empresas vinculadas ao político...",
	});
	try {
		const cnpjsParaBNDES = cnpjs.slice(0, 5);
		const resultadosBNDES = await Promise.allSettled(
			cnpjsParaBNDES.map((cnpj) => buscarOperacoesBNDES(cnpj)),
		);
		for (let i = 0; i < resultadosBNDES.length; i++) {
			const res = resultadosBNDES[i];
			if (res.status === "fulfilled" && res.value && res.value.length > 0) {
				await processarOpBNDES(
					cnpjsParaBNDES[i],
					res.value,
					sendEvent,
					pushNode,
				);
			}
		}
	} catch (err: any) {
		console.warn(
			"[BNDES] Erro ao consultar financiamentos:",
			err?.message || err,
		);
	}
}

async function checarCertidaoTcuIndividual(
	cnpj: string,
	pessoaId: string,
	pushNode: PushNodeFn,
) {
	try {
		const certidao = await buscarCertidaoTCU(cnpj);
		if (!certidao?.temInfracao) return;

		const motivos: string[] = [];
		if (certidao.situacaoTcu !== "NADA_CONSTA")
			motivos.push(`TCU Inidôneos: ${certidao.situacaoTcu}`);
		if (certidao.situacaoCnj !== "NADA_CONSTA")
			motivos.push(`CNJ CNIA: ${certidao.situacaoCnj}`);
		if (certidao.situacaoCeis !== "NADA_CONSTA")
			motivos.push(`CGU CEIS: ${certidao.situacaoCeis}`);
		if (certidao.situacaoCnep !== "NADA_CONSTA")
			motivos.push(`CGU CNEP: ${certidao.situacaoCnep}`);

		pushNode({
			id: `tcu-certidao-${cnpj}-${Date.now()}`,
			type: "PROCESSO_JUDICIAL" as const,
			_origemId: pessoaId,
			data: {
				label: `Certidão Positiva APF: ${cnpj}`,
				tribunal: "TCU (Certidão Consolidada)",
				assunto: "Restrição em Base Federal",
				score_letalidade: 85,
				motivo_ia: `Empresa vinculada possui restrições ativas. Registros: ${motivos.join(" | ")}`,
			},
		});
	} catch (err: any) {
		console.warn(
			"[TCU] Erro ao buscar certidão para empresa:",
			err?.message || err,
		);
	}
}

async function investigarCertidoesTCU(
	cnpjs: string[],
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Consultando certidões unificadas no TCU para empresas...",
	});
	for (const cnpj of cnpjs) {
		await checarCertidaoTcuIndividual(cnpj, pessoaId, pushNode);
	}
}

async function checarEmendaPixIndividual(
	cnpj: string,
	pessoaId: string,
	pushNode: PushNodeFn,
) {
	try {
		const emendasDiretas = await buscarEmendasPorCNPJ(cnpj);
		if (!emendasDiretas || emendasDiretas.length === 0) return;

		const totalPix = emendasDiretas.reduce(
			(acc, curr) =>
				acc + (curr.valorCusteio || 0) + (curr.valorInvestimento || 0),
			0,
		);
		pushNode({
			id: `emenda-pix-${cnpj}-${Date.now()}`,
			type: "CONTRATO" as const,
			_origemId: pessoaId,
			data: {
				label: `Recebedor de Emenda PIX: ${cnpj}`,
				objeto: `Foram localizadas ${emendasDiretas.length} emendas destinadas DIRETAMENTE para esta empresa.`,
				valor: totalPix,
				codigo: "TRANSFEREGOV",
				ano: emendasDiretas[0].ano || "N/I",
				score_letalidade: 95,
				motivo_ia:
					"ALERTA MÁXIMO: Uma empresa ligada diretamente ao político investigado está recebendo recursos públicos via Emendas PIX ou Transferências Especiais.",
			},
		});
	} catch (err: any) {
		console.warn(
			"[TransfereGov] Erro ao buscar emendas para empresa:",
			err?.message || err,
		);
	}
}

async function investigarEmendasPixEmpresas(
	cnpjs: string[],
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Verificando se empresas vinculadas são beneficiárias diretas de Emendas PIX...",
	});
	for (const cnpj of cnpjs) {
		await checarEmendaPixIndividual(cnpj, pessoaId, pushNode);
	}
}

async function investigarFinanciamentosERestricoesEmpresas(
	cnpjs: string[],
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	if (!cnpjs || cnpjs.length === 0) return;
	await investigarBNDES(cnpjs, sendEvent, pushNode);
	await investigarCertidoesTCU(cnpjs, pessoaId, sendEvent, pushNode);
	await investigarEmendasPixEmpresas(cnpjs, pessoaId, sendEvent, pushNode);
}

// ============================================================================
// 7. HISTÓRICO FISCAL TCE-RS
// ============================================================================

async function investigarHistoricoFiscalRS(
	deputadoBasico: any,
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	const ehFederalRS =
		deputadoBasico.casa === "CAMARA" &&
		deputadoBasico.uf === "RS" &&
		deputadoBasico.uri;
	if (!ehFederalRS) return;

	sendEvent("STATUS", {
		msg: "Alvo Federal do Rio Grande do Sul. Resgatando histórico de Compliance Fiscal no TCE-RS...",
	});
	try {
		const {
			buscarDespesasVereadorRS: buscarDespesasMunicipalRS,
		} = require("../../app/api/investigar/estados/rs/tce");
		const docTce = cpfLimpo || String(deputadoBasico.id);
		const uriArg =
			deputadoBasico.casa === "CAMARA" || deputadoBasico.casa === "SENADO"
				? undefined
				: deputadoBasico.uri;
		const tceDespesas = await buscarDespesasMunicipalRS(
			docTce,
			deputadoBasico.nome,
			uriArg,
			deputadoBasico.casa,
		);
		if (tceDespesas && tceDespesas.length > 0) {
			tceDespesas.forEach((d: any, i: number) => {
				pushNode({
					id: `tcers-${Date.now()}-${i}`,
					type: "DESPESA_PUBLICA",
					_origemId: pessoaId,
					data: {
						label: d.tipoDespesa || "TCE-RS",
						valor: d.valorDocumento,
						fornecedor:
							d.nomeFornecedor || d.descricao || "Informação do TCE-RS",
						data: d.dataDocumento,
						url: d.urlDocumento || "https://dados.tce.rs.gov.br",
					},
				});
			});
		}
	} catch (e) {
		console.warn("[TCE-RS] Falha na integração federal:", e);
	}
}

// ============================================================================
// 8. GESTÃO FISCAL E REPASSES MUNICIPAIS (SICONFI, FNDE)
// ============================================================================

function montarMensagemSituacaoLRF(
	situacaoLimite: string,
	pctStr: string,
	limiteMaximo: number,
): string {
	if (situacaoLimite === "EXCEDIDO") {
		return `[ALERTA CRÍTICO LRF] Limite de gasto com pessoal EXCEDIDO: ${pctStr}% da RCL (limite: ${limiteMaximo}%)`;
	}
	if (situacaoLimite === "PRUDENCIAL") {
		return `[ALERTA LRF] Gasto com pessoal no limite prudencial: ${pctStr}% da RCL`;
	}
	if (situacaoLimite === "ALERTA") {
		return `[AVISO LRF] Gasto com pessoal em nível de alerta: ${pctStr}% da RCL`;
	}
	return `[SICONFI] Gasto com pessoal dentro do limite LRF: ${pctStr}% da RCL`;
}

function calcularScoreLRF(situacaoLimite: string): number {
	if (situacaoLimite === "EXCEDIDO") return 85;
	if (situacaoLimite === "PRUDENCIAL") return 65;
	return 45;
}

async function investigarSiconfi(
	deputadoBasico: any,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
	fichaPolitico: any,
) {
	sendEvent("STATUS", {
		msg: "Consultando indicadores fiscais LRF do município no SICONFI (Tesouro Nacional)...",
	});
	try {
		const nomeMunicipioAlvo =
			(deputadoBasico as any)._nomeMunicipio || deputadoBasico.nome;
		const enteSiconfi = await buscarEnteSiconfi(
			deputadoBasico.uf,
			nomeMunicipioAlvo,
		);
		if (!enteSiconfi) return;

		const anoAtual = new Date().getFullYear();
		const indicadores = await consultarIndicadoresLRF(
			enteSiconfi.cod_ibge,
			anoAtual,
		);
		if (!indicadores) return;

		const pctStr = indicadores.percentualDespesaPessoal.toFixed(1);
		const situMsg = montarMensagemSituacaoLRF(
			indicadores.situacaoLimite,
			pctStr,
			indicadores.limiteMaximoPercentual,
		);

		sendEvent("STATUS", { msg: situMsg });
		if (indicadores.situacaoLimite !== "NORMAL") {
			fichaPolitico.alertasPessoais.push(situMsg);
			const score = calcularScoreLRF(indicadores.situacaoLimite);
			pushNode({
				id: `siconfi-${enteSiconfi.cod_ibge}-${Date.now()}`,
				type: "PROCESSO_JUDICIAL" as const,
				_origemId: pessoaId,
				data: {
					label: `Saúde Fiscal LRF: ${enteSiconfi.ente}`,
					tribunal: "Tesouro Nacional (SICONFI)",
					assunto: `Despesa com Pessoal ${pctStr}% — ${indicadores.situacaoLimite}`,
					score_letalidade: score,
					motivo_ia: `O município ${enteSiconfi.ente}/${enteSiconfi.uf} está com despesa de pessoal em ${pctStr}% da Receita Corrente Líquida (RCL: R$ ${indicadores.receitaCorrenteLiquidaAjustada.toLocaleString("pt-BR")}). Limite máximo LRF: ${indicadores.limiteMaximoPercentual}%.`,
				},
			});
		}
	} catch (err: any) {
		console.warn(
			"[SICONFI] Erro ao consultar indicadores LRF:",
			err?.message || err,
		);
	}
}

function extrairLabelsERepasseFNDE(
	pnae: any[],
	fundeb: any[],
	pnate: any[],
) {
	const labels: string[] = [];
	let total = 0;

	if (pnae.length > 0) {
		const v = pnae[0].valorFnde ?? 0;
		total += v;
		labels.push(
			`PNAE (Merenda): R$ ${v.toLocaleString("pt-BR")} para ${pnae[0].totalAlunos} alunos.`,
		);
	}
	if (fundeb.length > 0) {
		const v = fundeb[0].valorRepasseEstimado ?? 0;
		total += v;
		labels.push(
			`FUNDEB: R$ ${v.toLocaleString("pt-BR")} (Est.) para ${fundeb[0].quantidadeMatriculas} matrículas.`,
		);
	}
	if (pnate.length > 0) {
		labels.push(
			`PNATE (Transporte): Atende ${pnate[0].alunosAtendidos} alunos.`,
		);
	}

	return { labels, total };
}

async function investigarFNDE(
	deputadoBasico: any,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: "Consultando repasses educacionais do FNDE (PNAE/FUNDEB/PNATE)...",
	});
	try {
		const nomeMunicipioAlvo =
			(deputadoBasico as any)._nomeMunicipio || deputadoBasico.nome;
		const anoAtual = new Date().getFullYear();
		const [pnae, fundeb, pnate] = await Promise.all([
			consultarPNAE(nomeMunicipioAlvo, deputadoBasico.uf, anoAtual),
			consultarFUNDEB(nomeMunicipioAlvo, deputadoBasico.uf, anoAtual),
			consultarPNATE(deputadoBasico.uf, nomeMunicipioAlvo),
		]);

		const { labels, total } = extrairLabelsERepasseFNDE(pnae, fundeb, pnate);
		if (labels.length === 0) return;

		pushNode({
			id: `fnde-${deputadoBasico.uf}-${Date.now()}`,
			type: "CONTRATO" as const,
			_origemId: pessoaId,
			data: {
				label: `Repasses FNDE (${anoAtual})`,
				objeto: labels.join(" | "),
				valor: total,
				codigo: "FNDE",
				ano: anoAtual.toString(),
				score_letalidade: 30,
				motivo_ia:
					"O município recebe repasses federais da educação (FNDE). Cruzamentos futuros podem verificar se há empresas financiadas desviando estes recursos.",
			},
		});
	} catch (err: any) {
		console.warn("[FNDE] Erro ao consultar repasses:", err?.message || err);
	}
}

async function investigarGestaoMunicipal(
	deputadoBasico: any,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
	fichaPolitico: any,
) {
	if (deputadoBasico.casa !== "PREFEITURA" || !deputadoBasico.uf) return;
	await investigarSiconfi(
		deputadoBasico,
		pessoaId,
		sendEvent,
		pushNode,
		fichaPolitico,
	);
	await investigarFNDE(deputadoBasico, pessoaId, sendEvent, pushNode);
}

// ============================================================================
// 9. SIGA O DINHEIRO DA CAMPANHA (TSE, COMPRAS.GOV, PNCP)
// ============================================================================

const MAPA_CARGO_TSE: Record<string, string> = {
	SENADO: "5",
	ALERJ: "7",
	ALESP: "7",
	CAMARA_MUNICIPAL_SP: "13",
	CAMARA_MUNICIPAL_RJ: "13",
	GOVERNO_ESTADUAL: "3",
	PREFEITURA: "11",
};

function resolverCargoTse(casa: string): string {
	return MAPA_CARGO_TSE[casa] ?? "6";
}

async function checarDoadorComprasGov(
	cnpjDoador: string,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
) {
	sendEvent("STATUS", {
		msg: `Investigando doador CNPJ ${cnpjDoador} no Compras.gov...`,
	});
	try {
		const resComp = await fetch(
			`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${cnpjDoador}`,
		);
		if (!resComp.ok) return;

		const compJson = await resComp.json();
		const contratos = compJson?._embedded?.contratos || [];
		if (contratos.length === 0) return;

		const valorTotal = contratos.reduce(
			(acc: number, c: any) => acc + (Number(c.valor_inicial) || 0),
			0,
		);
		pushNode({
			id: `toma-la-da-ca-${cnpjDoador}-${Date.now()}`,
			type: "DESPESA" as const,
			_origemId: pessoaId,
			data: {
				label: "DOADOR COM CONTRATO PÚBLICO",
				valor: valorTotal,
				tipo: "CONFLITO DE INTERESSE (TOMA-LÁ-DÁ-CÁ)",
				dataDocumento: String(new Date().getFullYear()),
				score_letalidade: 100,
				motivo_ia: `ALERTA TOMA-LÁ-DÁ-CÁ: Empresa financiou a campanha e possui contratos milionários ativos com o governo (CNPJ: ${cnpjDoador}).`,
			},
		});
		sendEvent("STATUS", {
			msg: `[RED FLAG] Doador ${cnpjDoador} possui R$ ${valorTotal.toLocaleString("pt-BR")} em contratos federais!`,
		});
	} catch {}
}

async function cruzarFinanciadoresPNCP(
	doadores: any,
	sendEvent: SendEventFn,
	malhaOsintBuffer: any[],
) {
	sendEvent("STATUS", {
		msg: "Cruzando Financiadores no Portal Nacional de Contratações (PNCP)...",
	});
	const contratosPNCPGlobais: any[] = [];
	const cnpjsPNCP: string[] = [];

	if (
		Array.isArray(doadores) &&
		doadores.length > 0 &&
		typeof doadores[0] === "string"
	) {
		cnpjsPNCP.push(
			...[...new Set(doadores as string[])]
				.filter((d) => d.length === 14)
				.slice(0, 5),
		);
	}

	if (cnpjsPNCP.length > 0) {
		const promessas = cnpjsPNCP.map((cnpj) =>
			buscarContratosPNCP(cnpj).then((ct) => {
				if (ct.length > 0)
					contratosPNCPGlobais.push({ cnpj, contratos: ct });
			}),
		);
		await Promise.allSettled(promessas);
	}

	if (contratosPNCPGlobais.length > 0) {
		malhaOsintBuffer.push({
			_isContextOnly: true,
			tipoContexto: "CONTRATOS_MUNICIPAIS_DOADORES",
			contratosPNCP: contratosPNCPGlobais,
		});
		sendEvent("STATUS", {
			msg: "[OSINT] Localizados contratos municipais atrelados a financiadores recobrindo a malha na IA!",
		});
	}
}

async function investigarFinanciadoresCampanha(
	deputadoBasico: any,
	pessoaId: string,
	sendEvent: SendEventFn,
	pushNode: PushNodeFn,
	malhaOsintBuffer: any[],
) {
	sendEvent("STATUS", {
		msg: "Iniciando análise: 'Siga o Dinheiro da Campanha'...",
	});
	const tseDataFollow = (deputadoBasico as any)._tseResult;
	const cargoTse = resolverCargoTse(deputadoBasico.casa);
	const eleicaoIdTse = ["3", "5", "6", "7"].includes(cargoTse)
		? "2040602022"
		: "2045202024";
	const localidadeCodigo =
		tseDataFollow?.idUe ??
		(deputadoBasico.casa === "GOVERNO_ESTADUAL"
			? deputadoBasico.uf
			: undefined);

	let doadores = tseDataFollow?.doadores;

	if (localidadeCodigo) {
		if (!doadores) {
			sendEvent("STATUS", {
				msg: "Puxando financiadores de campanha no TSE...",
			});
			doadores = await buscarDoadoresTSE(
				deputadoBasico.nome,
				localidadeCodigo,
				cargoTse,
				eleicaoIdTse,
			);
		}

		const doadoresUnicos: string[] = [
			...new Set<string>(
				(doadores || []).filter((d: string) => d.length === 14),
			),
		].slice(0, 15);
		if (doadoresUnicos.length > 0) {
			sendEvent("STATUS", {
				msg: `Identificados ${doadoresUnicos.length} doadores CNPJ. Cruzando com contratos da União...`,
			});
			for (const cnpjDoador of doadoresUnicos) {
				await checarDoadorComprasGov(
					cnpjDoador,
					pessoaId,
					sendEvent,
					pushNode,
				);
				await new Promise((r) => setTimeout(r, 400));
			}
		} else {
			sendEvent("STATUS", {
				msg: "Nenhum doador CNPJ identificado no TSE para este mandato.",
			});
		}
	}

	await cruzarFinanciadoresPNCP(doadores, sendEvent, malhaOsintBuffer);
}

// ============================================================================
// 10. HISTÓRICO LEGISLATIVO (CÂMARA)
// ============================================================================

async function investigarProjetosLei(
	deputadoBasico: any,
	sendEvent: SendEventFn,
	malhaOsintBuffer: any[],
) {
	sendEvent("STATUS", {
		msg: "Extraindo Projetos de Lei e Histórico Legislativo...",
	});
	if (deputadoBasico.casa !== "CAMARA") return;

	const proposicoes = await buscarProjetosLeiCamara(deputadoBasico.id);
	if (proposicoes && proposicoes.length > 0) {
		malhaOsintBuffer.push({
			_isContextOnly: true,
			tipoContexto: "PROJETOS_LEI_AUTORIA",
			projetos: proposicoes,
		});
	}
}

// ============================================================================
// ORQUESTRADOR MESTRE DA MALHA OSINT
// ============================================================================

export async function executarMalhaOsint(params: OsintExecutorParams) {
	const {
		deputadoBasico,
		cpfLimpo,
		pessoaId,
		sendEvent,
		fichaPolitico,
		malhaOsintBuffer,
		supabaseNodes,
	} = params;

	const pushNode: PushNodeFn = (node: any) => {
		malhaOsintBuffer.push(node);
		supabaseNodes.push(node);
		if (node.type !== "PESSOA" || !node.id.includes("servidor")) {
			sendEvent("NODE_NOVO", node);
		}
	};

	await investigarTcesEstaduais(deputadoBasico, pessoaId, sendEvent, pushNode);
	await investigarRepassesEFiscais(
		deputadoBasico,
		cpfLimpo,
		pessoaId,
		sendEvent,
		fichaPolitico,
	);
	const empresasCNPJs = await investigarMalhaSocietaria(
		deputadoBasico,
		cpfLimpo,
		pessoaId,
		sendEvent,
		pushNode,
	);
	await investigarConveniosEmpresas(empresasCNPJs, sendEvent, pushNode);
	await investigarAeronavesAnac(
		deputadoBasico,
		empresasCNPJs,
		pessoaId,
		sendEvent,
		pushNode,
	);
	await investigarFinanciamentosERestricoesEmpresas(
		empresasCNPJs,
		pessoaId,
		sendEvent,
		pushNode,
	);
	await investigarHistoricoFiscalRS(
		deputadoBasico,
		cpfLimpo,
		pessoaId,
		sendEvent,
		pushNode,
	);
	await investigarGestaoMunicipal(
		deputadoBasico,
		pessoaId,
		sendEvent,
		pushNode,
		fichaPolitico,
	);
	await investigarFinanciadoresCampanha(
		deputadoBasico,
		pessoaId,
		sendEvent,
		pushNode,
		malhaOsintBuffer,
	);
	await investigarProjetosLei(deputadoBasico, sendEvent, malhaOsintBuffer);
}
