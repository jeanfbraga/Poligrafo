import { transparenciaLimiter } from "@/services/core/rate-limiter";
import { listarAtividadesAuditoria } from "@/services/integrations/denasus/client";
import {
	buscarCadirregTCU,
	buscarInabilitadosTCU,
} from "@/services/integrations/tcu/client";
import { traduzirJuridiquesSancoes } from "../ai_helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchWithTimeout, type ItemHistoricoTse } from "../tse";
import { buscarProcessosDataJud } from "./judiciario";

export interface ResultadoInvestigacaoPolitico {
	patrimonioTotal: number;
	sancoesCgu: boolean;
	alertasPessoais: string[];
	bensDeclarados: any[];
	anoPatrimonio?: number;
	historicoPatrimonio?: ItemHistoricoTse[];
	patrimonioAnterior?: number;
	anoPatrimonioAnterior?: number;
	variacaoPatrimonio?: number;
	variacaoPatrimonioPercentual?: number;
}

async function verificarPatrimonioTse(uf: string, nome: string) {
	let patrimonioTotal = 0;
	const bensDeclarados: any[] = [];
	let alertaPatrimonio: string | null = null;

	const urlBusca = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/2026/${uf}/20322002026/6/candidatos`;
	const resBusca = await fetchWithTimeout(urlBusca, { timeout: 4000 });

	if (resBusca.ok) {
		const dataBusca = await resBusca.json();
		const nomeLower = nome.toLowerCase();
		const candidato = dataBusca.candidatos?.find(
			(c: any) =>
				c.nomeUrna?.toLowerCase() === nomeLower ||
				c.nomeCompleto?.toLowerCase() === nomeLower,
		);

		if (candidato) {
			const urlBens = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/candidato/2026/${uf}/20322002026/candidato/${candidato.id}/bens`;
			const resBens = await fetchWithTimeout(urlBens, { timeout: 4000 });
			if (resBens.ok) {
				const dataBens = await resBens.json();
				patrimonioTotal = dataBens.totalDeBens || 0;
				if (dataBens.bens) bensDeclarados.push(...dataBens.bens);
				if (patrimonioTotal > 0) {
					alertaPatrimonio = `[TSE] Patrimônio Declarado (2026): R$ ${patrimonioTotal.toLocaleString("pt-BR")}`;
				}
			}
		}
	}

	return { patrimonioTotal, bensDeclarados, alertaPatrimonio };
}

async function verificarSancoesCache(
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	alertasPessoais: string[],
): Promise<boolean> {
	try {
		const { data: sancoesData } = await supabaseAdmin
			.from("cgu_sancoes_cache")
			.select("*")
			.eq("cpf_cnpj", cpfLimpo);

		if (!sancoesData || sancoesData.length === 0) return false;

		sendEvent("STATUS", { msg: "[CACHE] Sanções CGU resgatadas do banco local." });
		sancoesData.forEach((s) => {
			if (s.tipo_sancao === "PEP") {
				alertasPessoais.push(`[PEP] Pessoa Politicamente Exposta: ${s.descricao} — ${s.orgao}`);
				sendEvent("STATUS", { msg: `[PEP] Confirmado: Pessoa Politicamente Exposta registrada na base federal.` });
			} else {
				alertasPessoais.push(`[ALERTA MÁXIMO] CPF consta na base ${s.tipo_sancao}. Orgao: ${s.orgao}`);
				sendEvent("NODE_NOVO", {
					id: `sancao-${s.tipo_sancao}-${cpfLimpo}`,
					type: "PROCESSO_JUDICIAL",
					_origemId: pessoaId,
					data: {
						label: `Sanção CGU: ${s.tipo_sancao}`,
						tribunal: s.tipo_sancao,
						assunto: "Sanção Administrativa",
						score_letalidade: 95,
						motivo_ia: `Registro na base ${s.tipo_sancao} da CGU. ${s.descricao || "Restrição de Direitos e impedimento de contratar com a Administração Pública."}`,
					},
				});
			}
		});
		return true;
	} catch (_e) {
		return false;
	}
}

