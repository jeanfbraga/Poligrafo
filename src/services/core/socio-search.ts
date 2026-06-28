// lib/services/socio-search.ts

function normalizeStringLocal(str: string): string {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

export async function buscarEmpresasDoSocio(nomeSocio: string) {
    const nomeNorm = normalizeStringLocal(nomeSocio);
    console.log(`[OSINT QSA] Buscando ${nomeNorm} usando mecanismo gratuito Dorking (DuckDuckGo + BrasilAPI)...`);
    
    try {
        const query = encodeURIComponent(`"quadro de sócios" OR "qsa" "${nomeNorm}" cnpj`);
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                // Add Accept headers to seem like a real browser
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) return [];
        const html = await response.text();
        
        const regexCnpj = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
        const matches = html.match(regexCnpj) || [];
        const cnpjsEncontrados = [...new Set(matches.map(c => c.replace(/\D/g, '')))];

        if (cnpjsEncontrados.length === 0) {
            console.log(`[OSINT QSA] Nenhum CNPJ extraído na raspagem para o sócio.`);
            return [];
        }

        console.log(`[OSINT QSA] Extraídos ${cnpjsEncontrados.length} CNPJs. Validando QSA na BrasilAPI em paralelo...`);
        const empresasValidadas: any[] = [];
        
        // Execute parallel validation up to 6 companies to rapidly drop execution time and prevent Vercel Timeouts
        const validacoes = cnpjsEncontrados.slice(0, 6).map(async (cnpj) => {
            try {
                const resBrasil = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
                    signal: AbortSignal.timeout(6000)
                });

                if (resBrasil.ok) {
                    const emp = await resBrasil.json();
                    const isSocio = emp.qsa?.some((s: any) => normalizeStringLocal(s.nome_socio).includes(nomeNorm));

                    if (isSocio) {
                        return {
                            cnpj: emp.cnpj,
                            razao_social: emp.razao_social || emp.nome_fantasia || 'RAZÃO SOCIAL INDISPONÍVEL',
                            situacao: emp.descricao_situacao_cadastral || 'Ativa',
                            cnae: emp.cnae_fiscal_descricao || 'Não Informado'
                        };
                    }
                }
            } catch (e) {
                // Silently skip timeouts or individual blockades from BrasilAPI
            }
            return null;
        });

        const resultados = await Promise.all(validacoes);
        for (const res of resultados) {
            if (res) empresasValidadas.push(res);
        }

        return empresasValidadas;
    } catch (e) {
        console.error("[OSINT QSA] Falha crítica na busca open-source:", e);
        return [];
    }
}
