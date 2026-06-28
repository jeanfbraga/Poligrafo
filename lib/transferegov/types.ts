// lib/transferegov/types.ts
// Tipos para integração com o TransfereGov (Emendas PIX / Plano de Ação Especial)
// Portado do mcp-brasil v0.14.0 — data/transferegov/schemas.py

export interface TransferenciaEspecial {
  idPlanoAcao: number | null;
  codigoPlanoAcao: string | null;
  ano: number | null;
  situacao: string | null;
  nomeParlamentar: string | null;
  numeroEmenda: string | null;
  anoEmenda: string | null;
  valorCusteio: number | null;
  valorInvestimento: number | null;
  cnpjBeneficiario: string | null;
  nomeBeneficiario: string | null;
  ufBeneficiario: string | null;
  areaPoliticaPublica: string | null;
}

/** Resumo totalizado das emendas PIX de um parlamentar */
export interface ResumoEmendasPIX {
  totalEmendas: number;
  valorTotalCusteio: number;
  valorTotalInvestimento: number;
  valorTotalGeral: number;
  municipiosAtendidos: string[];
  areasPoliticas: string[];
  ufsMaisAtendidas: { uf: string; quantidade: number }[];
}
