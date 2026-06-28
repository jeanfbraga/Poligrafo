// lib/transferegov/client.ts
// Client para o TransfereGov API (PostgREST) — Emendas PIX / Transferências Especiais
// Portado do mcp-brasil v0.14.0 — data/transferegov/client.py

import type { TransferenciaEspecial, ResumoEmendasPIX } from './types';

// ==========================================
// Constantes
// ==========================================
const TRANSFEREGOV_API_BASE = 'https://api.transferegov.gestao.gov.br';
const PLANO_ACAO_URL = `${TRANSFEREGOV_API_BASE}/transferenciasespeciais/plano_acao_especial`;
const DEFAULT_PAGE_SIZE = 15;
const DEFAULT_TIMEOUT = 12000;

// ==========================================
// Helpers
// ==========================================

/** Parseia um item raw da API PostgREST para nosso tipo */
export function parseTransferencia(raw: Record<string, any>): TransferenciaEspecial {
  return {
    idPlanoAcao: raw.id_plano_acao ?? null,
    codigoPlanoAcao: raw.codigo_plano_acao ?? null,
    ano: raw.ano_plano_acao ?? null,
    situacao: raw.situacao_plano_acao ?? null,
    nomeParlamentar: raw.nome_parlamentar_emenda_plano_acao ?? null,
    numeroEmenda: raw.numero_emenda_parlamentar_plano_acao ?? null,
    anoEmenda: raw.ano_emenda_parlamentar_plano_acao ?? null,
    valorCusteio: raw.valor_custeio_plano_acao ?? null,
    valorInvestimento: raw.valor_investimento_plano_acao ?? null,
    cnpjBeneficiario: raw.cnpj_beneficiario_plano_acao ?? null,
    nomeBeneficiario: raw.nome_beneficiario_plano_acao ?? null,
    ufBeneficiario: raw.uf_beneficiario_plano_acao ?? null,
    areaPoliticaPublica: raw.codigo_descricao_areas_politicas_publicas_plano_acao ?? null,
  };
}

/** Constrói query params para PostgREST (column=operator.value) */
function buildQuery(
  filters: Record<string, string>,
  limit = DEFAULT_PAGE_SIZE,
  offset = 0,
  order?: string
): URLSearchParams {
  const params = new URLSearchParams(filters);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (order) params.set('order', order);
  return params;
}

/** Executa GET na API PostgREST com filtros e retry */
async function fetchTransferencias(
  filters: Record<string, string>,
  pagina = 1,
  timeout = DEFAULT_TIMEOUT,
  retries = 2
): Promise<TransferenciaEspecial[]> {
  const offset = (pagina - 1) * DEFAULT_PAGE_SIZE;
  const params = buildQuery(filters, DEFAULT_PAGE_SIZE, offset, 'ano_plano_acao.desc');
  const url = `${PLANO_ACAO_URL}?${params.toString()}`;

  let attempt = 0;
  while (attempt <= retries) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      clearTimeout(timer);

      if (!response || !response.ok) {
        if (response && response.status >= 500 && attempt < retries) {
          console.warn(`[TransfereGov] HTTP ${response.status} para ${url}. Tentativa ${attempt + 1}/${retries + 1}...`);
          attempt++;
          await new Promise(r => setTimeout(r, 1500 * Math.pow(2, attempt))); // Exponential backoff
          continue;
        }
        throw new Error(response ? `HTTP ${response.status}: ${response.statusText}` : 'fetch retornou undefined');
      }

      const data = await response.json();
      if (!Array.isArray(data)) return [];

      return data.map(parseTransferencia);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.warn(`[TransfereGov] Timeout (${timeout}ms) na tentativa ${attempt + 1}`);
      } else {
        console.warn(`[TransfereGov] Erro na tentativa ${attempt + 1}:`, e.message);
      }
      
      if (attempt < retries) {
        attempt++;
        await new Promise(r => setTimeout(r, 1500 * Math.pow(2, attempt)));
        continue;
      }
      return [];
    }
  }
  return [];
}

// ==========================================
// API Pública
// ==========================================

