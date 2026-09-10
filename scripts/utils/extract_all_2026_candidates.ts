import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Parse .env.local
const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
const env: Record<string, string> = {};
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Credenciais do Supabase não encontradas no .env.local ou variáveis de ambiente');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ESTADOS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'ES', 'GO', 'MA',
  'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'
];

const TODAS_UFS = [...ESTADOS, 'DF'];

// Todos os cargos das Eleições Gerais de 2026:
// 1 = Presidente (UF: BR)
// 3 = Governador (27 UFs)
// 5 = Senador (27 UFs)
// 6 = Deputado Federal (27 UFs)
// 7 = Deputado Estadual (26 Estados)
// 8 = Deputado Distrital (DF)
const CARGOS = [
  { cod: 1, nome: 'Presidente', ufs: ['BR'] },
  { cod: 3, nome: 'Governador', ufs: TODAS_UFS },
  { cod: 5, nome: 'Senador', ufs: TODAS_UFS },
  { cod: 6, nome: 'Deputado Federal', ufs: TODAS_UFS },
  { cod: 7, nome: 'Deputado Estadual', ufs: ESTADOS },
  { cod: 8, nome: 'Deputado Distrital', ufs: ['DF'] }
];

interface CandidatoTse {
  id: number;
  nomeUrna: string;
  nomeCompleto: string;
  numero: number;
  partido: string;
  cargo: string;
  uf: string;
  municipio: string;
  situacao: string;
  totalizacao: string;
  reeleicao: boolean;
}