async function emitirSancaoNode(
	key: string,
	nome: string,
	cpfLimpo: string,
	pessoaId: string,
	data: any,
	sendEvent: any,
	alertasPessoais: string[],
) {
	try {
		const ts = await traduzirJuridiquesSancoes(data);
		const motivoIa = ts?.resumo_improbidade || `O cidadão consta na base ${nome} da CGU. Restrição de Direitos e impedimento de contratar com a Administração Pública.`;
		const score = ts?.gravidade || 95;

		if (ts?.resumo_improbidade) {
			alertasPessoais.push(`[TCU/CGU RESUMO IA] ${ts.resumo_improbidade} (Gravidade: ${ts.gravidade})`);
		}
		sendEvent("NODE_NOVO", {
			id: `sancao-${key}-${cpfLimpo}`,
			type: "PROCESSO_JUDICIAL",
			_origemId: pessoaId,
			data: {
				label: `Sanção CGU: ${nome}`,
				tribunal: nome,
				assunto: "Ato de Improbidade / Irregularidade Administrativa",
				score_letalidade: score,
				motivo_ia: motivoIa,
			},
		});
	} catch (_err) {
		alertasPessoais.push(`[ALERTA MÁXIMO] O CPF consta na base ${nome} da CGU.`);
	}
}

async function processarResultadoSancaoPep(
	res: PromiseSettledResult<{ key: string; nome: string; data: any }>,
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	alertasPessoais: string[],
): Promise<boolean> {
	if (res.status !== "fulfilled") return false;
	const { key, nome, data } = res.value;
	if (!Array.isArray(data) || data.length === 0) return false;

	if (key === "pep") {
		const pep = data[0];
		const funcao = pep.funcao || pep.descricaoFuncao || "Cargo de Alta Relevância";
		const orgao = pep.orgao?.nome || pep.orgao || "Órgão Federal";
		alertasPessoais.push(`[PEP] Pessoa Politicamente Exposta: ${funcao} — ${orgao}`);
		sendEvent("STATUS", { msg: `[PEP] Confirmado: Pessoa Politicamente Exposta registrada na base federal (${funcao}).` });
		return false;
	}

	alertasPessoais.push(`[ALERTA MÁXIMO] CPF consta na base ${nome}. ${data.length} registro(s) de sanção.`);
	await emitirSancaoNode(key, nome, cpfLimpo, pessoaId, data, sendEvent, alertasPessoais);
	return true;
}

async function consultarSancoesApi(
	cpfLimpo: string,
	nome: string,
	apiKey: string,
	pessoaId: string,
	sendEvent: any,
	alertasPessoais: string[],
): Promise<boolean> {
	const BASE_TRANSPARENCIA = "https://api.portaldatransparencia.gov.br/api-de-dados";
	const headers = { "chave-api-dados": apiKey };
	await transparenciaLimiter.acquire();

	const isCpfValido = cpfLimpo && cpfLimpo !== "00000000000" && cpfLimpo.length === 11;
	const pSancao = isCpfValido ? `codigoSancionado=${cpfLimpo}` : `nomeSancionado=${encodeURIComponent(nome)}`;
	const pCeaf = isCpfValido ? `cpfSancionado=${cpfLimpo}` : `nomeSancionado=${encodeURIComponent(nome)}`;
	const pPep = isCpfValido ? `cpf=${cpfLimpo}` : `nome=${encodeURIComponent(nome)}`;

	const bases = [
		{ key: "ceis", url: `${BASE_TRANSPARENCIA}/ceis?${pSancao}&pagina=1`, nome: "CEIS (Empresas Inidôneas e Suspensas)" },
		{ key: "cnep", url: `${BASE_TRANSPARENCIA}/cnep?${pSancao}&pagina=1`, nome: "CNEP (Empresas Punidas)" },
		{ key: "ceaf", url: `${BASE_TRANSPARENCIA}/ceaf?${pCeaf}&pagina=1`, nome: "CEAF (Expulsões da Adm. Federal)" },
		{ key: "pep", url: `${BASE_TRANSPARENCIA}/peps?${pPep}&pagina=1`, nome: "PEP" },
	];

	const consultas = bases.map((b) =>
		fetchWithTimeout(b.url, { headers, timeout: 5000 })
			.then(async (r) => ({ key: b.key, nome: b.nome, data: r.ok ? await r.json() : [] }))
			.catch(() => ({ key: b.key, nome: b.nome, data: [] })),
	);

	const resultados = await Promise.allSettled(consultas);
	let houveSancao = false;
	for (const res of resultados) {
		const s = await processarResultadoSancaoPep(res, cpfLimpo, pessoaId, sendEvent, alertasPessoais);
		if (s) houveSancao = true;
	}
	return houveSancao;
}

