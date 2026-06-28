import { fetchWithTimeout } from '../../tse';

// ==========================================
// Extrator NATIVO: TCE Tocantins (TO)
// Engenharia Reversa do pacote mcp-brasil
// Foco: Busca por Pessoa/CPF → Processos
// ==========================================

const API_BASE = "https://api.tceto.tc.br/econtas/api";
const TIMEOUT_TO = 15000;

/**
 * Busca processos vinculados a uma pessoa no TCE-TO.
 * A API requer o header Accept: application/json.
 */
export async function buscarProcessosTceTo(nomeBuscado: string): Promise<any[]> {
    const termo = nomeBuscado.trim();
    if (!termo) return [];

    console.log(`[TCE-TO] Iniciando varredura de processos para: ${termo}`);
    
    const url = `${API_BASE}/pessoas?nome=${encodeURIComponent(termo)}&pagina=1&tamanho=20`;

    try {
        const res = await fetchWithTimeout(url, {
            timeout: TIMEOUT_TO,
            headers: { "Accept": "application/json" }
        });

        if (!res.ok) {
            console.warn(`[TCE-TO] Falha na API. Status: ${res.status}`);
            return [];
        }

        const data = await res.json();
        const pessoas = Array.isArray(data) ? data : [];

        const processos: any[] = [];

        pessoas.forEach((pessoa: any) => {
            const listaProcessos = pessoa.processos || [];
            listaProcessos.forEach((p: any) => {
                processos.push({
                    titulo: `Processo ${p.numero_ano || "N/I"}`,
                    resumo: `Assunto: ${p.assunto || "N/I"} | Classe: ${p.classe_assunto || "N/I"} | Origem: ${p.entidade_origem || "N/I"} (${p.entidade_origem_municipio || ""})`,
                    dataPublicacao: p.data_entrada || "N/I",
                    departamento: p.departamento_atual || "N/I",
                    nomePessoa: pessoa.nome || termo
                });
            });
        });

        console.log(`[TCE-TO] Localizados ${processos.length} processo(s) para o alvo.`);
        return processos;
    } catch (e) {
        console.warn(`[TCE-TO] Falha ao extrair processos:`, e);
        return [];
    }
}

/**
 * Busca despesas financeiras vinculadas a uma pessoa/empresa no TCE-TO.
 * Extensão do extrator que antes era apenas processual.
 */
export async function buscarDespesasTO(identificador: string, nomeParaBusca?: string) {
    console.log(`[TCE-TO] Iniciando busca de despesas para o alvo: ${identificador}`);
    
    const despesas: any[] = [];
    
    try {
        // Tentativa heurística baseada no portal e-Contas
        // Se a API não disponibilizar endpoints públicos de despesa, este será 
        // o ponto de captura após farejamento do tráfego do portal.
        const url = `${API_BASE}/fornecedores?cnpjCpf=${identificador}`;
        const res = await fetchWithTimeout(url, {
            timeout: TIMEOUT_TO,
            headers: { "Accept": "application/json" }
        });

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                data.forEach((d: any) => {
                    despesas.push({
                        label: `Despesa e-Contas - ${d.ano || 'N/I'}`,
                        valor: d.valor_pago || d.valor_empenho || 0,
                        objeto: d.historico || d.objeto || 'N/I',
                        codigo: d.numero_empenho || d.numero_contrato || 'N/I',
                        data: d.data_pagamento || d.data_empenho || 'N/I',
                        favorecido: d.credor || nomeParaBusca || identificador
                    });
                });
            }
        } else {
            console.warn(`[TCE-TO] Endpoint de despesas não disponível (Status: ${res.status}).`);
        }
    } catch (e) {
        console.warn(`[TCE-TO] Falha ao extrair despesas nativas:`, e);
    }

    return despesas;
}
