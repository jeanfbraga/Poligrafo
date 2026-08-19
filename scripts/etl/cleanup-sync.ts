import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

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

async function run() {
	console.log("[GARBAGE COLLECTOR] Iniciando rotina de limpeza e otimização do banco de dados...");
	
	// Calculamos a data limite de 30 dias atrás para grafos e pesquisas em cache
	const dataLimite = new Date();
	dataLimite.setDate(dataLimite.getDate() - 30);
	const dataLimiteISO = dataLimite.toISOString();

	try {
		// 1. Limpeza de grafos antigos cacheados (> 30 dias)
		console.log(`[GARBAGE COLLECTOR] Excluindo pesquisas cacheadas antes de ${dataLimiteISO}...`);
		const { error: erroPesquisas, count: countPesquisas } = await supabaseAdmin
			.from('pesquisas')
			.delete({ count: 'exact' })
			.lt('atualizado_em', dataLimiteISO);

		if (erroPesquisas) {
			console.error("[GARBAGE COLLECTOR] Erro ao limpar pesquisas:", erroPesquisas.message);
		} else {
			console.log(`[GARBAGE COLLECTOR] Sucesso: ${countPesquisas || 0} pesquisas antigas deletadas.`);
		}

		// 2. Limpeza de registros vazios em tse_doadores_cache (arrays vazios)
		console.log("[GARBAGE COLLECTOR] Verificando doadores com listas vazias no TSE...");
		const { error: erroDoadores, count: countDoadores } = await supabaseAdmin
			.from('tse_doadores_cache')
			.delete({ count: 'exact' })
			.eq('doadores', '{}');

		if (erroDoadores) {
			console.warn("[GARBAGE COLLECTOR] Aviso ao limpar doadores vazios:", erroDoadores.message);
		} else if (countDoadores && countDoadores > 0) {
			console.log(`[GARBAGE COLLECTOR] Sucesso: ${countDoadores} registros vazios de doadores removidos.`);
		}

		console.log("[GARBAGE COLLECTOR] Rotina de limpeza finalizada com sucesso! (CEAP 2024-2026 100% preservada).");
	} catch (error) {
		console.error("[GARBAGE COLLECTOR] Erro fatal durante a limpeza:", error);
	}
}

run();

