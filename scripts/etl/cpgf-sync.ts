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

function verificarSigilo(item: any): boolean {
	const est = item?.estabelecimento;
	if (!est) return true;
	if (est.id === -1) return true;
	if (est.nome === "SEM INFORMACAO") return true;
	if (est.cnpjFormatado === "SIGILOSO" || !est.cnpjFormatado) return true;
	return false;
}

function extrairValorTransacao(item: any): number {
	if (!item.valorTransacao) return 0;
	const valorStr = String(item.valorTransacao).replace(/\./g, "").replace(",", ".");
	return Number(valorStr) || 0;
}

function formatarRegistroCpgf(item: any, idPresidente: string) {
	if (!item) return null;
	const isSigiloso = verificarSigilo(item);
	const valor = extrairValorTransacao(item);
	const est = item.estabelecimento;
	const nomeFornecedor = isSigiloso ? "SIGILOSO" : (est?.nome || est?.razaoSocialReceita || "Desconhecido");
	const cnpj = isSigiloso ? "SIGILOSO" : (est?.cnpjFormatado || "Não Informado");

	return {
		id_presidente: idPresidente,
		nome_fornecedor: nomeFornecedor,
		cnpj_fornecedor: cnpj,
		data_transacao: item.dataTransacao,
		valor_transacao: valor,
		tipo_cartao: item.tipoCartao?.descricao || "CPGF"
	};
}

async function tratarRespostaCpgf(res: Response, page: number, idPresidente: string, retries: number) {
	if (res.status === 429) {
		console.log(`[Rate Limit] Aguardando 5s para a página ${page}...`);
		await new Promise(r => setTimeout(r, 5000));
		return { retry: true };
	}
	if (res.status === 400) {
		console.log(`[Paginação] Status 400 na pág ${page} — fim dos dados para ${idPresidente}.`);
		return { endOfPages: true, success: true };
	}
	if (res.status >= 500) {
		const attempt = 5 - retries;
		const wait = Math.min(attempt * attempt * 2000, 30000);
		console.log(`[Timeout] Status ${res.status} na pág ${page}. Tentativa ${attempt}/4, aguardando ${wait / 1000}s...`);
		await new Promise(r => setTimeout(r, wait));
		return { retry: true };
	}
	if (!res.ok) throw new Error(`Status ${res.status}`);
	const data = await res.json();
	return { success: true, data };
}

async function buscarPaginaCpgf(url: string, page: number, idPresidente: string) {
	let retries = 4;
	while (retries > 0) {
		try {
			const res = await fetch(url, { headers: { "chave-api-dados": TRANSPARENCIA_API_KEY } as HeadersInit });
			const resultado = await tratarRespostaCpgf(res, page, idPresidente, retries);
			if (resultado.endOfPages) return { endOfPages: true, success: true, data: [] };
			if (resultado.success) return { endOfPages: false, success: true, data: resultado.data };
			retries--;
		} catch (e) {
			const attempt = 5 - retries;
			console.error(`Erro na pág ${page} (tentativa ${attempt}/4):`, e);
			retries--;
			await new Promise(r => setTimeout(r, attempt * 1000));
		}
	}
	return { endOfPages: false, success: false, data: [] };
}

async function fetchCpgf(idPresidente: string, vipInfo: { mandatoInicio: string, mandatoFim: string }) {
	const allRecords: any[] = [];
	const MAX_PAGES = 2000;

	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?codigoOrgao=20101&dataTransacaoInicio=${vipInfo.mandatoInicio}&dataTransacaoFim=${vipInfo.mandatoFim}&pagina=${page}`;
		const res = await buscarPaginaCpgf(url, page, idPresidente);
		if (res.endOfPages || !res.success || res.data.length === 0) {
			if (!res.success) {
				console.error(`❌ Falha irreversível na página ${page}. Abortando extração para ${idPresidente}.`);
			}
			break;
		}
		allRecords.push(...res.data);
		await new Promise(r => setTimeout(r, 350));
	}

	return allRecords
		.map(item => formatarRegistroCpgf(item, idPresidente))
		.filter(Boolean);
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