async function fetchCandidatosCargoUf(ano: string, idEleicao: string, uf: string, codCargo: number): Promise<any[]> {
  const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${ano}/${uf}/${idEleicao}/${codCargo}/candidatos`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.candidatos || [];
  } catch (e) {
    return [];
  }
}

function normalizeName(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function runConcurrent<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 6): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

interface TaskTse {
  cargoNome: string;
  cargoCod: number;
  uf: string;
}

function mapearMandatarioBanco(m: any) {
  const pol = m.politicos;
  const org = m.orgaos_publicos;
  if (!pol) return null;

  const nomeUrna = pol.nome_urna || pol.nome_civil;
  const nomeCivil = pol.nome_civil;
  const info = {
    nomeUrna,
    nomeCivil,
    partidoAtual: m.partido,
    cargoAtual: m.cargo,
    uf: org?.uf || pol.uf_naturalidade || 'BR',
    municipio: org?.municipio || 'Brasília',
    cpf: pol.cpf || 'N/D'
  };

  return {
    keyUrna: normalizeName(nomeUrna),
    keyCivil: normalizeName(nomeCivil),
    info
  };
}

async function carregarPoliticosBanco(): Promise<Map<string, any>> {
  console.log('📦 Carregando mandatários cadastrados no Supabase...');
  const { data: dbMandatos, error: dbErr } = await supabase
    .from('mandatos')
    .select(`
      id,
      cargo,
      partido,
      ano_inicio,
      ano_fim,
      orgaos_publicos (nome, sigla, uf, municipio),
      politicos (id, nome_civil, nome_urna, uf_naturalidade, cpf)
    `)
    .or('ano_inicio.eq.2026,ano_fim.eq.2026,ano_fim.gte.2026');

  if (dbErr) {
    console.error('Erro ao ler Supabase:', dbErr);
  }

  const mapPoliticosBanco = new Map<string, any>();
  for (const m of dbMandatos || []) {
    const item = mapearMandatarioBanco(m);
    if (item) {
      mapPoliticosBanco.set(item.keyUrna, item.info);
      mapPoliticosBanco.set(item.keyCivil, item.info);
    }
  }
  console.log(`✅ ${dbMandatos?.length || 0} mandatários da base mapeados.\n`);
  return mapPoliticosBanco;
}

function montarTasksTse(): TaskTse[] {
  const tasks: TaskTse[] = [];
  for (const cargo of CARGOS) {
    for (const uf of cargo.ufs) {
      tasks.push({ cargoNome: cargo.nome, cargoCod: cargo.cod, uf });
    }
  }
  return tasks;
}

function formatarCandidatoTse(c: any, cargoNome: string, ufResult: string): CandidatoTse {
  const isBr = ufResult === 'BR';
  return {
    id: c.id,
    nomeUrna: (c.nomeUrna || c.nomeCompleto || '').trim(),
    nomeCompleto: (c.nomeCompleto || '').trim(),
    numero: c.numero,
    partido: (c.partido?.sigla || 'SEM PARTIDO').trim(),
    cargo: cargoNome,
    uf: isBr ? 'BR (Nacional)' : ufResult,
    municipio: isBr ? 'Brasília' : (c.nomeMunicipioNascimento || '-'),
    situacao: c.descricaoSituacao || 'Aguardando julgamento',
    totalizacao: c.descricaoTotalizacao || 'Concorrendo',
    reeleicao: Boolean(c.st_REELEICAO)
  };
}

function extrairCandidatosDeResultados(taskResults: any[]): CandidatoTse[] {
  const todos: CandidatoTse[] = [];
  for (const res of taskResults) {
    for (const c of res.cands) {
      todos.push(formatarCandidatoTse(c, res.cargoNome, res.uf));
    }
  }
  return todos;
}

function processarCruzamentoCandidato(
  cand: CandidatoTse,
  mapPoliticosBanco: Map<string, any>,
  politicosBancoEm2026: any[]
) {
  const normUrna = normalizeName(cand.nomeUrna);
  const normCompl = normalizeName(cand.nomeCompleto);
  const matchBanco = mapPoliticosBanco.get(normUrna) || mapPoliticosBanco.get(normCompl);

  if (matchBanco) {
    politicosBancoEm2026.push({
      ...cand,
      bancoCargoAtual: matchBanco.cargoAtual,
      bancoPartidoAtual: matchBanco.partidoAtual,
      cpf: matchBanco.cpf
    });
  }
}

function calcularMetricasECruzamento(
  todosCandidatosTse: CandidatoTse[],
  mapPoliticosBanco: Map<string, any>
) {
  const politicosBancoEm2026: any[] = [];
  const contagemPorCargo: Record<string, number> = {};
  const contagemPorPartido: Record<string, number> = {};
  const contagemPorEstado: Record<string, number> = {};

  for (const cand of todosCandidatosTse) {
    contagemPorCargo[cand.cargo] = (contagemPorCargo[cand.cargo] || 0) + 1;
    contagemPorPartido[cand.partido] = (contagemPorPartido[cand.partido] || 0) + 1;
    contagemPorEstado[cand.uf] = (contagemPorEstado[cand.uf] || 0) + 1;

    processarCruzamentoCandidato(cand, mapPoliticosBanco, politicosBancoEm2026);
  }

  return {
    politicosBancoEm2026,
    contagemPorCargo,
    contagemPorPartido,
    contagemPorEstado
  };
}

function gravarCsvOficial(todosCandidatosTse: CandidatoTse[]) {
  const csvHeader = 'Nome de Urna;Nome Completo;Número;Partido;Cargo Pleiteado;Estado (UF);Cidade;Situação Registro;Reeleição\n';
  const csvRows = todosCandidatosTse.map(c =>
    `"${c.nomeUrna}";"${c.nomeCompleto}";"${c.numero}";"${c.partido}";"${c.cargo}";"${c.uf}";"${c.municipio}";"${c.situacao}";"${c.reeleicao ? 'Sim' : 'Não'}"`
  ).join('\n');

  const csvPath = path.join(process.cwd(), 'candidatos_oficiais_tse_2026.csv');
  fs.writeFileSync(csvPath, '\uFEFF' + csvHeader + csvRows, 'utf-8');
  console.log(`💾 CSV Completo Unificado salvo em: ${csvPath}`);
}

function gravarJsonOficial(todosCandidatosTse: CandidatoTse[]) {
  const jsonPath = path.join(process.cwd(), 'candidatos_oficiais_tse_2026.json');
  fs.writeFileSync(jsonPath, JSON.stringify(todosCandidatosTse, null, 2), 'utf-8');
  console.log(`💾 JSON Completo Unificado salvo em: ${jsonPath}`);
}

function gravarCruzamentoCsv(politicosBancoEm2026: any[]) {
  const cruzamentoCsvHeader = 'Nome de Urna;Nome Completo;Partido 2026;Cargo Disputado 2026;Estado (UF);Cidade;Cargo no Banco;Partido no Banco;Reeleição\n';
  const cruzamentoRows = politicosBancoEm2026.map(c =>
    `"${c.nomeUrna}";"${c.nomeCompleto}";"${c.partido}";"${c.cargo}";"${c.uf}";"${c.municipio}";"${c.bancoCargoAtual}";"${c.bancoPartidoAtual}";"${c.reeleicao ? 'Sim' : 'Não'}"`
  ).join('\n');
  const cruzamentoPath = path.join(process.cwd(), 'politicos_banco_candidatos_2026.csv');
  fs.writeFileSync(cruzamentoPath, '\uFEFF' + cruzamentoCsvHeader + cruzamentoRows, 'utf-8');
  console.log(`💾 Cruzamento salvo em: ${cruzamentoPath}`);
}

function exibirRelatorioFinal(
  contagemPorCargo: Record<string, number>,
  contagemPorPartido: Record<string, number>,
  contagemPorEstado: Record<string, number>
) {
  console.log('\n--- Total por Cargo Pleiteado ---');
  console.table(contagemPorCargo);

  console.log('\n--- Top 15 Partidos com Mais Candidatos ---');
  const topPartidos = Object.entries(contagemPorPartido).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.table(Object.fromEntries(topPartidos));

  console.log('\n--- Top 10 Estados com Mais Candidatos ---');
  const topEstados = Object.entries(contagemPorEstado).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.table(Object.fromEntries(topEstados));
}

async function main() {
  console.log('🚀 Iniciando Extração Unificada Nacional 2026 (Federal, Estadual e Distrital)...\n');
  const mapPoliticosBanco = await carregarPoliticosBanco();

  const tasks = montarTasksTse();
  console.log(`🌐 Disparando coleta para ${tasks.length} combinações de Cargo x UF no TSE 2026...`);

  const taskResults = await runConcurrent(tasks, async (t) => {
    const cands = await fetchCandidatosCargoUf('2026', '20322002026', t.uf, t.cargoCod);
    process.stdout.write('.');
    return { ...t, cands };
  }, 8);
  console.log('\n✅ Coleta na API do TSE concluída!\n');

  const todosCandidatosTse = extrairCandidatosDeResultados(taskResults);
  console.log(`🎉 Total de Candidatos 2026 Coletados: ${todosCandidatosTse.length}`);

  const {
    politicosBancoEm2026,
    contagemPorCargo,
    contagemPorPartido,
    contagemPorEstado
  } = calcularMetricasECruzamento(todosCandidatosTse, mapPoliticosBanco);

  console.log(`🔗 Candidatos cruzados com o banco do Polígrafo: ${politicosBancoEm2026.length}`);
  todosCandidatosTse.sort((a, b) => a.nomeUrna.localeCompare(b.nomeUrna, 'pt-BR'));

  gravarCsvOficial(todosCandidatosTse);
  gravarJsonOficial(todosCandidatosTse);
  gravarCruzamentoCsv(politicosBancoEm2026);
  exibirRelatorioFinal(contagemPorCargo, contagemPorPartido, contagemPorEstado);
}

main().catch(console.error);
