export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
import { parse } from 'csv-parse/sync';
import { buscarMunicipalMestre, buscarDespesasMunicipalMestre } from './municipios/router';
import { buscarAcordaosTcePA } from './estados/pa/tce';
import { buscarProcessosTceTo } from './estados/to/tce';
import { buscarDeputadoEstadualRJ, buscarDespesasDeputadoEstadualRJ, buscarPerfilDOCIGP } from './estados/rj/alerj';
import { buscarDeputadoEstadualSP, buscarDespesasDeputadoEstadualSP } from './estados/sp/alesp';
import { checkNepotismoCMRJ } from '@/services/integrations/cmrj/nepotismo-client';
import { buscarServidoresCMRJ } from './estados/rj/camara-rj-client';
import { normalizeString, fetchWithTimeout, buscarCpfNoTSE, buscarDoadoresTSE } from './tse';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase-admin';

import { buscarPolitico, buscarSenador, buscarProjetosLeiCamara } from './scrapers/legislativo';
import { investigarPolitico } from './scrapers/osint-fiscal';
import { buscarProcessosDataJud } from './scrapers/judiciario';
import { buscarReceitasFederais, buscarCartaoCorporativo } from './scrapers/osint-fiscal';
import { expandirMalhaSocietaria, investigarFornecedorNivelHard } from './scrapers/osint-societario';
import { buscarContratosPNCP } from './scrapers/osint-contratos';

import { analisarLoteComInteligencia, analisarEmendasComInteligencia, analisarMalhaOsintComInteligencia } from './ai_helpers';
import congressoIndex from '@/services/integrations/data/congresso-index.json';
import { buscarNomeacoesDOU } from '@/services/integrations/dou/client';
import { buscarDiariosMunicipais } from '@/services/integrations/dou/queridodiario';
import { buscarEmendasPorAutor as buscarTransfereGovPorAutor, buscarEmendasPorMunicipio as buscarTransfereGovPorMunicipio, buscarEmendasPorCNPJ, gerarResumoEmendasPIX } from '@/services/integrations/transferegov/client';
import { buscarDespesasCamara, buscarDespesasSenado, buscarEmendas } from './etl_extractors';
import { listarAtividadesAuditoria } from '@/services/integrations/denasus/client';
import { buscarOperacoesBNDES } from '@/services/integrations/bndes/client';
import { buscarEnteSiconfi, consultarIndicadoresLRF } from '@/services/integrations/siconfi/client';
import { buscarInfracoesIbama } from '@/services/integrations/ibama/client';
import { buscarInabilitadosTCU, buscarCadirregTCU, buscarCertidaoTCU } from '@/services/integrations/tcu/client';
import { consultarPNAE, consultarFUNDEB, consultarPNATE } from '@/services/integrations/fnde/client';
import { buscarAeronavesProprietario } from '@/services/integrations/anac/client';
import { transparenciaLimiter } from '@/services/core/rate-limiter';
import { buscarImoveisMunicipioSupabase } from '@/services/integrations/spu/client';
// ==========================================
// Tipos e Interfaces
// ==========================================

interface ParlamentarBasico {
  id: number | string;
  uri: string;
  nome: string;
  uf: string;
  idLegislatura: number;
  casa: 'CAMARA' | 'SENADO' | 'ALERJ' | 'ALESP' | 'GOVERNO_ESTADUAL' | 'PREFEITURA' | 'PRESIDENCIA_DA_REPUBLICA' | `CAMARA_MUNICIPAL_${string}`;
  afastamento?: {
    motivo: string;
    suplente: string | null;
  };
  urlFoto?: string;
}
interface DetalhesDeputado {
  cpf: string;
  nomeCivil: string;
  sexo: string;
  dataNascimento: string;
}
interface GraphNode {
  id: string;
  type: "PESSOA" | "DESPESA" | "CONTRATO" | "EMENDA" | "DIARIO_OFICIAL_NODE";
  data: {
    label: string;
    [key: string]: any;
  };
  edge?: any;
}

// Utilitários movidos para tse.ts e agora importados.

// ==========================================
// Integracao Gemini API (Motor Heurístico)
// ==========================================
// ==========================================
// Integracao Gemini API (Motor Heurístico) movida para ai_helpers.ts
// ==========================================

// ==========================================
// NOVOS MÓDULOS OSINT DE CONTEXTO GLOBAL
// ==========================================

// ==========================================
// Funções ETL Públicas
// ==========================================

// NOVA FUNÇÃO: Tenta encontrar o político no Senado Federal

// ==========================================
// Funções de Listagem (Desambiguação)
// ==========================================

