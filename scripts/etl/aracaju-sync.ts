import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

export interface DespesaAracajuRegistro {
	orgao: 'CMA' | 'PREFEITURA';
	parlamentar_nome: string | null;
	fornecedor_nome: string | null;
	fornecedor_cnpj_cpf: string | null;
	valor: number;
	data_despesa: string | null;
	categoria_despesa: string | null;
	descricao: string | null;
	numero_documento: string | null;
	fonte_url: string | null;
	extraido_por: string;
}

/**
 * Converte valor em formato string BRL (ex: "1.234,56" ou "R$ 1.234,56") ou número para float numérico.
 */
export function parseValorBRL(valor: string | number | undefined | null): number {
	if (valor === undefined || valor === null) return 0;
	if (typeof valor === 'number') return isNaN(valor) ? 0 : valor;
	const clean = String(valor)
		.replace(/R\$\s?/gi, '')
		.replace(/\./g, '')
		.replace(',', '.')
		.trim();
	const parsed = parseFloat(clean);
	return isNaN(parsed) ? 0 : parsed;
}

/**
 * Higieniza strings de CPF/CNPJ deixando apenas números.
 */
export function sanitizarDocumento(doc: string | undefined | null): string {
	if (!doc) return '';
	return String(doc).replace(/\D/g, '');
}

/**
 * Normaliza datas para formato YYYY-MM-DD quando possível.
 */
export function formatarDataISO(data: string | undefined | null): string {
	if (!data) return '';
	const limpa = String(data).trim();
	// Formato DD/MM/YYYY
	if (/^\d{2}\/\d{2}\/\d{4}$/.test(limpa)) {
		const [dia, mes, ano] = limpa.split('/');
		return `${ano}-${mes}-${dia}`;
	}
	// Formato ISO YYYY-MM-DD...
	if (/^\d{4}-\d{2}-\d{2}/.test(limpa)) {
		return limpa.substring(0, 10);
	}
	return limpa;
}

/**
 * Extrai a relação de vereadores e atos parlamentares da Câmara Municipal de Aracaju (CMA).
 */
export async function extrairDespesasCMA(ano: number = new Date().getFullYear()): Promise<DespesaAracajuRegistro[]> {
	const registros: DespesaAracajuRegistro[] = [];

	try {
		// 1. Scraping dos vereadores da CMA no portal oficial
		const resPortal = await fetch('https://www.aracaju.se.leg.br/processo-legislativo/parlamentares', {
			headers: { 'User-Agent': 'Mozilla/5.0' },
			signal: AbortSignal.timeout(12000)
		});

		if (resPortal.ok) {
			const html = await resPortal.text();
			const $ = cheerio.load(html);

			$('article, .tileItem, .summary').each((_, el) => {
				const link = $(el).find('a').first();
				const nome = link.text().trim();
				const href = link.attr('href') || 'https://www.aracaju.se.leg.br/processo-legislativo/parlamentares';

				if (nome && nome.length > 2 && !nome.toLowerCase().includes('navegação')) {
					registros.push({
						orgao: 'CMA',
						parlamentar_nome: nome.toUpperCase(),
						fornecedor_nome: 'CÂMARA MUNICIPAL DE ARACAJU',
						fornecedor_cnpj_cpf: '13149954000185', // CNPJ oficial da CMA
						valor: 0,
						data_despesa: `${ano}-01-01`,
						categoria_despesa: 'Mandato Parlamentar CMA',
						descricao: `[CMA] Registro e Atuação Parlamentar: ${nome} (Legislatura ${ano})`,
						numero_documento: `PARL-${nome.replace(/\s+/g, '-').toUpperCase()}-${ano}`,
						fonte_url: href,
						extraido_por: 'ETL_ARACAJU_CMA_PORTAL'
					});
				}
			});
		}
	} catch (e: any) {
		console.warn(`[ETL ARACAJU] Aviso ao consultar vereadores no Portal CMA:`, e.message);
	}

	try {
		// 2. Consulta SAPL CMA para metadados adicionais
		const resSapl = await fetch('http://190.15.122.10:8080/sapl/consultas/parlamentar/parlamentar_index_html', {
			headers: { 'User-Agent': 'Mozilla/5.0' },
			signal: AbortSignal.timeout(10000)
		});

		if (resSapl.ok) {
			const htmlSapl = await resSapl.text();
			const $sapl = cheerio.load(htmlSapl);

			$sapl('a').each((_, el) => {
				const href = $sapl(el).attr('href') || '';
				const nome = $sapl(el).text().trim();

				if (href.includes('parlamentar_mostrar') && nome.length > 2) {
					registros.push({
						orgao: 'CMA',
						parlamentar_nome: nome.toUpperCase(),
						fornecedor_nome: 'SAPL / PROCESSO LEGISLATIVO CMA',
						fornecedor_cnpj_cpf: '13149954000185',
						valor: 0,
						data_despesa: `${ano}-01-01`,
						categoria_despesa: 'Processo Legislativo',
						descricao: `[SAPL CMA] Parlamentar Ativo: ${nome}`,
						numero_documento: `SAPL-${nome.replace(/\s+/g, '-').toUpperCase()}-${ano}`,
						fonte_url: `http://190.15.122.10:8080/sapl/${href}`,
						extraido_por: 'ETL_ARACAJU_SAPL'
					});
				}
			});
		}
	} catch (e: any) {
		console.warn(`[ETL ARACAJU] Aviso ao consultar SAPL CMA:`, e.message);
	}

	return registros;
}

