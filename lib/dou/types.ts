// lib/dou/types.ts
// Tipos para integração com o Diário Oficial da União (Imprensa Nacional)
// Portado do mcp-brasil v0.14.0 — data/diario_oficial/schemas.py

export interface PublicacaoDOU {
  titulo: string | null;
  resumo: string | null;
  urlTitulo: string | null;
  orgao: string | null;
  tipoPublicacao: string | null;
  secao: string | null;
  dataPublicacao: string | null;
  edicao: string | null;
  pagina: string | null;
  conteudo: string | null;
  assinante: string | null;
  cargoAssinante: string | null;
}

export interface ResultadoDOU {
  total: number;
  publicacoes: PublicacaoDOU[];
}

// Seções do DOU
export const DOU_SECTIONS: Record<string, string> = {
  'SECAO_1': 'do1',   // Leis, decretos, medidas provisórias
  'SECAO_2': 'do2',   // Atos de pessoal (nomeações, exonerações)
  'SECAO_3': 'do3',   // Contratos, licitações, avisos
  'EDICAO_EXTRA': 'doe',
  'EDICAO_SUPLEMENTAR': 'dos',
  'TODOS': '',
};

// Períodos de busca
export const DOU_PERIODS: Record<string, string> = {
  'DIA': 'dia',
  'SEMANA': 'semana',
  'MES': 'mes',
  'ANO': 'ano',
  'PERSONALIZADO': 'personalizado',
};

// Tipos de publicação relevantes para investigação
export const DOU_TIPOS_INVESTIGACAO = [
  'Portaria',
  'Nomeação',
  'Exoneração',
  'Extrato de Contrato',
  'Extrato de Convênio',
  'Aviso de Licitação',
  'Despacho',
  'Decreto',
] as const;