async function buscarDetalhesPolitico(id: number): Promise<DetalhesDeputado | null> {
  const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Erro na API (Detalhes): status ${response.status}`);
  const json = await response.json();
  const dados = json.dados;
  if (!dados) return null;
  return {
    cpf: dados.cpf,
    nomeCivil: dados.nomeCivil,
    sexo: dados.sexo,
    dataNascimento: dados.dataNascimento
  };
}

// ==========================================
// Integrações OSINT Específicas
// ==========================================

// NOVA FUNÇÃO: Investiga a Pessoa Física do Político
// NOVA FUNÇÃO: Busca Processos Judiciais no DataJud (CNJ)

// NOVA FUNÇÃO: Investiga a Pessoa Física do Político

// NOVA FUNÇÃO: Busca convênios milionários no Transferegov
async function buscarConveniosTransferegov(cnpjLimpo: string) {
  try {
    const url = `https://api.transferegov.gestao.gov.br/convenios?cnpj_convenente=${cnpjLimpo}`;
    const res = await fetchWithTimeout(url, {
      timeout: 12000
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const valorTotal = data.reduce((acc, curr) => acc + (Number(curr.valor_global) || 0), 0);
      return {
        quantidade: data.length,
        valorTotal
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// NOVA FUNÇÃO: Bate na base de Aeronaves caso haja um prefixo suspeito
async function verificarAeronaveAnac(textoBusca: string) {
  // Regex para extrair prefixos de aeronaves brasileiras (ex: PR-ABC, PP-XYZ, PT-123)
  const regexPrefixo = /\b(PR|PP|PT|PS)[-\s]?([A-Z]{3}|[0-9]{3})\b/gi;
  const match = regexPrefixo.exec(textoBusca);
  if (!match) return null;
  const prefixo = `${match[1]}-${match[2]}`.toUpperCase();
  try {
    // Usando API da comunidade/RAB para consultar o prefixo
    const url = `https://rab.api.aero/v1/aeronaves/${prefixo}`;
    const res = await fetchWithTimeout(url, {
      timeout: 3500
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// A função buscarAeronavesProprietario foi movida para lib/anac/client.ts

// Funções do TSE removidas (buscarDoadoresTSE movido para ai_helpers.ts)

// A função buscarDoadoresTSE foi movida para tse.ts e agora é importada.

// OSINT Profundo em Fornecedores de Risco ALTO

// ==========================================
// RASTREIO DOWNSTREAM (CGU, Compras.gov, BrasilAPI)
// ==========================================

async function buscarViagensFAB(cpfLimpo: string, pessoaId: string, sendEvent: any, casaPolitico?: string) {
  if (!cpfLimpo || cpfLimpo === "00000000000") return;
  const apiKey = process.env.TRANSPARENCIA_API_KEY || '';
  if (!apiKey) return;
  try {
    const url = `https://api.portaldatransparencia.gov.br/api-de-dados/viagens?cpfViajante=${cpfLimpo}&pagina=1`;
    let data: any[] = [];
    if (cpfLimpo.length === 11) {
      const res = await fetchWithTimeout(url, {
        headers: {
          'chave-api-dados': apiKey
        },
        timeout: 6000
      });
      if (res.ok) {
        data = await res.json();
      }
    }
    if (Array.isArray(data) && data.length > 0) {
      sendEvent('STATUS', {
        msg: `[VIAGENS] Rastreando diárias governamentais e voos da Força Aérea Brasileira (FAB).`
      });
      data.slice(0, 5).forEach((item: any, idx: number) => {
        const isInternacional = item.tipoViagem?.descricao === 'Internacional';
        const temVoo = item.trechos?.some((t: any) => t.trechoId && t.origem);
        sendEvent('NODE_NOVO', {
          id: `viagem-${cpfLimpo}-${idx}-${Date.now()}`,
          type: 'DESPESA',
          _origemId: pessoaId,
          data: {
            label: `Viagem Oficial: ${item.destinos?.[0]?.localidadeDestino || 'N/I'}`,
            valor: item.valorTotalViagem,
            tipo: item.tipoViagem?.descricao || 'Viagem a Serviço',
            documento: cpfLimpo,
            dataDocumento: `${item.dataInicio} a ${item.dataFim}`,
            motivo_ia: item.motivo || 'Motivo de viagem financiada pelo Estado',
            score_letalidade: item.valorTotalViagem > 25000 ? 75 : 45
          }
        });
      });
    }
  } catch (e) {
    console.error("[OSINT Viagens Error]", e);
  }
}

// ==========================================
// ROTA GET (Server-Sent Events)
// ==========================================
export async function GET(request: Request) {
  const {
    parseInvestigarRequest
  } = await import('@/services/core/request-parser');
  const parsed = parseInvestigarRequest(request.url);
  if (parsed instanceof Response) return parsed; // Handles NextResponse.json early return
  const {
    nomeParaBusca,
    ufScope,
    cargoParam,
    ufParam,
    forceRef,
    refParam,
    correcoesNomes,
    nomeBruto
  } = parsed as any;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isStreamClosed = false;
      const safeClose = () => {
        if (!isStreamClosed) {
          isStreamClosed = true;
          try {
            controller.close();
          } catch (e) {}
        }
      };
      const sendEvent = (tipo: string, payload: any) => {
        if (isStreamClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            tipo,
            payload
          })}\n\n`));
        } catch (e) {}
      };
      try {
        const {
          executarInvestigacaoPrincipal
        } = await import('@/services/core/investigador-principal');
        await executarInvestigacaoPrincipal({
          nomeParaBusca,
          ufScope,
          cargoParam,
          ufParam,
          forceRef,
          refParam,
          correcoesNomes,
          nomeBruto,
          sendEvent,
          safeClose,
          isDev: process.env.NODE_ENV === 'development',
          dbSearchId: null,
          // Ajuste dbSearchId se necessário
          encoder,
          controller,
          reqUrl: request.url
        });
      } catch (e) {
        console.error("Erro fatal:", e);
      }
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}