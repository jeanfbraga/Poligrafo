// lib/dou/queridodiario.ts
// Client para busca nos Diários Oficiais Municipais (Querido Diário)
// Portado do mcp-brasil v0.14.0 — data/diario_oficial/client.py

export interface DiarioOficialMunicipal {
    territory_id: string | null;
    territory_name: string | null;
    state_code: string | null;
    date: string | null;
    edition_number: string | null;
    is_extra_edition: boolean | null;
    url: string | null;
    txt_url: string | null;
    excerpts: string[] | null;
}

export interface ResultadoQueridoDiario {
    total_gazettes: number;
    gazettes: DiarioOficialMunicipal[];
}

export interface BuscarDiariosOptions {
    termo: string;
    territoryIds?: string[];
    since?: string;  // YYYY-MM-DD
    until?: string;  // YYYY-MM-DD
    size?: number;   // default: 10
    timeout?: number;
}

const QUERIDO_DIARIO_API = "https://api.queridodiario.ok.org.br";
const GAZETTES_URL = `${QUERIDO_DIARIO_API}/gazettes`;

export async function buscarDiariosMunicipais(options: BuscarDiariosOptions): Promise<ResultadoQueridoDiario> {
    const { termo, territoryIds, since, until, size = 10, timeout = 8000 } = options;

    const params = new URLSearchParams();
    // Usa aspas para forçar busca exata do nome
    params.set('querystring', `"${termo}"`);
    params.set('offset', '0');
    params.set('size', String(size));
    params.set('excerpt_size', '500');
    params.set('number_of_excerpts', '3');

    // Desativa tags HTML <b> nos excertos para facilitar leitura/regex
    params.set('pre_tags', '');
    params.set('post_tags', '');

    if (territoryIds && territoryIds.length > 0) {
        params.set('territory_ids', territoryIds.join(','));
    }

    if (since) params.set('since', since);
    if (until) params.set('until', until);

    const url = `${GAZETTES_URL}?${params.toString()}`;

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Poligrafo-Investigador/1.0'
            },
            signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
            console.warn(`[QUERIDO DIARIO] HTTP ${response.status} ao buscar "${termo}"`);
            return { total_gazettes: 0, gazettes: [] };
        }

        const data = await response.json();
        
        return {
            total_gazettes: data.total_gazettes || 0,
            gazettes: data.gazettes || []
        };
    } catch (e: any) {
        if (e.name === 'AbortError') {
            console.warn(`[QUERIDO DIARIO] Timeout (${timeout}ms) buscando "${termo}"`);
        } else {
            console.warn(`[QUERIDO DIARIO] Erro buscando "${termo}":`, e.message);
        }
        return { total_gazettes: 0, gazettes: [] };
    }
}
