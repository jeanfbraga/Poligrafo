import { fetchWithTimeout } from "../tse";
import { buscarConveniosTransferegov } from "./osint-contratos";
import { buscarNomeacoesDOU } from "../../../../lib/dou/client";
import { buscarDiariosMunicipais } from "../../../../lib/dou/queridodiario";
import { checkNepotismoCMRJ } from "@/lib/cmrj/nepotismo-client";

export async function investigarFornecedorNivelHard(cnpj: string) {
    const cnpjLimpo = cnpj ? cnpj.replace(/[^\d]+/g, '') : '';
    let alertas: string[] = [];
    let capitalSocial: any = 'Dado Indisponível';
    let dataAbertura = 'Dado Indisponível';
    let socios: string[] = [];

    if (!cnpjLimpo || cnpjLimpo.length !== 14 || cnpjLimpo === '00000000000000') {
        return { scorePenalidade: 0, alertas, capitalSocial, dataAbertura, socios };
    }

    const apiKey = process.env.TRANSPARENCIA_API_KEY || '';
    let penality = 0;

    const [resSancoes, resCompras, resBrasil] = await Promise.allSettled([
        apiKey ? fetchWithTimeout(`https://api.portaldatransparencia.gov.br/api-de-dados/sancoes?cnpjSancionado=${cnpjLimpo}&pagina=1`, { headers: { 'chave-api-dados': apiKey } }) : Promise.reject('No API Key'),
        fetchWithTimeout(`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${cnpjLimpo}`),
        fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`)
    ]);

    if (resSancoes.status === 'fulfilled' && resSancoes.value.ok) {
        try {
            const sancoes = await resSancoes.value.json();
            if (Array.isArray(sancoes) && sancoes.length > 0) {
                alertas.push("[CGU/CEIS] Empresa Sancionada/Inidônea.");
                penality += 50;
            }
        } catch (e) { }
    }

    if (resCompras.status === 'fulfilled' && resCompras.value.ok) {
        try {
            const comprasData = await resCompras.value.json();
            const contratos = comprasData?._embedded?.contratos || [];
            if (contratos.length > 0) {
                alertas.push(`[COMPRAS.GOV] ${contratos.length} Contratos Federais Ativos.`);
                penality += 10;
            }
        } catch (e) { }
    }

    const convenios = await buscarConveniosTransferegov(cnpjLimpo);
    if (convenios && convenios.valorTotal > 0) {
        alertas.push(`[TRANSFEREGOV] Recebedor de ${convenios.quantidade} Convênio(s) Federal(is). Total: R$ ${convenios.valorTotal.toLocaleString('pt-BR')}`);
        penality += 30;
    }

    return { scorePenalidade: penality, alertas, capitalSocial, dataAbertura, socios };
}

export async function expandirMalhaSocietaria(docLimpo: string, pessoaId: string, sendEvent: any): Promise<string[]> {
    if (docLimpo.length !== 14) return [];

    try {
        const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${docLimpo}`, { timeout: 6000 });
        if (res.ok) {
            const empresa = await res.json();
            sendEvent('NODE_NOVO', {
                id: `empresa-${docLimpo}`,
                type: 'EMPRESA',
                _origemId: pessoaId,
                data: {
                    label: empresa.razao_social || 'Empresa Localizada',
                    cnpj: docLimpo,
                    capitalSocial: empresa.capital_social || 0,
                    cnae: empresa.cnae_fiscal_descricao || '',
                    situacao: empresa.descricao_situacao_cadastral || 'Ativa'
                }
            });

            const qsa = empresa.qsa || [];
            for (let i = 0; i < qsa.slice(0, 5).length; i++) {
                const socio = qsa[i];

                let douMotivo = "";
                let douScore = 0;
                try {
                    const douRes = await buscarNomeacoesDOU(socio.nome_socio, 'ANO');
                    if (douRes.total > 0 && douRes.publicacoes.length > 0) {
                        const pub = douRes.publicacoes[0];
                        const ehNomeacao = pub.tipoPublicacao?.toLowerCase().includes('nomeação') || pub.titulo?.toLowerCase().includes('nomear') || pub.titulo?.toLowerCase().includes('portaria');
                        
                        if (ehNomeacao) {
                             douMotivo = `[DOU] NOMEAÇÃO EM CARGO COMISSIONADO: ${pub.orgao ? pub.orgao.toUpperCase() : 'ÓRGÃO FEDERAL'} (Nepotismo/Laranja detectado nas proximidades de ${pub.assinante || 'autoridade'})`;
                             douScore = 90;
                        } else {
                             douMotivo = `[DOU] ATO DE PESSOAL: ${pub.tipoPublicacao?.toUpperCase() || 'PUBLICAÇÃO'} NO DIÁRIO OFICIAL DA UNIÃO (${pub.orgao || 'Órgão Federal'})`;
                             douScore = 60;
                        }
                    }
                } catch (e) { }

                try {
                    const qdRes = await buscarDiariosMunicipais({ termo: socio.nome_socio, size: 3, timeout: 6000 });
                    if (qdRes.total_gazettes > 0 && qdRes.gazettes.length > 0) {
                        const gazette = qdRes.gazettes[0];
                        const trecho = gazette.excerpts && gazette.excerpts.length > 0 ? gazette.excerpts[0].substring(0, 150) : '';
                        const isNomeacaoOuContrato = trecho.toLowerCase().includes('nomeaç') || trecho.toLowerCase().includes('contrat') || trecho.toLowerCase().includes('portaria');
                        
                        if (isNomeacaoOuContrato) {
                             douMotivo = `[QUERIDO DIÁRIO] CITAÇÃO MUNICIPAL (${gazette.territory_name || 'Município'}): Possível nomeação ou contrato nas proximidades de autoridade. Excerto: "${trecho}..."`;
                             douScore = douScore > 0 ? Math.max(douScore, 85) : 85;
                        } else if (!douMotivo) {
                             douMotivo = `[QUERIDO DIÁRIO] CITAÇÃO MUNICIPAL (${gazette.territory_name || 'Município'}. Excerto: "${trecho}..."`;
                             douScore = 40;
                        }
                    }
                } catch (e) { }

                try {
                    const nepoMatch = await checkNepotismoCMRJ(socio.nome_socio);
                    if (nepoMatch) {
                        const lotacaoStr = nepoMatch.lotacao || 'Lotação N/I';
                        const cargoStr = nepoMatch.cargo || nepoMatch.vinculo || 'Cargo N/I';
                        douMotivo = `🚨 [ALERTA DE NEPOTISMO] O sócio da empresa do investigado (${socio.nome_socio}) está na Folha de Pagamento da Câmara Municipal do Rio (CMRJ)! Lotação: ${lotacaoStr} - Cargo: ${cargoStr}.`;
                        douScore = 100;
                    }
                } catch(e) { }

                sendEvent('NODE_NOVO', {
                    id: `socio-${docLimpo}-${i}`,
                    type: 'SOCIO',
                    _origemId: pessoaId,
                    data: {
                        label: socio.nome_socio || 'Sócio',
                        cargo: socio.qualificacao_socio || 'Sócio',
                        motivo_ia: douMotivo || undefined,
                        score_letalidade: douScore || 0
                    }
                });
            }
            return [docLimpo];
        }
    } catch (e) { }
    return [];
}
