import { NextResponse } from 'next/server';
import { normalizeString } from '../../app/api/investigar/tse';
import congressoIndex from '@/services/integrations/data/congresso-index.json';

export function parseInvestigarRequest(requestUrl: string) {
    const request = { url: requestUrl };
const {
  searchParams
} = new URL(request.url);
const originNome = searchParams.get('nome');
const originRef = searchParams.get('ref');
const cargoParam = searchParams.get('cargo') || 'FEDERAL';

// 🛡️ SECURITY: Sanitização estrita contra Prompt Injection e Poluição de Parâmetros
// Permite apenas alfanuméricos, espaços, hífens, dois pontos (padrão forceRef), porcentagem (URL encoding)
const nomeBruto = originNome ? originNome.replace(/[^a-zA-Z0-9\sÁ-ÿ:\-%\(\)_.,]/g, '') : null;
const refParam = originRef ? originRef.replace(/[^a-zA-Z0-9\sÁ-ÿ:\-%\(\)_.,]/g, '') : null;
if (!nomeBruto && !refParam) {
  return NextResponse.json({
    error: 'Parâmetro ?nome= ou ?ref= é obrigatório.'
  }, {
    status: 400
  });
}
let nomeParaBusca = (nomeBruto || '').toLowerCase().trim();

// Remove parênteses (ex: apelido de urna) para não sujar a busca do DOCIGP e Transferegov
nomeParaBusca = nomeParaBusca.replace(/\s*\(.*?\)\s*/g, ' ').trim();
let ufScope: string | null = null;

// Aceita ?uf= como parâmetro direto (enviado pelo seletor de alçada da UI)

const ufParam = searchParams.get('uf');
if (!ufScope && ufParam && /^[A-Z]{2}$/i.test(ufParam)) {
  ufScope = ufParam.toUpperCase();
}
const correcoesNomes: Record<string, {
  nomeCorreto: string;
  autoRef?: string;
}> = {
  'celso rusomanno': {
    nomeCorreto: 'celso russomanno'
  },
  'tarcisio meira': {
    nomeCorreto: 'tarcísio de freitas',
    autoRef: 'GOVERNADOR:SP:Tarcísio'
  },
  'tarcísio meira': {
    nomeCorreto: 'tarcísio de freitas',
    autoRef: 'GOVERNADOR:SP:Tarcísio'
  },
  'tarcisio de freitas': {
    nomeCorreto: 'tarcísio de freitas',
    autoRef: 'GOVERNADOR:SP:Tarcísio'
  },
  'tarcísio de freitas': {
    nomeCorreto: 'tarcísio de freitas',
    autoRef: 'GOVERNADOR:SP:Tarcísio'
  },
  'tarcisio': {
    nomeCorreto: 'tarcísio de freitas',
    autoRef: 'GOVERNADOR:SP:Tarcísio'
  },
  'marussa boldrim': {
    nomeCorreto: 'marussa boldrin',
    autoRef: 'FEDERAL:CAMARA:220572'
  },
  'morussa boldrin': {
    nomeCorreto: 'marussa boldrin',
    autoRef: 'FEDERAL:CAMARA:220572'
  },
  'morussa cassia': {
    nomeCorreto: 'marussa boldrin',
    autoRef: 'FEDERAL:CAMARA:220572'
  },
  'lula': {
    nomeCorreto: 'luiz inácio lula da silva',
    autoRef: 'PRESIDENTE:BR:Lula'
  },
  'luiz inacio lula da silva': {
    nomeCorreto: 'luiz inácio lula da silva',
    autoRef: 'PRESIDENTE:BR:Lula'
  },
  'luis inacio lula da silva': {
    nomeCorreto: 'luiz inácio lula da silva',
    autoRef: 'PRESIDENTE:BR:Lula'
  },
  'luís inácio lula da silva': {
    nomeCorreto: 'luiz inácio lula da silva',
    autoRef: 'PRESIDENTE:BR:Lula'
  },
  'luiz inácio lula da silva': {
    nomeCorreto: 'luiz inácio lula da silva',
    autoRef: 'PRESIDENTE:BR:Lula'
  },
  'bolsonaro': {
    nomeCorreto: 'jair messias bolsonaro',
    autoRef: 'PRESIDENTE:BR:Bolsonaro'
  },
  'jair messias bolsonaro': {
    nomeCorreto: 'jair messias bolsonaro',
    autoRef: 'PRESIDENTE:BR:Bolsonaro'
  }
};
let forceRef: string | null = refParam;
if (correcoesNomes[nomeParaBusca]) {
  if (correcoesNomes[nomeParaBusca].autoRef && !forceRef) {
    forceRef = correcoesNomes[nomeParaBusca].autoRef!;
  }
  nomeParaBusca = correcoesNomes[nomeParaBusca].nomeCorreto;
}

// BYPASS: Dicionário Estático do Congresso Autocomplete
// Previne que buscas exatas do mobile sobrecarreguem e recebam timeout da API frágil de buscas da Câmara.
if (!forceRef && (!cargoParam || cargoParam === 'FEDERAL')) {
  const exactMatchLocal = congressoIndex.find((p: any) => normalizeString(p.nome) === normalizeString(nomeParaBusca));
  if (exactMatchLocal) {
    if (exactMatchLocal.casa === 'GOVERNO_ESTADUAL') {
      forceRef = `GOVERNADOR:${exactMatchLocal.uf}:${exactMatchLocal.id}`;
    } else {
      forceRef = `FEDERAL:${exactMatchLocal.casa}:${exactMatchLocal.id}`;
    }
    console.log(`[BYPASS] Match local encontrado no JSON para ${nomeParaBusca}. Ref forçada: ${forceRef}`);
  }
}
console.log('[START] Investigação Polígrafo por:', nomeParaBusca, ufScope ? `(escopo: ${ufScope})` : '', forceRef ? `(ref: ${forceRef})` : '');

    return {
        nomeParaBusca,
        ufScope,
        cargoParam,
        ufParam,
        forceRef,
        refParam,
        correcoesNomes,
        nomeBruto
    };
}