/**
 * Extrai licitações, atas e contratos da Prefeitura Municipal de Aracaju e CMA via API oficial de Compras.
 */
export async function extrairContratosPrefeitura(ano: number = new Date().getFullYear()): Promise<DespesaAracajuRegistro[]> {
	const registros: DespesaAracajuRegistro[] = [];

	// 1. Consulta API oficial de Contratos Próprios
	try {
		const urlContratos = `https://aracajucompras.se.gov.br/api/api/Contratos?ano=${ano}`;
		const res = await fetch(urlContratos, {
			headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
			signal: AbortSignal.timeout(15000)
		});

		if (res.ok) {
			const json = await res.json();
			if (Array.isArray(json)) {
				for (const c of json) {
					const valor = parseValorBRL(c.valorContrato || '0');
					const dataIso = formatarDataISO(c.dataAssinatura) || `${ano}-01-01`;

					const orgaoNome = c.orgaoNome || c.orgaoSigla || 'Prefeitura de Aracaju';
					const isCma = orgaoNome.toUpperCase().includes('CÂMARA') || (c.objeto && c.objeto.toUpperCase().includes('CÂMARA MUNICIPAL'));

					registros.push({
						orgao: isCma ? 'CMA' : 'PREFEITURA',
						parlamentar_nome: isCma ? 'CÂMARA MUNICIPAL DE ARACAJU' : (c.fiscalGestor || 'PREFEITURA MUNICIPAL DE ARACAJU'),
						fornecedor_nome: (c.contratado || 'FORNECEDOR NÃO INFORMADO').toUpperCase(),
						fornecedor_cnpj_cpf: '13128784000184',
						valor: valor,
						data_despesa: dataIso,
						categoria_despesa: c.modalidade || 'Contrato Administrativo',
						descricao: `[${c.orgaoSigla || 'PMA'}] ${c.objeto || 'Contrato de Aquisição/Serviço'}`,
						numero_documento: c.numeroContrato || `CONT-${c.ID || Date.now()}`,
						fonte_url: `https://aracajucompras.se.gov.br/api/api/Contratos?ano=${ano}`,
						extraido_por: 'ETL_ARACAJU_COMPRAS_API'
					});
				}
			}
		}
	} catch (e: any) {
		console.warn(`[ETL ARACAJU] Aviso ao consultar API de Contratos (${ano}):`, e.message);
	}

	// 2. Consulta API de Contratos Centralizados
	try {
		const urlCentralizados = `https://aracajucompras.se.gov.br/api/api/ContratosCentralizados?ano=${ano}`;
		const resCent = await fetch(urlCentralizados, {
			headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
			signal: AbortSignal.timeout(15000)
		});

		if (resCent.ok) {
			const jsonCent = await resCent.json();
			if (Array.isArray(jsonCent)) {
				for (const c of jsonCent) {
					const valor = parseValorBRL(c.valorContrato || '0');
					const dataIso = formatarDataISO(c.dataAssinatura) || `${ano}-01-01`;

					registros.push({
						orgao: 'PREFEITURA',
						parlamentar_nome: c.fiscalGestor || 'PREFEITURA MUNICIPAL DE ARACAJU',
						fornecedor_nome: (c.contratado || 'FORNECEDOR NÃO INFORMADO').toUpperCase(),
						fornecedor_cnpj_cpf: '13128784000184',
						valor: valor,
						data_despesa: dataIso,
						categoria_despesa: 'Contrato Centralizado',
						descricao: `[${c.orgaoSigla || 'SEPLOG'}] ${c.objeto || 'Locação/Serviço Centralizado'}`,
						numero_documento: c.numeroContrato || `CENT-${c.ID || Date.now()}`,
						fonte_url: `https://aracajucompras.se.gov.br/api/api/ContratosCentralizados?ano=${ano}`,
						extraido_por: 'ETL_ARACAJU_CENTRALIZADOS_API'
					});
				}
			}
		}
	} catch (e: any) {
		console.warn(`[ETL ARACAJU] Aviso ao consultar API de Contratos Centralizados (${ano}):`, e.message);
	}

	return registros;
}

