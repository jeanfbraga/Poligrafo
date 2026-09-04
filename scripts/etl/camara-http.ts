import { execFile } from 'node:child_process';
const USER_AGENT = 'Mozilla/5.0 Poligrafo/1.0';
let preferirCurlAte = 0;

class HttpError extends Error {
    constructor(readonly status: number) {
        super(`HTTP ${status}`);
    }
}

function descreverErro(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const cause = error.cause as { code?: string; message?: string } | undefined;
    return [error.message, cause?.code || cause?.message].filter(Boolean).join(' - ');
}

function validarResposta(json: any): any {
    if (!json || typeof json !== 'object' || json.dados == null) {
        throw new Error('Resposta da Câmara sem o campo dados');
    }
    return json;
}

async function buscarComFetch(url: string): Promise<any> {
    // O timeout do ETL cobre também o corpo JSON, não apenas os cabeçalhos.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
        const response = await fetch(url, {
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
            signal: controller.signal,
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new HttpError(response.status);
        }
        return validarResposta(await response.json());
    } finally {
        clearTimeout(timer);
    }
}

async function buscarComCurl(url: string): Promise<any> {
    // Argumentos separados, sem shell. Mantém HTTPS e a validação de certificados.
    const stdout = await new Promise<string>((resolve, reject) => execFile(process.platform === 'win32' ? 'curl.exe' : 'curl', [
        '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https',
        '--connect-timeout', '30', '--max-time', '60',
        '--header', 'Accept: application/json', '--user-agent', USER_AGENT,
        '--write-out', '\n%{http_code}', url,
    ], { encoding: 'utf8', timeout: 65_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (error, output) => {
        if (error) reject(error);
        else resolve(output);
    }));
    const statusIndex = stdout.lastIndexOf('\n');
    const status = Number(stdout.slice(statusIndex + 1));
    if (status < 200 || status >= 300 || !Number.isFinite(status)) throw new HttpError(status);
    return validarResposta(JSON.parse(stdout.slice(0, statusIndex)));
}

function erroPermanente(error: unknown): boolean {
    return error instanceof HttpError && error.status >= 400 && error.status < 500
        && error.status !== 408 && error.status !== 429;
}

/** Retorna null apenas para 404. Indisponibilidade nunca equivale a uma lista vazia. */
export async function fetchCamaraJson(url: string, tentativas = 3, esperaMs = 5000): Promise<any> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'dadosabertos.camara.leg.br') {
        throw new Error('O cliente Câmara aceita apenas o endpoint HTTPS oficial de dados abertos');
    }
    let ultimoErro: unknown;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
        const tentarFetch = Date.now() >= preferirCurlAte;
        if (tentarFetch) {
            try {
                return await buscarComFetch(url);
            } catch (error) {
                if (error instanceof HttpError && error.status === 404) return null;
                if (erroPermanente(error)) throw error;
                console.warn(`[API Câmara] ${descreverErro(error)} em ${url}. Tentando curl (${tentativa}/${tentativas}).`);
            }
        }
        try {
            const json = await buscarComCurl(url);
            // Evita pagar o mesmo timeout nativo para cada um dos 513 deputados.
            // Após cinco minutos, testa novamente o transporte nativo.
            if (tentarFetch) preferirCurlAte = Date.now() + 5 * 60_000;
            return json;
        } catch (error) {
            if (error instanceof HttpError && error.status === 404) return null;
            if (erroPermanente(error)) throw error;
            ultimoErro = error;
            preferirCurlAte = 0;
            console.warn(`[API Câmara] curl falhou em ${url}: ${descreverErro(error)}`);
        }
        if (tentativa < tentativas) {
            await new Promise(resolve => setTimeout(resolve, esperaMs * 2 ** (tentativa - 1)));
        }
    }
    throw new Error(`Câmara indisponível após ${tentativas} tentativas: ${url}. ${descreverErro(ultimoErro)}`);
}

export function exigirDeputados(resposta: any): any[] {
    if (!Array.isArray(resposta?.dados) || resposta.dados.length === 0) {
        throw new Error('Lista de deputados indisponível ou vazia; sincronização interrompida antes das gravações.');
    }
    return resposta.dados;
}
