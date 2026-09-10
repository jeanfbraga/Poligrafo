import { traduzirJuridiquesSancoes } from "../ai_helpers";
import { fetchWithTimeout } from "../tse";

async function fetchDataJudPage(cpfOuNome: string, datajudKey: string, searchAfter: any[] | null): Promise<any | null> {
	const payload: any = {
		query: {
			bool: {
				must: [
					{ match: { "partes.documento": cpfOuNome } },
					{ match: { "classe.codigo": 129 } },
				],
			},
		},
		size: 5,
		sort: [{ "@timestamp": { order: "asc" } }],
		...(searchAfter && { search_after: searchAfter }),
	};

	const auth = datajudKey.startsWith("APIKey ") ? datajudKey : `APIKey ${datajudKey}`;
	const res = await fetchWithTimeout(`https://api-publica.datajud.cnj.jus.br/api_publica_*/_search`, {
		method: "POST",
		headers: { Authorization: auth, "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		timeout: 60000,
	});
	return res.ok ? await res.json() : null;
}

async function coletarHitsDataJud(cpfOuNome: string, datajudKey: string): Promise<any[]> {
	let searchAfter: any[] | null = null;
	const allProcessos: any[] = [];
	for (let currentPage = 0; currentPage < 3; currentPage++) {
		const data = await fetchDataJudPage(cpfOuNome, datajudKey, searchAfter);
		const hits = data?.hits?.hits;
		if (!hits || hits.length === 0) break;
		allProcessos.push(...hits);
		const lastHit = hits[hits.length - 1];
		if (!lastHit?.sort) break;
		searchAfter = lastHit.sort;
	}
	return allProcessos;
}

async function avaliarProcessoComIA(assuntoPrinc: string, numeroProcesso: string) {
	try {
		const resumo = await traduzirJuridiquesSancoes([
			{ titulo: assuntoPrinc, descricao: `Processo da Classe de Improbidade Administrativa nº ${numeroProcesso}` },
		]);
		if (resumo?.resumo_improbidade) {
			return { motivo: resumo.resumo_improbidade, gravidade: resumo.gravidade || 95 };
		}
	} catch (_err) {}
	return {
		motivo: `[DATAJUD] Réu em Ação de Improbidade Administrativa. Assunto principal: ${assuntoPrinc}.`,
		gravidade: 95,
	};
}

async function emitirProcessoDataJud(
	proc: any,
	pessoaId: string,
	sendEvent: any,
	alertasPessoais: string[],
) {
	const assuntoPrinc = proc.assuntos?.[0]?.nome || "Improbidade Administrativa";
	const { motivo, gravidade } = await avaliarProcessoComIA(assuntoPrinc, proc.numeroProcesso);
	const tribunal = proc.orgaoJulgador?.nome || "Tribunal de Justiça";

	alertasPessoais.push(
		`[DATAJUD] Processo ${proc.numeroProcesso} (${tribunal}): ${motivo} (Risco ${gravidade})`,
	);

	sendEvent("NODE_NOVO", {
		id: `processo-datajud-${proc.numeroProcesso}`,
		type: "PROCESSO_JUDICIAL",
		_origemId: pessoaId,
		data: {
			label: `Processo: ${proc.numeroProcesso}`,
			tribunal,
			assunto: assuntoPrinc,
			classe: proc.classe?.nome || "Ação de Improbidade",
			dataAjuizamento: proc.dataAjuizamento,
			score_letalidade: gravidade,
			motivo_ia: motivo,
		},
	});
}

export async function buscarProcessosDataJud(
	cpfOuNome: string,
	_uf: string,
	pessoaId: string,
	sendEvent: any,
	alertasPessoais: string[],
) {
	const datajudKey = process.env.DATAJUD_API_KEY;
	if (!datajudKey) {
		console.warn("[DATAJUD] Chave API não configurada.");
		return;
	}

	try {
		const allProcessos = await coletarHitsDataJud(cpfOuNome, datajudKey);
		if (allProcessos.length === 0) {
			console.log(`[DATAJUD] Busca concluída com sucesso. 0 processos encontrados para o CPF.`);
			return;
		}
		for (const procRaw of allProcessos) {
			await emitirProcessoDataJud(procRaw._source, pessoaId, sendEvent, alertasPessoais);
		}
	} catch (error) {
		console.error("[DATAJUD] Erro ao buscar processos:", error);
	}
}
