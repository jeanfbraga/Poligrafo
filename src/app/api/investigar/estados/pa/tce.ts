import { fetchWithTimeout } from '../../tse';

// ==========================================
// Extrator NATIVO: TCE Pará (PA)
// API Dados Abertos - Diário Oficial
// ==========================================

const API_DIARIO = "https://sistemas.tcepa.tc.br/dadosabertos/api/v1/diario_oficial";
const TIMEOUT_PA = 15000;

export async function buscarAcordaosTcePA(nomeBuscado: string): Promise<any[]> {
    const termo = nomeBuscado.trim();
    if (!termo) return [];

    console.log(`[TCE-PA] Iniciando busca no Diário Oficial para: ${termo}`);
    const processosEncontrados: any[] = [];
    
    // Tenta usar o termo na busca. Caso a API ignore, filtraremos no client-side.
    const url = `${API_DIARIO}?q=${encodeURIComponent(termo)}`;

    try {
        const res = await fetchWithTimeout(url, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "PoligrafoBot/1.0"
            },
            timeout: TIMEOUT_PA
        });

        if (!res.ok) {
            console.warn(`[TCE-PA] Falha ao acessar Diário Oficial. Status: ${res.status}`);
            return [];
        }

        const raw = await res.json();
        const data = Array.isArray(raw) ? raw : (raw.data || raw.itens || Object.values(raw).find(v => Array.isArray(v)) || []);

        data.forEach((ato: any) => {
            // Filtro client-side de segurança para garantir que o termo aparece no ato
            const textoCompleto = JSON.stringify(ato).toLowerCase();
            if (textoCompleto.includes(termo.toLowerCase())) {
                const num = ato.numeroPublicacao || ato.id || "S/N";
                const tipo = ato.tipoAto || ato.tipo_ato || "Ato Oficial";
                const ementa = ato.ementa || ato.assunto || ato.resumo || "Documento sem ementa detalhada.";
                const link = ato.url || ato.link_documento || API_DIARIO;
                const dataAto = ato.dataPublicacao || ato.data_publicacao || "Recente";

                processosEncontrados.push({
                    titulo: `${tipo} Nº ${num}`,
                    resumo: ementa.length > 200 ? ementa.substring(0, 197) + "..." : ementa,
                    url: link,
                    dataPublicacao: dataAto,
                    ementa: ementa
                });
            }
        });

        console.log(`[TCE-PA] Localizados ${processosEncontrados.length} ato(s) no Diário Oficial.`);
    } catch (e) {
        console.warn(`[TCE-PA] Falha ao extrair Diário Oficial:`, e);
    }

    return processosEncontrados;
}

/**
 * Motor de busca de Despesas para o Estado do Pará.
 * Usa a API do Diário Oficial buscando pelas categorias CONTRATOS e LICITACOES,
 * filtrando pelo município e pelo identificador (nome ou CPF do fornecedor/político).
 */
export async function buscarDespesasPA(identificador: string, municipioUri: string, nomeParaBusca?: string) {
    const termoAvo = String(identificador).toLowerCase().trim();
    const termoB = (nomeParaBusca || "").toLowerCase().trim();
    const isCpf = /^\d{11}$/.test(termoAvo);
    const mioloCpf = isCpf ? termoAvo.substring(3, 9) : null;

    // Município é fundamental para a busca. Caso ausente, usamos 'estado do para'
    const queryBusca = municipioUri ? municipioUri.replace(/-/g, ' ') : "estado do para";
    console.log(`[TCE-PA] Buscando Contratos e Licitações para: ${queryBusca}`);

    const despesasEncontradas: any[] = [];
    
    // Busca em duas frentes: CONTRATOS e LICITACOES
    const frentes = ["CONTRATOS", "LICITACOES"];
    const params = `q=${encodeURIComponent(queryBusca)}&tamanho=50`;

    for (const tipo of frentes) {
        const url = `${API_DIARIO}?${params}&tipo_ato=${tipo}`;
        
        try {
            const res = await fetchWithTimeout(url, {
                headers: { "Accept": "application/json", "User-Agent": "PoligrafoBot/1.0" },
                timeout: TIMEOUT_PA
            });

            if (!res.ok) continue;

            const raw = await res.json();
            const data = Array.isArray(raw) ? raw : (raw.data || raw.itens || []);

            data.forEach((ato: any) => {
                const ementaStr = String(ato.ementa || ato.assunto || ato.resumo || "").toLowerCase();
                const textoCompleto = JSON.stringify(ato).toLowerCase();
                
                // Checagem de segurança dupla: o identificador (nome ou miolo CPF) DEVE estar no texto do ato
                let ehRelevante = false;
                if (isCpf && mioloCpf) {
                    if (textoCompleto.includes(mioloCpf)) ehRelevante = true;
                } else if (termoAvo.length > 5) {
                    if (textoCompleto.includes(termoAvo)) ehRelevante = true;
                }

                if (!ehRelevante && termoB.length > 5) {
                    if (textoCompleto.includes(termoB)) ehRelevante = true;
                }

                if (ehRelevante) {
                    const dataAto = ato.dataPublicacao || ato.data_publicacao || "Recente";
                    const titulo = ato.tipoAto || ato.tipo_ato || tipo;
                    const num = ato.numeroPublicacao || ato.id || "S/N";
                    
                    // Tentativa rudimentar de extrair o valor financeiro do contrato
                    let valorExtraido = 0;
                    const matchMoeda = ementaStr.match(/(?:r\$|reais|valor)\s*(?:de\s*)?([\d\.,]+)/i);
                    if (matchMoeda && matchMoeda[1]) {
                        const strNum = matchMoeda[1].replace(/\./g, '').replace(',', '.');
                        const valor = parseFloat(strNum);
                        if (!isNaN(valor)) valorExtraido = valor;
                    }

                    despesasEncontradas.push({
                        cnpjCpfFornecedor: "S/N", // Forçado pois D.O raramente tem CNPJ limpo
                        nomeFornecedor: `Extrato D.O. ${titulo} Nº ${num}`,
                        tipoDespesa: (ato.ementa || ato.assunto || "Documento sem resumo.").substring(0, 300) + "...",
                        valorDocumento: valorExtraido,
                        dataDocumento: dataAto.includes('T') ? dataAto.split('T')[0] : dataAto,
                        urlDocumento: ato.url || ato.link_documento || API_DIARIO
                    });
                }
            });

        } catch (e) {
            console.warn(`[TCE-PA] Falha ao extrair despesas do tipo ${tipo}:`, e);
        }
    }

    // Ordena pelo valor para tentar exibir os contratos mais polpudos se houver muitos
    return despesasEncontradas.sort((a, b) => b.valorDocumento - a.valorDocumento).slice(0, 50);
}