/**
 * Busca emendas PIX (transferências especiais) por nome do parlamentar.
 * Usa filtro ilike (case-insensitive, partial match) do PostgREST.
 */
export async function buscarEmendasPorAutor(
  nomeAutor: string,
  ano?: number,
  pagina = 1
): Promise<TransferenciaEspecial[]> {
  const filters: Record<string, string> = {
    nome_parlamentar_emenda_plano_acao: `ilike.*${nomeAutor}*`,
  };
  if (ano) filters.ano_plano_acao = `eq.${ano}`;
  return fetchTransferencias(filters, pagina);
}

/**
 * Busca emendas PIX destinadas a um município específico.
 */
export async function buscarEmendasPorMunicipio(
  nomeMunicipio: string,
  ano?: number,
  pagina = 1
): Promise<TransferenciaEspecial[]> {
  const filters: Record<string, string> = {
    nome_beneficiario_plano_acao: `ilike.*${nomeMunicipio}*`,
  };
  if (ano) filters.ano_plano_acao = `eq.${ano}`;
  return fetchTransferencias(filters, pagina);
}

/**
 * Busca emendas PIX por CNPJ do beneficiário.
 * Útil para cruzar com empresas de sócios do político.
 */
export async function buscarEmendasPorCNPJ(
  cnpj: string,
  pagina = 1
): Promise<TransferenciaEspecial[]> {
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  return fetchTransferencias(
    { cnpj_beneficiario_plano_acao: `eq.${cnpjLimpo}` },
    pagina
  );
}

/**
 * Busca emendas PIX de um ano para uma UF específica.
 */
export async function buscarEmendasPorUF(
  uf: string,
  ano?: number,
  pagina = 1
): Promise<TransferenciaEspecial[]> {
  const filters: Record<string, string> = {
    uf_beneficiario_plano_acao: `eq.${uf.toUpperCase()}`,
  };
  if (ano) filters.ano_plano_acao = `eq.${ano}`;
  return fetchTransferencias(filters, pagina);
}

/**
 * Busca detalhe de uma emenda PIX específica pelo ID.
 */
export async function detalheEmenda(idPlanoAcao: number): Promise<TransferenciaEspecial | null> {
  const params = buildQuery({ id_plano_acao: `eq.${idPlanoAcao}` }, 1, 0);
  const url = `${PLANO_ACAO_URL}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return parseTransferencia(data[0]);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Gera um resumo totalizado das emendas PIX de um parlamentar.
 * Busca todas as páginas disponíveis (até 5) e agrega os dados.
 */
export async function gerarResumoEmendasPIX(nomeAutor: string): Promise<ResumoEmendasPIX> {
  const todasEmendas: TransferenciaEspecial[] = [];
  const MAX_PAGINAS = 5;

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const batch = await buscarEmendasPorAutor(nomeAutor, undefined, pagina);
    if (batch.length === 0) break;
    todasEmendas.push(...batch);
    if (batch.length < DEFAULT_PAGE_SIZE) break;
  }

  const municipiosSet = new Set<string>();
  const areasSet = new Set<string>();
  const ufCount: Record<string, number> = {};

  let valorTotalCusteio = 0;
  let valorTotalInvestimento = 0;

  for (const e of todasEmendas) {
    if (e.nomeBeneficiario) municipiosSet.add(e.nomeBeneficiario);
    if (e.areaPoliticaPublica) areasSet.add(e.areaPoliticaPublica);
    if (e.ufBeneficiario) {
      ufCount[e.ufBeneficiario] = (ufCount[e.ufBeneficiario] || 0) + 1;
    }
    valorTotalCusteio += e.valorCusteio || 0;
    valorTotalInvestimento += e.valorInvestimento || 0;
  }

  const ufsMaisAtendidas = Object.entries(ufCount)
    .map(([uf, quantidade]) => ({ uf, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 5);

  return {
    totalEmendas: todasEmendas.length,
    valorTotalCusteio,
    valorTotalInvestimento,
    valorTotalGeral: valorTotalCusteio + valorTotalInvestimento,
    municipiosAtendidos: [...municipiosSet].slice(0, 20),
    areasPoliticas: [...areasSet],
    ufsMaisAtendidas,
  };
}
