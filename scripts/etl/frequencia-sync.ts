import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { mandatoDoHistorico } from '../../src/lib/mandato';
import { rankingMenosPresentes, sessaoContaParaAusencia, textoDePresenca } from '../../src/lib/frequencia';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2';
const BATCH_SIZE = 1000;
const DRY_RUN = process.argv.includes('--dry-run');
const LOTE_HISTORICO = 8;

async function fetchJson(url: string) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function buscarEventosDeliberativos(dataInicio: string, dataFim: string): Promise<any[]> {
	let urlEventos: string | null = `${API_BASE}/eventos?dataInicio=${dataInicio}&dataFim=${dataFim}&itens=100&ordem=ASC&ordenarPor=dataHoraInicio`;
	const todosEventos: any[] = [];

	while (urlEventos && todosEventos.length <= 500) {
		console.log(`[FREQUENCIA SYNC] Buscando eventos: ${urlEventos}`);
		const data = await fetchJson(urlEventos);
		
		const sessoes = data.dados.filter((e: any) => 
			e.situacao === 'Encerrada' &&
			e.descricaoTipo && e.descricaoTipo.toLowerCase().includes('deliberativa')
		);
		
		todosEventos.push(...sessoes);
		const nextLink = data.links?.find((l: any) => l.rel === 'next');
		urlEventos = nextLink ? nextLink.href : null;
	}

	return todosEventos;
}

function inicializarEstatisticas(ativos: any[]) {
	const stats: Record<number, { id_deputado: number; presencas: number; ausencias_nao_justificadas: number; condicao_eleitoral: string; situacao: string; inicio: string }> = {};
	for (const dep of ativos) {
		stats[dep.id] = {
			id_deputado: dep.id,
			presencas: 0,
			ausencias_nao_justificadas: 0,
			condicao_eleitoral: 'Titular',
			situacao: 'Exercício',
			inicio: '' // data (AAAA-MM-DD) da entrada em exercício; só ausências a partir dela contam
		};
	}
	return stats;
}

/** Data de entrada em exercício de cada deputado: sessões anteriores a ela não contam como ausência. */
async function carregarInicioDeExercicio(stats: Record<number, any>) {
	console.log("[FREQUENCIA SYNC] Buscando data de entrada em exercício de cada deputado...");
	const ids = Object.keys(stats).map(Number);
	for (let i = 0; i < ids.length; i += LOTE_HISTORICO) {
		await Promise.all(ids.slice(i, i + LOTE_HISTORICO).map(async (id) => {
			try {
				const res = await fetchJson(`${API_BASE}/deputados/${id}/historico`);
				stats[id].inicio = mandatoDoHistorico(res.dados ?? [], undefined).dataEntrada;
			} catch (e: any) {
				console.warn(`[FREQUENCIA SYNC] Sem histórico de ${id} (conta todas as sessões): ${e.message}`);
			}
		}));
	}
}
async function enriquecerCondicaoSituacao(stats: Record<number, any>) {
	console.log("[FREQUENCIA SYNC] Verificando condição eleitoral e situação dos deputados com baixa presença...");
	const candidatos = Object.values(stats).filter(s => s.presencas < 40);
	for (const dep of candidatos) {
		try {
			const res = await fetchJson(`${API_BASE}/deputados/${dep.id_deputado}`);
			const status = res.dados?.ultimoStatus;
			dep.condicao_eleitoral = status?.condicaoEleitoral || "Titular";
			dep.situacao = status?.situacao || "Exercício";
			await new Promise(r => setTimeout(r, 60));
		} catch (e: any) {
			console.warn(`[FREQUENCIA SYNC] Aviso ao buscar status de ${dep.id_deputado}: ${e.message}`);
		}
	}
}

async function processarPresencasEvento(evento: any, ativos: any[], stats: Record<number, any>) {
	try {
		const urlDeputados = `${API_BASE}/eventos/${evento.id}/deputados`;
		const presentes = await fetchJson(urlDeputados);
		const presentesIds = new Set(presentes.dados.map((d: any) => d.id));
		const dataSessao = String(evento.dataHoraInicio ?? '');

		for (const dep of ativos) {
			if (presentesIds.has(dep.id)) {
				stats[dep.id].presencas += 1;
			} else if (sessaoContaParaAusencia(dataSessao, stats[dep.id].inicio)) {
				stats[dep.id].ausencias_nao_justificadas += 1;
			}
		}
		await new Promise(r => setTimeout(r, 200));
	} catch (e: any) {
		console.error(`[FREQUENCIA SYNC] Erro ao buscar presenças do evento ${evento.id}:`, e.message);
	}
}

async function salvarEstatisticas(batch: any[], anoAtual: number) {
	console.log(`[FREQUENCIA SYNC] Gravando ${batch.length} registros no Supabase...`);
	await supabaseAdmin.from('camara_frequencia').delete().eq('ano', anoAtual);
	
	for (let i = 0; i < batch.length; i += BATCH_SIZE) {
		const { error } = await supabaseAdmin.from('camara_frequencia').insert(batch.slice(i, i + BATCH_SIZE));
		if (error) console.error("[FREQUENCIA SYNC] Erro ao inserir:", error.message);
	}
}

function imprimirRanking(batch: any[]) {
	console.log("[FREQUENCIA SYNC] --dry-run: nada foi gravado. Menos presentes (titulares em exercício, por taxa):");
	const titulares = batch.filter(b => b.condicao_eleitoral === 'Titular' && b.situacao === 'Exercício');
	for (const r of rankingMenosPresentes(titulares, 10)) {
		console.log(`  - ${r.id_deputado}: ${textoDePresenca(r.presencas, r.sessoes, r.taxa)}`);
	}
}
async function run() {
	console.log("[FREQUENCIA SYNC] Iniciando sincronização via API V2 (últimos 90 dias)...");
	
	const today = new Date();
	const past90 = new Date();
	past90.setDate(today.getDate() - 90);

	const dataFim = today.toISOString().split('T')[0];
	const dataInicio = past90.toISOString().split('T')[0];

	try {
		const todosEventos = await buscarEventosDeliberativos(dataInicio, dataFim);
		console.log(`[FREQUENCIA SYNC] ${todosEventos.length} sessões deliberativas encontradas nos últimos 90 dias.`);

		if (todosEventos.length === 0) {
			console.log("[FREQUENCIA SYNC] Nenhum evento encontrado. Finalizando.");
			return;
		}

		console.log("[FREQUENCIA SYNC] Buscando lista de deputados ativos...");
		const deps = await fetchJson(`${API_BASE}/deputados?itens=600`);
		const ativos = deps.dados;
		const stats = inicializarEstatisticas(ativos);

		for (const evento of todosEventos) {
			await processarPresencasEvento(evento, ativos, stats);
		}

		await carregarInicioDeExercicio(stats);
		await enriquecerCondicaoSituacao(stats);

		const anoAtual = today.getFullYear();
		const batch = Object.values(stats).map(({ inicio: _inicio, ...s }) => ({ ...s, ano: anoAtual }));

		if (DRY_RUN) {
			imprimirRanking(batch);
			return;
		}
		await salvarEstatisticas(batch, anoAtual);
		console.log("[FREQUENCIA SYNC] Concluído com sucesso!");
	} catch (error: any) {
		console.error("[FREQUENCIA SYNC] Erro fatal:", error.message);
	}
}

run().catch(console.error);