async function verificarAuditoriasDenasus(
	nome: string,
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	alertasPessoais: string[],
) {
	try {
		sendEvent("STATUS", { msg: `Consultando auditorias do SUS no DENASUS...` });
		const auditorias = await listarAtividadesAuditoria();
		const nomeLower = nome.toLowerCase().trim();
		const auditoriasPolitico = auditorias.filter((a) => a.titulo.toLowerCase().includes(nomeLower));

		auditoriasPolitico.forEach((aud, idx) => {
			alertasPessoais.push(`[DENASUS] Alvo citado em auditoria do SUS: "${aud.titulo}"`);
			sendEvent("NODE_NOVO", {
				id: `denasus-auditoria-${cpfLimpo}-${idx}-${Date.now()}`,
				type: "PROCESSO_JUDICIAL",
				_origemId: pessoaId,
				data: {
					label: `Auditoria SUS (DENASUS)`,
					tribunal: `Departamento Nacional de Auditoria do SUS (${aud.uf || "Nacional"})`,
					assunto: aud.tipo || "Atividade de Auditoria",
					score_letalidade: aud.tipo === "Auditoria" ? 80 : 50,
					motivo_ia: `${aud.titulo}. Situação: ${aud.situacao}. Data: ${aud.data || "N/I"}. Resumo: ${aud.resumo || "N/A"}`,
				},
			});
		});
	} catch (err: any) {
		console.error("[DENASUS] Erro ao buscar auditorias:", err.message);
	}
}

async function verificarBasesTcu(
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	alertasPessoais: string[],
) {
	try {
		sendEvent("STATUS", { msg: `Consultando bases do TCU (Inabilitados e Contas Irregulares)...` });
		const [inabilitados, cadirreg] = await Promise.all([
			buscarInabilitadosTCU(cpfLimpo),
			buscarCadirregTCU(cpfLimpo),
		]);

		if (inabilitados.length > 0) {
			alertasPessoais.push(`[TCU] Alerta Crítico: Pessoa INABILITADA para cargo público`);
			inabilitados.forEach((inab, idx) => {
				sendEvent("NODE_NOVO", {
					id: `tcu-inab-${cpfLimpo}-${idx}-${Date.now()}`,
					type: "PROCESSO_JUDICIAL" as const,
					_origemId: pessoaId,
					data: {
						label: `Inabilitado TCU`,
						tribunal: `Tribunal de Contas da União`,
						assunto: `Inabilitação para Cargo Público`,
						score_letalidade: 98,
						motivo_ia: `Pessoa inabilitada pelo TCU. Motivo: ${inab.motivo}. Deliberação: ${inab.deliberacao}. Período: ${inab.dataInicio} a ${inab.dataFim}.`,
					},
				});
			});
		}

		if (cadirreg.length > 0) {
			alertasPessoais.push(`[TCU] Alerta: Pessoa possui contas IRREGULARES no CADIRREG`);
			cadirreg.forEach((cad, idx) => {
				sendEvent("NODE_NOVO", {
					id: `tcu-cadirreg-${cpfLimpo}-${idx}-${Date.now()}`,
					type: "PROCESSO_JUDICIAL" as const,
					_origemId: pessoaId,
					data: {
						label: `CADIRREG TCU`,
						tribunal: `Tribunal de Contas da União`,
						assunto: `Contas Irregulares`,
						score_letalidade: 90,
						motivo_ia: `Registro no CADIRREG (Cadastro de Responsáveis com Contas Irregulares). Processo: ${cad.processo}. Situação: ${cad.situacao}.`,
					},
				});
			});
		}
	} catch (err: any) {
		console.error("[TCU] Erro ao buscar dados do TCU:", err.message);
	}
}

