import { fetchWithTimeout } from "../tse";
import { traduzirJuridiquesSancoes } from "../ai_helpers";

export async function buscarProcessosDataJud(cpfOuNome: string, uf: string, pessoaId: string, sendEvent: any, alertasPessoais: string[]) {
    const datajudKey = process.env.DATAJUD_API_KEY;
    if (!datajudKey) {
        console.warn("[DATAJUD] Chave API não configurada.");
        return;
    }

    try {
        let searchAfter: any[] | null = null;
        let allProcessos: any[] = [];
        let maxPages = 3;
        let currentPage = 0;

        while (currentPage < maxPages) {
            const payload: any = {
                query: {
                    bool: {
                        must: [
                            { match: { "partes.documento": cpfOuNome } },
                            { match: { "classe.codigo": 129 } } // Ação Civil de Improbidade Administrativa
                        ]
                    }
                },
                size: 5,
                sort: [{ "@timestamp": { "order": "asc" } }]
            };

            if (searchAfter) {
                payload.search_after = searchAfter;
            }

            const response = await fetchWithTimeout(`https://api-publica.datajud.cnj.jus.br/api_publica_*/_search`, {
                method: 'POST',
                headers: {
                    'Authorization': datajudKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                timeout: 15000
            });

            if (!response.ok) {
                console.warn("[DATAJUD] API retornou erro:", response.status);
                break;
            }

            const data = await response.json();

            if (data && data.hits && data.hits.hits && data.hits.hits.length > 0) {
                const hits = data.hits.hits;
                allProcessos.push(...hits);
                
                const lastHit = hits[hits.length - 1];
                if (lastHit && lastHit.sort) {
                    searchAfter = lastHit.sort;
                } else {
                    break;
                }
            } else {
                break;
            }

            currentPage++;
        }

        if (allProcessos.length > 0) {
            for (let i = 0; i < allProcessos.length; i++) {
                const procRaw = allProcessos[i];
                const proc = procRaw._source;
                const assuntoPrinc = proc.assuntos?.[0]?.nome || "Improbidade Administrativa";

                let motivoFinal = `[DATAJUD] Réu em Ação de Improbidade Administrativa. Assunto principal: ${assuntoPrinc}.`;
                let gravidadeFinal = 95;

                try {
                    // IA avalia o processo
                    const resumo = await traduzirJuridiquesSancoes([{ titulo: assuntoPrinc, descricao: `Processo da Classe de Improbidade Administrativa nº ${proc.numeroProcesso}` }]);
                    if (resumo && resumo.resumo_improbidade) {
                        motivoFinal = resumo.resumo_improbidade;
                        gravidadeFinal = resumo.gravidade || 95;
                    }
                } catch (err) { }

                alertasPessoais.push(`[DATAJUD] Processo ${proc.numeroProcesso} (${proc.orgaoJulgador?.nome || "TJ"}): ${motivoFinal} (Risco ${gravidadeFinal})`);

                sendEvent('NODE_NOVO', {
                    id: `processo-datajud-${proc.numeroProcesso}`,
                    type: 'PROCESSO_JUDICIAL',
                    _origemId: pessoaId,
                    data: {
                        label: `Processo: ${proc.numeroProcesso}`,
                        tribunal: proc.orgaoJulgador?.nome || "Tribunal de Justiça",
                        assunto: assuntoPrinc,
                        classe: proc.classe?.nome || "Ação de Improbidade",
                        dataAjuizamento: proc.dataAjuizamento,
                        score_letalidade: gravidadeFinal,
                        motivo_ia: motivoFinal
                    }
                });
            }
        }
    } catch (error) {
        console.error("[DATAJUD] Erro ao buscar processos:", error);
    }
}
