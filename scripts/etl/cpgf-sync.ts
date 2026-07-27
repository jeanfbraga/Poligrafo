import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { supabaseAdmin } from "../../src/lib/supabase-admin";

const TRANSPARENCIA_API_KEY = process.env.TRANSPARENCIA_API_KEY || "";
const VIP_MAP: Record<string, { mandatoInicio: string, mandatoFim: string }> = {
	lula: { mandatoInicio: "01/01/2023", mandatoFim: "31/12/2026" },
	bolsonaro: { mandatoInicio: "01/01/2019", mandatoFim: "31/12/2022" },
	dilma: { mandatoInicio: "01/01/2011", mandatoFim: "31/08/2016" },
	temer: { mandatoInicio: "31/08/2016", mandatoFim: "31/12/2018" }
};

async function fetchCpgf(idPresidente: string, vipInfo: { mandatoInicio: string, mandatoFim: string }) {
	const allRecords: any[] = [];
	const BATCH_SIZE = 50;
	const MAX_PAGES = 2000; // Aumentado para cobrir a Dilma folgado

	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?codigoOrgao=20101&dataTransacaoInicio=${vipInfo.mandatoInicio}&dataTransacaoFim=${vipInfo.mandatoFim}&pagina=${page}`;
		
		let success = false;
		let retries = 3;
		let data: any[] = [];
		
		while (!success && retries > 0) {
			try {
				const res = await fetch(url, { headers: { "chave-api-dados": TRANSPARENCIA_API_KEY } as HeadersInit });
				if (res.status === 429) {
					console.log(`[Rate Limit] Aguardando para a página ${page}...`);
					await new Promise(r => setTimeout(r, 2000));
					retries--;
					continue;
				}
				if (!res.ok) throw new Error(`Status ${res.status}`);
				data = await res.json();
				success = true;
			} catch (e) {
				console.error(`Erro na pág ${page}:`, e);
				retries--;
				await new Promise(r => setTimeout(r, 1000));
			}
		}

		if (!success) {
			console.error(`❌ Falha irreversível na página ${page}. Abortando extração para este presidente.`);
			break;
		}

		if (data.length === 0) {
			// Não há mais dados
			break;
		}

		allRecords.push(...data);
	}
	
	const registrosFormatados = [];
	
	for (const item of allRecords) {
		if (!item) continue;
		
		const isSigiloso = item.estabelecimento?.id === -1 || item.estabelecimento?.nome === "SEM INFORMACAO" || item.estabelecimento?.cnpjFormatado === "SIGILOSO" || !item.estabelecimento?.cnpjFormatado;
		const valorStr = item.valorTransacao ? String(item.valorTransacao).replace(/\./g, "").replace(",", ".") : "0";
		const valor = Number(valorStr) || 0;

		const nomeFornecedor = isSigiloso ? "SIGILOSO" : (item.estabelecimento?.nome || item.estabelecimento?.razaoSocialReceita || "Desconhecido");
		const cnpj = isSigiloso ? "SIGILOSO" : (item.estabelecimento?.cnpjFormatado || "Não Informado");
		
		registrosFormatados.push({
			id_presidente: idPresidente,
			nome_fornecedor: nomeFornecedor,
			cnpj_fornecedor: cnpj,
			data_transacao: item.dataTransacao,
			valor_transacao: valor,
			tipo_cartao: item.tipoCartao?.descricao || "CPGF"
		});
	}

	return registrosFormatados;
}

async function run() {
	if (!TRANSPARENCIA_API_KEY) {
		console.error("Falta TRANSPARENCIA_API_KEY no .env.local");
		process.exit(1);
	}

	console.log("🚀 Iniciando extração do CPGF para o Supabase...");

	for (const id of Object.keys(VIP_MAP)) {
		console.log(`\n⏳ Extraindo dados de ${id}...`);
		const despesas = await fetchCpgf(id, VIP_MAP[id]);
		console.log(`✅ ${despesas.length} despesas encontradas para ${id}. Removendo antigas e salvando novas no Supabase...`);
		
		if (despesas.length === 0) continue;

		// Deleta os registros antigos deste presidente
		const { error: deleteError } = await supabaseAdmin
			.from("cpgf_despesas_cache")
			.delete()
			.eq("id_presidente", id);
			
		if (deleteError) {
			console.error(`❌ Erro ao deletar registros antigos de ${id}:`, deleteError);
			continue;
		}

		// Realiza o insert em lotes (batching)
		const CHUNK_SIZE = 1000;
		for (let i = 0; i < despesas.length; i += CHUNK_SIZE) {
			const chunk = despesas.slice(i, i + CHUNK_SIZE);
			
			const { error } = await supabaseAdmin
				.from("cpgf_despesas_cache")
				.insert(chunk);
				
			if (error) {
				console.error(`❌ Erro no lote ${i} de ${id}:`, error);
			} else {
				console.log(`✅ Lote de ${chunk.length} inserido com sucesso!`);
			}
		}
	}
	
	console.log("\n🎉 Sincronização CPGF concluída!");
}

run();