function extrairDadosConvenio(primeiro: any, valorTotal: number, qtd: number) {
	const orgaoConcedente = primeiro?.concedente?.nome || primeiro?.orgaoConcedente || "Órgão Federal";
	const situacao = primeiro?.situacao?.descricao || primeiro?.situacao || "Vigente";
	const numeroConvenio = primeiro?.numeroConvenio || primeiro?.numero || "N/A";
	return {
		label: `Convênio Federal (${qtd})`,
		objeto: `Convenente em ${qtd} convênio(s) com o Governo Federal.`,
		valor: valorTotal,
		orgao: orgaoConcedente,
		codigo: "CONVENIO_FEDERAL",
		situacao,
		numeroConvenio,
		score_letalidade: 50,
		motivo_ia: `O cidadão está registrado como convenente em ${qtd} convênio(s) federal(is). Valor total: R$ ${valorTotal.toLocaleString("pt-BR")}. Situação recente: ${situacao}.`,
	};
}

async function verificarConveniosFederais(
	cpfLimpo: string,
	pessoaId: string,
	apiKey: string,
	sendEvent: any,
	alertasPessoais: string[],
) {
	if (!apiKey) return;
	try {
		sendEvent("STATUS", { msg: `Consultando Convênios Federais do cidadão no Portal da Transparência...` });
		await transparenciaLimiter.acquire();
		const url = `https://api.portaldatransparencia.gov.br/api-de-dados/convenios?convenente=${cpfLimpo}&pagina=1`;
		const res = await fetchWithTimeout(url, { headers: { "chave-api-dados": apiKey }, timeout: 8000 });
		if (!res.ok) return;

		const conveniosData = await res.json();
		if (!Array.isArray(conveniosData) || conveniosData.length === 0) return;

		const valorTotal = conveniosData.reduce(
			(acc: number, c: any) => acc + Number(c.valorTotal || c.valor_global || 0),
			0,
		);
		const dadosConvenio = extrairDadosConvenio(conveniosData[0], valorTotal, conveniosData.length);

		alertasPessoais.push(
			`[TRANSPARÊNCIA] Cidadão figura como convenente em ${conveniosData.length} Convênio(s) Federal(is). Valor total: R$ ${valorTotal.toLocaleString("pt-BR")}`,
		);
		sendEvent("NODE_NOVO", {
			id: `convenio-cpf-${cpfLimpo}-${Date.now()}`,
			type: "CONTRATO",
			_origemId: pessoaId,
			data: dadosConvenio,
		});
	} catch (err: any) {
		console.warn("[TRANSPARÊNCIA] Erro ou timeout em convênios:", err.message);
	}
}