/**
 * Sincroniza os registros de Aracaju com a tabela aracaju_despesas no Supabase.
 */
export async function syncAracajuDespesas(
	client: SupabaseClient,
	ano: number = new Date().getFullYear()
): Promise<{ totalInseridos: number; totalErros: number }> {
	console.log(`[ETL ARACAJU] Iniciando sincronização para o ano ${ano}...`);

	const [despesasCMA, contratosPref] = await Promise.all([
		extrairDespesasCMA(ano),
		extrairContratosPrefeitura(ano)
	]);

	const todosRegistros: DespesaAracajuRegistro[] = [...despesasCMA, ...contratosPref];
	console.log(`[ETL ARACAJU] Coletados ${todosRegistros.length} registros (${despesasCMA.length} CMA, ${contratosPref.length} Prefeitura).`);

	if (todosRegistros.length === 0) {
		return { totalInseridos: 0, totalErros: 0 };
	}

	// Deduplica registros no lote antes de enviar
	const uniqueMap = new Map<string, DespesaAracajuRegistro>();
	for (const r of todosRegistros) {
		const chave = `${r.orgao}|${r.parlamentar_nome}|${r.fornecedor_cnpj_cpf}|${r.valor}|${r.data_despesa}|${r.numero_documento}`;
		if (!uniqueMap.has(chave)) {
			uniqueMap.set(chave, r);
		}
	}

	const batchUnico = Array.from(uniqueMap.values());
	let totalInseridos = 0;
	let totalErros = 0;

	// Inserção em lotes de 50 registros para evitar sobrecarga
	const BATCH_SIZE = 50;
	for (let i = 0; i < batchUnico.length; i += BATCH_SIZE) {
		const batch = batchUnico.slice(i, i + BATCH_SIZE);

		const { error } = await client
			.from('aracaju_despesas')
			.upsert(batch, {
				onConflict: 'orgao,parlamentar_nome,fornecedor_cnpj_cpf,valor,data_despesa,numero_documento'
			});

		if (error) {
			console.error(`[ETL ARACAJU] Erro no lote ${i / BATCH_SIZE + 1}:`, error.message);
			totalErros += batch.length;
		} else {
			totalInseridos += batch.length;
		}
	}

	console.log(`[ETL ARACAJU] Sincronização finalizada. Sucesso: ${totalInseridos}, Erros: ${totalErros}`);
	return { totalInseridos, totalErros };
}

// Execução direta via CLI (npx tsx scripts/etl/aracaju-sync.ts)
if (process.argv[1] && process.argv[1].includes('aracaju-sync')) {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
	const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseKey) {
		console.error('[ETL ARACAJU] ERRO: Credenciais do Supabase não configuradas no ambiente.');
		process.exit(1);
	}

	const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	});

	const anoAtual = new Date().getFullYear();
	syncAracajuDespesas(supabaseAdmin, anoAtual)
		.then(() => syncAracajuDespesas(supabaseAdmin, anoAtual - 1))
		.then(() => {
			console.log('[ETL ARACAJU] Processo concluído com êxito.');
			process.exit(0);
		})
		.catch((err) => {
			console.error('[ETL ARACAJU] Erro fatal durante a execução:', err);
			process.exit(1);
		});
}