export async function investigarPolitico(
	cpfLimpo: string,
	nome: string,
	uf: string,
	pessoaId: string,
	sendEvent: any,
): Promise<ResultadoInvestigacaoPolitico> {
	let patrimonioTotal = 0;
	let sancoesCgu = false;
	const alertasPessoais: string[] = [];
	const bensDeclarados: any[] = [];

	if (!cpfLimpo || cpfLimpo === "00000000000") {
		return { patrimonioTotal, sancoesCgu, alertasPessoais, bensDeclarados };
	}

	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";

	try {
		// 1. Patrimônio no TSE
		const tse = await verificarPatrimonioTse(uf, nome);
		patrimonioTotal = tse.patrimonioTotal;
		bensDeclarados.push(...tse.bensDeclarados);
		if (tse.alertaPatrimonio) alertasPessoais.push(tse.alertaPatrimonio);

		// 2. Sanções CGU (Cache ou API)
		const cacheHit = await verificarSancoesCache(cpfLimpo, pessoaId, sendEvent, alertasPessoais);
		if (!cacheHit && apiKey) {
			sancoesCgu = await consultarSancoesApi(cpfLimpo, nome, apiKey, pessoaId, sendEvent, alertasPessoais);
		} else if (cacheHit) {
			sancoesCgu = true;
		}

		// 3. DataJud
		sendEvent("STATUS", { msg: `Verificando processos de Improbidade (Classe 129) no DataJud/CNJ...` });
		await buscarProcessosDataJud(cpfLimpo, uf, pessoaId, sendEvent, alertasPessoais).catch(() => {
			sendEvent("STATUS", { msg: `[AVISO] Busca no DataJud temporariamente indisponível. A investigação continuará.` });
		});

		// 4. DENASUS
		await verificarAuditoriasDenasus(nome, cpfLimpo, pessoaId, sendEvent, alertasPessoais);

		// 5. TCU
		await verificarBasesTcu(cpfLimpo, pessoaId, sendEvent, alertasPessoais);

		// 6. Convênios Federais
		await verificarConveniosFederais(cpfLimpo, pessoaId, apiKey, sendEvent, alertasPessoais);
	} catch (e) {
		console.error("[ETL] Erro Investigar Politico:", e);
	}

	return { patrimonioTotal, sancoesCgu, alertasPessoais, bensDeclarados };
}

function emitirItemReceitaFederal(item: any, docLimpo: string, i: number, pessoaId: string, sendEvent: any) {
	sendEvent("NODE_NOVO", {
		id: `cgu-desp-${docLimpo}-${i}`,
		type: "DESPESA",
		_origemId: pessoaId,
		data: {
			label: item.nomeFavorecido || item.nomeCredor || "Recebedor",
			valor: Number(item.valor || item.valorPago || 0),
			type: item.funcao || item.elementoDespesa || "Despesa Federal (CGU)",
			dataDocumento: item.data || item.dataDocumento || "2024-01-01",
			score_letalidade: 70,
			motivo_ia: "[CGU] Repasse Federal Direto detectado.",
		},
	});
}

async function consultarComprasContratos(docLimpo: string, pessoaId: string, sendEvent: any) {
	try {
		const res = await fetchWithTimeout(
			`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${docLimpo}`,
			{ timeout: 5000 },
		);
		if (!res.ok) return;

		const comprasData = await res.json();
		const contratos = comprasData?._embedded?.contratos || [];
		contratos.slice(0, 5).forEach((c: any, i: number) => {
			sendEvent("NODE_NOVO", {
				id: `compras-${docLimpo}-${i}`,
				type: "CONTRATO",
				_origemId: pessoaId,
				data: {
					label: c.fornecedor?.nome || "Contrato Federal",
					objeto: c.objeto || "Não Informado",
					valor: Number(c.valorInicial || 0),
				},
			});
		});
	} catch (_e) {}
}

export async function buscarReceitasFederais(
	docLimpo: string,
	pessoaId: string,
	sendEvent: any,
) {
	const isCnpj = docLimpo.length === 14;
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return;

	try {
		const paramCgu = isCnpj ? `cnpjFornecedor=${docLimpo}&pagina=1` : `cpfFornecedor=${docLimpo}&pagina=1`;
		const res = await fetchWithTimeout(
			`https://api.portaldatransparencia.gov.br/api-de-dados/despesas/por-favorecido?${paramCgu}`,
			{ headers: { "chave-api-dados": apiKey }, timeout: 8000 },
		);
		if (res.ok) {
			const json = await res.json();
			const items = Array.isArray(json) ? json : json.data || [];
			items.slice(0, 5).forEach((item: any, i: number) => {
				emitirItemReceitaFederal(item, docLimpo, i, pessoaId, sendEvent);
			});
		}
	} catch (e) {
		console.error("Erro CGU:", e);
	}

	if (isCnpj) {
		await consultarComprasContratos(docLimpo, pessoaId, sendEvent);
	}
}

async function carregarExtratoPortador(cpfLimpo: string, mesInicio: string, mesFim: string, apiKey: string): Promise<any[]> {
	if (cpfLimpo.length !== 11) return [];

	const urlComData = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?cpfPortador=${cpfLimpo}&mesExtratoInicio=${mesInicio}&mesExtratoFim=${mesFim}&pagina=1`;
	let res = await fetchWithTimeout(urlComData, { headers: { "chave-api-dados": apiKey }, timeout: 8000 });
	let data: any[] = res.ok ? await res.json() : [];

	if (!data || data.length === 0) {
		const urlSimples = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?cpfPortador=${cpfLimpo}&pagina=1`;
		res = await fetchWithTimeout(urlSimples, { headers: { "chave-api-dados": apiKey }, timeout: 6000 });
		if (res.ok) data = await res.json();
	}
	return Array.isArray(data) ? data : [];
}

async function carregarExtratoPresidencia(cpfLimpo: string, mesInicio: string, mesFim: string, apiKey: string, sendEvent: any): Promise<any[]> {
	sendEvent("STATUS", { msg: "Analisando faturas de Cartão de Pagamento do Governo Federal (CPGF)..." });

	try {
		const { data: cpgfCache } = await supabaseAdmin
			.from("cpgf_despesas_cache")
			.select("*")
			.eq("id_presidente", cpfLimpo);

		if (cpgfCache && cpgfCache.length > 0) {
			sendEvent("STATUS", { msg: `[CACHE] Extratos do Cartão Corporativo Presidencial resgatados da base local.` });
			return cpgfCache.map((d) => ({
				estabelecimento: { cnpjFormatado: d.cnpj_fornecedor, nomeRecebedor: d.nome_fornecedor },
				valorTransacao: Number(d.valor_transacao),
				tipoCartao: { descricao: d.tipo_cartao },
				dataTransacao: d.data_transacao,
				unidadeGestora: { orgaoVinculado: { nomeOrgao: "Presidência da República" } },
				portador: { nome: "SIGILOSO" },
			}));
		}
	} catch (_e) {}

	const urlPresidencia = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?codigoOrgao=20000&dataTransacaoInicio=${mesInicio}&dataTransacaoFim=${mesFim}&pagina=1`;
	const resPresidencia = await fetchWithTimeout(urlPresidencia, { headers: { "chave-api-dados": apiKey }, timeout: 8000 });
	if (resPresidencia.ok) {
		const data = await resPresidencia.json();
		if (Array.isArray(data) && data.length > 0) {
			sendEvent("STATUS", { msg: `[CPGF] Consultando as faturas governamentais do Órgão Presidência da República...` });
			return data;
		}
	}
	return [];
}

function extrairMotivoCartao(
	isSigiloso: boolean,
	tipoCartao: string,
	nomeEstabelecimento: string,
	cnpjEstabelecimento: string,
	nomeOrgao: string,
	nomePortador: string,
	dataTransacao: string,
) {
	if (isSigiloso) return "Risco Alto: Transação protegida por sigilo de Estado.";
	return `Gasto via Cartão Corporativo (${tipoCartao}) no estabelecimento: ${nomeEstabelecimento} (CNPJ: ${cnpjEstabelecimento}). Órgão: ${nomeOrgao}. Portador: ${nomePortador}. Data: ${dataTransacao}.`;
}

function obterDadosLancamentoCartao(item: any) {
	const isSigiloso = item.estabelecimento?.cnpjFormatado === "SIGILOSO";
	const tipoCartao = item.tipoCartao?.descricao || "CPGF";
	const nomeEstabelecimento = item.estabelecimento?.nomeRecebedor || "Fornecedor Desconhecido";
	const cnpjEstabelecimento = item.estabelecimento?.cnpjFormatado || "SIGILOSO";
	const nomeOrgao = item.unidadeGestora?.orgaoVinculado?.nomeOrgao || "Órgão Federal";
	const nomePortador = item.portador?.nome || "Não Ident.";
	const motivoIa = extrairMotivoCartao(
		isSigiloso,
		tipoCartao,
		nomeEstabelecimento,
		cnpjEstabelecimento,
		nomeOrgao,
		nomePortador,
		item.dataTransacao,
	);

	return {
		label: isSigiloso ? `GASTO SIGILOSO (${tipoCartao})` : nomeEstabelecimento,
		valor: item.valorTransacao,
		tipo: `Cartão Corporativo - ${tipoCartao}`,
		documento: cnpjEstabelecimento,
		estabelecimento: isSigiloso ? "SIGILOSO" : nomeEstabelecimento,
		tipoCartao,
		dataDocumento: item.dataTransacao,
		orgao: nomeOrgao,
		portador: item.portador?.nome || "Portador Não Identificado",
		motivo_ia: motivoIa,
		score_letalidade: isSigiloso ? 85 : 55,
	};
}

function emitirLancamentoCartao(item: any, cpfLimpo: string, idx: number, pessoaId: string, sendEvent: any) {
	sendEvent("NODE_NOVO", {
		id: `cpgf-${cpfLimpo}-${idx}-${Date.now()}`,
		type: "DESPESA",
		_origemId: pessoaId,
		data: obterDadosLancamentoCartao(item),
	});
}

export async function buscarCartaoCorporativo(
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	casaPolitico?: string,
) {
	if (!cpfLimpo || cpfLimpo === "00000000000") return;
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return;

	try {
		const anoAtual = new Date().getFullYear();
		const mesInicio = `01/01/${anoAtual - 2}`;
		const mesFim = `31/12/${anoAtual}`;
		await transparenciaLimiter.acquire();

		let data = await carregarExtratoPortador(cpfLimpo, mesInicio, mesFim, apiKey);

		if (casaPolitico === "PRESIDENCIA_DA_REPUBLICA" && data.length === 0) {
			data = await carregarExtratoPresidencia(cpfLimpo, mesInicio, mesFim, apiKey, sendEvent);
		}

		if (data.length > 0) {
			sendEvent("STATUS", { msg: `[CPGF] Detectados gastos com Cartão Corporativo. Rastreando...` });
			data.slice(0, 10).forEach((item: any, idx: number) => {
				emitirLancamentoCartao(item, cpfLimpo, idx, pessoaId, sendEvent);
			});
		}
	} catch (e) {
		console.error("[OSINT CPGF Error]", e);
	}
}

export async function buscarViagensFAB(
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	_casaPolitico?: string,
) {
	if (!cpfLimpo || cpfLimpo === "00000000000") return;
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return;
	try {
		const url = `https://api.portaldatransparencia.gov.br/api-de-dados/viagens?cpfViajante=${cpfLimpo}&pagina=1`;
		let data: any[] = [];

		if (cpfLimpo.length === 11) {
			const res = await fetchWithTimeout(url, {
				headers: { "chave-api-dados": apiKey },
				timeout: 6000,
			});
			if (res.ok) {
				data = await res.json();
			}
		}

		if (Array.isArray(data) && data.length > 0) {
			sendEvent("STATUS", {
				msg: `[VIAGENS] Rastreando diárias governamentais e voos da Força Aérea Brasileira (FAB).`,
			});

			data.slice(0, 5).forEach((item: any, idx: number) => {
				sendEvent("NODE_NOVO", {
					id: `viagem-${cpfLimpo}-${idx}-${Date.now()}`,
					type: "DESPESA",
					_origemId: pessoaId,
					data: {
						label: `Viagem Oficial: ${item.destinos?.[0]?.localidadeDestino || "N/I"}`,
						valor: item.valorTotalViagem,
						tipo: item.tipoViagem?.descricao || "Viagem a Serviço",
						documento: cpfLimpo,
						dataDocumento: `${item.dataInicio} a ${item.dataFim}`,
						motivo_ia: item.motivo || "Motivo de viagem financiada pelo Estado",
						score_letalidade: item.valorTotalViagem > 25000 ? 75 : 45,
					},
				});
			});
		}
	} catch (e) {
		console.error("[OSINT Viagens Error]", e);
	}
}
