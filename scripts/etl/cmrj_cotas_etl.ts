#!/usr/bin/env node
/**
 * ETL - Cota de Gabinete CMRJ
 *
 * Extrai as despesas dos 51 vereadores da Câmara Municipal do Rio de Janeiro
 * a partir do portal de transparência (DOCman/Joomla), usando Playwright para
 * navegar pelo WAF/TLS e IA (Groq Vision → Gemini → OpenRouter → pdf-parse)
 * para ler os PDFs. Salva no Supabase (tabela cmrj_despesas).
 *
 * Uso:
 *   npx tsx scripts/etl/cmrj_cotas_etl.ts
 *
 * Variáveis de ambiente necessárias (mesmas já usadas no projeto):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY (para OCR por IA)
 */

import { chromium, type Browser, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// ─── Supabase (admin) ─────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const CATEGORIAS_COTA = [
    'abastecimento-e-manutencao',
    'auxilio-alimentacao',
    'locacao-de-veiculos-blindados',
    'selos-e-correspondencias',
];

const BASE_URL = 'https://transparencia.camara.rj.gov.br/vereadores/cota-de-gabinete';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Despesa {
    vereador_nome: string;
    fornecedor_nome: string | null;
    fornecedor_cnpj_cpf: string | null;
    valor: number;
    data_despesa: string | null;
    categoria_despesa: string;
    descricao: string | null;
    fonte_arquivo: string | null;
    extraido_por: string;
}

// ─── L1: Groq Vision (llama-3.2-11b-vision-preview) ─────────────────────────
async function ocrViaGroq(imageBase64: string, context: string): Promise<Despesa[] | null> {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;

    const prompt = `Você é um extrator de dados de despesas públicas. Extraia TODAS as linhas de despesa desta imagem de tabela de "Cota de Gabinete" da Câmara Municipal do Rio de Janeiro.

Contexto: ${context}

Retorne APENAS um JSON array válido com os campos:
[{"fornecedor_nome": string, "fornecedor_cnpj_cpf": string|null, "valor": number, "data_despesa": string|null, "descricao": string|null}]

Se não houver despesas legíveis, retorne [].
Não inclua nenhum texto fora do JSON.`;

    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.2-11b-vision-preview',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
                    ]
                }],
                temperature: 0.1,
                max_tokens: 4096,
            }),
            signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) return null;
        const data = await res.json() as any;
        const text = data.choices?.[0]?.message?.content || '';
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']') + 1;
        if (start === -1) return null;
        return JSON.parse(text.substring(start, end));
    } catch {
        return null;
    }
}

// ─── L2: Gemini Flash Vision ──────────────────────────────────────────────────
async function ocrViaGemini(imageBase64: string, context: string): Promise<Despesa[] | null> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    const prompt = `Você é um extrator de dados. Analise a imagem desta tabela de despesas parlamentares ("Cota de Gabinete" - CMRJ) e extraia todas as linhas.
Contexto: ${context}
Retorne APENAS um JSON array:
[{"vereador_nome": string, "fornecedor_nome": string, "fornecedor_cnpj_cpf": string|null, "valor": number, "data_despesa": string|null, "descricao": string|null}]
Se não houver dados, retorne []. Nada fora do JSON.`;

    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
    for (const model of models) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inline_data: { mime_type: 'image/png', data: imageBase64 } }
                            ]
                        }],
                        generationConfig: { temperature: 0.1 }
                    }),
                    signal: AbortSignal.timeout(30000)
                }
            );
            if (!res.ok) continue;
            const data = await res.json() as any;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const start = cleanText.indexOf('[');
            const end = cleanText.lastIndexOf(']') + 1;
            if (start === -1) continue;
            return JSON.parse(cleanText.substring(start, end));
        } catch { continue; }
    }
    return null;
}

// ─── L3: OpenRouter Vision ────────────────────────────────────────────────────
async function ocrViaOpenRouter(imageBase64: string, context: string): Promise<Despesa[] | null> {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return null;

    const prompt = `Extract all expense rows from this Brazilian municipal chamber ("Cota de Gabinete") table image.
Context: ${context}
Return ONLY a JSON array:
[{"fornecedor_nome": string, "fornecedor_cnpj_cpf": string|null, "valor": number, "data_despesa": string|null, "descricao": string|null}]
Return [] if no data. No text outside JSON.`;

    const models = [
        'qwen/qwen2.5-vl-72b-instruct:free',
        'google/gemma-4-31b-it:free',
        'meta-llama/llama-4-scout-17b-16e-instruct:free',
    ];

    for (const model of models) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'HTTP-Referer': 'https://poligrafo.app.br',
                    'X-Title': 'Poligrafo ETL',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
                        ]
                    }],
                    temperature: 0.1,
                }),
                signal: AbortSignal.timeout(30000)
            });
            if (!res.ok) continue;
            const data = await res.json() as any;
            const text = data.choices?.[0]?.message?.content || '';
            const start = text.indexOf('[');
            const end = text.lastIndexOf(']') + 1;
            if (start === -1) continue;
            return JSON.parse(text.substring(start, end));
        } catch { continue; }
    }
    return null;
}

// ─── L4: pdf-parse (texto nativo do PDF) ─────────────────────────────────────
async function ocrViaPdfParse(pdfBuffer: Buffer, context: string): Promise<Despesa[] | null> {
    try {
        // pdf-parse é importado dinamicamente para evitar erros de tipos no build Next.js
        // eslint-disable-next-line
        const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
        const parsed = await pdfParse(pdfBuffer);
        const text = parsed.text;
        if (!text || text.trim().length < 10) return null;

        // Heurística: encontrar linhas com padrão de CNPJ (XX.XXX.XXX/XXXX-XX) e valor (R$ X.XXX,XX)
        const cnpjRegex = /(\d{2}[\.\-]?\d{3}[\.\-]?\d{3}[\/\.\-]?\d{4}[\.\-]?\d{2})/g;
        const valorRegex = /R?\$?\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g;
        const dataRegex = /(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/g;

        const linhas = text.split('\n').filter((l: string) => l.trim().length > 5);
        const despesas: Despesa[] = [];

        for (const linha of linhas) {
            const cnpjMatch = linha.match(cnpjRegex);
            const valorMatch = linha.match(valorRegex);
            if (!cnpjMatch || !valorMatch) continue;

            const cnpj = cnpjMatch[0].replace(/\D/g, '');
            const valorStr = valorMatch[valorMatch.length - 1]
                .replace(/[R$\s]/g, '')
                .replace(/\./g, '')
                .replace(',', '.');
            const valor = parseFloat(valorStr);
            if (isNaN(valor) || valor <= 0) continue;

            const dataMatch = linha.match(dataRegex);
            despesas.push({
                vereador_nome: '',
                fornecedor_nome: null,
                fornecedor_cnpj_cpf: cnpj.length >= 11 ? cnpj : null,
                valor,
                data_despesa: dataMatch ? dataMatch[0] : null,
                categoria_despesa: '',
                descricao: linha.substring(0, 200).trim(),
                fonte_arquivo: context,
                extraido_por: 'l4-pdf-parse',
            });
        }

        return despesas.length > 0 ? despesas : null;
    } catch {
        return null;
    }
}

// ─── Orquestrador de OCR ──────────────────────────────────────────────────────
async function extrairDespesasDeArquivo(
    pdfBuffer: Buffer,
    pageImages: string[],
    context: string
): Promise<{ dados: Omit<Despesa, 'categoria_despesa' | 'fonte_arquivo'>[]; source: string }> {
    // Tenta cada imagem de página com IA
    for (const imgB64 of pageImages) {
        const groqResult = await ocrViaGroq(imgB64, context);
        if (groqResult && groqResult.length > 0) {
            console.log(`  [L1 Groq] ✅ ${groqResult.length} linha(s) extraída(s)`);
            return { dados: groqResult, source: 'l1-groq' };
        }

        const geminiResult = await ocrViaGemini(imgB64, context);
        if (geminiResult && geminiResult.length > 0) {
            console.log(`  [L2 Gemini] ✅ ${geminiResult.length} linha(s) extraída(s)`);
            return { dados: geminiResult, source: 'l2-gemini' };
        }

        const orResult = await ocrViaOpenRouter(imgB64, context);
        if (orResult && orResult.length > 0) {
            console.log(`  [L3 OpenRouter] ✅ ${orResult.length} linha(s) extraída(s)`);
            return { dados: orResult, source: 'l3-openrouter' };
        }
    }

    // L4: texto nativo do PDF
    const pdfResult = await ocrViaPdfParse(pdfBuffer, context);
    if (pdfResult && pdfResult.length > 0) {
        console.log(`  [L4 pdf-parse] ✅ ${pdfResult.length} linha(s) extraída(s)`);
        return { dados: pdfResult, source: 'l4-pdf-parse' };
    }

    console.warn(`  ⚠️  Nenhum dado extraído de ${context}`);
    return { dados: [], source: 'none' };
}

// ─── Crawler DOCman ───────────────────────────────────────────────────────────
async function crawlCategory(page: Page, url: string, visited = new Set<string>()): Promise<{href: string, text: string}[]> {
    if (visited.has(url)) return [];
    visited.add(url);
    
    console.log(`  🔍 Crawling: ${url.replace(BASE_URL, '') || '/'}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    
    const links = await page.$$eval('a[href]', anchors =>
        anchors.map(a => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.trim() || '' }))
    );
    
    const files: {href: string, text: string}[] = [];
    const subcats: string[] = [];
    
    for (const l of links) {
        if (l.href.includes('?format=') || l.href.includes('search?') || l.href.endsWith('#')) continue;
        
        // Links de arquivos DOCman (/file) ou arquivos diretos
        if (l.href.endsWith('/file') || /\.(pdf|xls|xlsx|csv)$/i.test(l.href)) {
            if (!files.some(f => f.href === l.href)) {
                files.push({ href: l.href, text: l.text || 'Documento' });
            }
        } 
        // Subcategorias (ex: /2025, /2026) que estão dentro da mesma árvore
        else if (l.href.startsWith(url) && l.href.length > url.length) {
            if (!subcats.includes(l.href)) {
                subcats.push(l.href);
            }
        }
    }
    
    for (const subcat of subcats) {
        const subFiles = await crawlCategory(page, subcat, visited);
        files.push(...subFiles);
    }
    
    return files;
}

// ─── Download de arquivo via Fetch (suporta redirects DOCman) ─────────────────
async function downloadFile(url: string): Promise<{ buffer: Buffer, type: string, filename: string } | null> {
    try {
        const https = require('https');
        const agent = new https.Agent({ rejectUnauthorized: false });
        
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            redirect: 'follow',
            // @ts-ignore
            dispatcher: new (require('undici').Agent)({ connect: { rejectUnauthorized: false } })
        });
        if (!res.ok) return null;
        
        const type = res.headers.get('content-type') || '';
        let filename = 'arquivo';
        const disp = res.headers.get('content-disposition');
        if (disp) {
            const match = disp.match(/filename="?([^"]+)"?/);
            if (match) filename = match[1];
        } else {
            filename = url.split('/').pop() || 'arquivo';
        }
        
        const arrayBuffer = await res.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), type, filename };
    } catch (e) {
        console.error("Erro no download:", e);
        return null;
    }
}

// ─── Converte páginas PDF em imagens via Playwright ───────────────────────────
async function pdfToImages(page: Page, pdfUrl: string): Promise<string[]> {
    try {
        // Carrega o PDF no browser e screenshot cada página
        await page.goto(pdfUrl, { waitUntil: 'networkidle', timeout: 120000 });
        await page.waitForTimeout(2000);
        const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
        return [screenshot.toString('base64')];
    } catch {
        return [];
    }
}

// ─── Salva despesas no Supabase ───────────────────────────────────────────────
async function salvarDespesas(despesas: Despesa[]): Promise<void> {
    if (despesas.length === 0) return;

    const { error } = await supabase
        .from('cmrj_despesas')
        .upsert(despesas, {
            onConflict: 'vereador_nome,fornecedor_cnpj_cpf,valor,data_despesa,categoria_despesa',
            ignoreDuplicates: true
        });

    if (error) {
        console.error('❌ Erro ao salvar no Supabase:', error.message);
    } else {
        console.log(`  💾 ${despesas.length} despesa(s) salva(s) no Supabase`);
    }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 ETL Cota de Gabinete CMRJ iniciado em', new Date().toISOString());

    // Buscar todos os vereadores do mapeamento já criado
    const { data: vereadores, error } = await supabase
        .from('cmrj_vereador_gabinete')
        .select('nome_urna, gabinete_numero')
        .order('gabinete_numero');

    if (error || !vereadores || vereadores.length === 0) {
        console.error('❌ Falha ao buscar vereadores do Supabase:', error?.message);
        process.exit(1);
    }

    // Filtrar apenas os solicitados pelo usuário para rodar mais rápido
    const nomesFiltro = ['Gigi Castilho', 'Dr. Marcos Paulo', 'Tainá de Paula', 'Carlo Caiado', 'William Siri', 'Monica Benicio'];
    const vereadoresFiltrados = vereadores.filter(v => nomesFiltro.includes(v.nome_urna));

    console.log(`✅ ${vereadoresFiltrados.length} vereadores carregados (FILTRADOS)`);

    const browser: Browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
    });

    let totalDespesas = 0;

    try {
        for (const categoria of CATEGORIAS_COTA) {
            console.log(`\n📂 Categoria: ${categoria}`);
            const page: Page = await browser.newPage();

            try {
                const catUrl = `${BASE_URL}/${categoria}`;
                await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
                await page.waitForTimeout(1500);

                const fileLinks = await crawlCategory(page, catUrl);
                console.log(`  📄 ${fileLinks.length} arquivo(s) encontrado(s) na árvore`);

                for (const { href, text } of fileLinks) {
                    console.log(`  ⬇️  Baixando arquivo: ${text} (${href})`);

                    const fileData = await downloadFile(href);
                    if (!fileData) { console.warn('    ⚠️ Falha no download'); continue; }

                    const { buffer, type, filename } = fileData;

                    let isRealCsv = false;
                    if (type.includes('csv') || filename.toLowerCase().endsWith('.csv') || filename.toLowerCase().endsWith('.xls')) {
                        try {
                            const xlsx = require('xlsx');
                            const workbook = xlsx.read(buffer, { type: 'buffer' });
                            const sheetName = workbook.SheetNames[0];
                            const sheet = workbook.Sheets[sheetName];
                            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

                            isRealCsv = rows.length > 2;

                            if (isRealCsv) {
                                const despesas: Despesa[] = [];
                                for (let i = 0; i < rows.length; i++) {
                                    const cols = rows[i];
                                    if (!cols || cols.length < 2) continue;

                                    // Busca em qualquer coluna da linha um nome que lembre um vereador
                                    let vereadorMatch = null;
                                    for (const c of cols) {
                                        if (typeof c === 'string' && c.trim().length > 3) {
                                            const vMatch = vereadoresFiltrados.find(v => c.toLowerCase().includes(v.nome_urna.toLowerCase().split(' ')[0]));
                                            if (vMatch) { vereadorMatch = vMatch; break; }
                                        }
                                    }

                                    if (!vereadorMatch) continue;

                                    // Pega todos os números reais dessa linha
                                    for (let j = 0; j < cols.length; j++) {
                                        const valRaw = cols[j];
                                        let valor = 0;
                                        if (typeof valRaw === 'number') {
                                            valor = valRaw;
                                        } else if (typeof valRaw === 'string') {
                                            const num = parseFloat(valRaw.replace(/\./g, '').replace(',', '.'));
                                            if (!isNaN(num)) valor = num;
                                        }

                                        if (valor > 0 && valor < 100000) {
                                            despesas.push({
                                                vereador_nome: vereadorMatch.nome_urna,
                                                fornecedor_nome: 'Despesa Consolidada (Planilha CMRJ)',
                                                fornecedor_cnpj_cpf: null,
                                                valor,
                                                data_despesa: null,
                                                categoria_despesa: categoria,
                                                descricao: 'Extraído automaticamente de XLSX/CSV',
                                                fonte_arquivo: href,
                                                extraido_por: 'l4-xlsx-parse',
                                            });
                                        }
                                    }
                                }
                                if (despesas.length > 0) {
                                    await salvarDespesas(despesas);
                                    totalDespesas += despesas.length;
                                }
                                continue;
                            }
                        } catch (err: any) {
                            console.log('    📄 Falha ao ler como XLSX:', err.message);
                        }
                    }

                    // Se for PDF (ou se não for CSV explícito, tentamos como PDF na IA)
                    const pageImages = await pdfToImages(page, href);
                    const { dados, source } = await extrairDespesasDeArquivo(buffer, pageImages, `${href} (${categoria})`);

                    const despesas: Despesa[] = [];
                    for (const d of dados) {
                        if (!d.vereador_nome || Number(d.valor) <= 0) continue;
                        const vereadorMatch = vereadoresFiltrados.find(v =>
                            d.vereador_nome.toLowerCase().includes(v.nome_urna.toLowerCase().split(' ')[0])
                        );
                        if (!vereadorMatch) continue;

                        despesas.push({
                            vereador_nome: vereadorMatch.nome_urna,
                            fornecedor_nome: d.fornecedor_nome,
                            fornecedor_cnpj_cpf: d.fornecedor_cnpj_cpf,
                            valor: Number(d.valor),
                            data_despesa: d.data_despesa,
                            categoria_despesa: categoria,
                            descricao: d.descricao,
                            fonte_arquivo: href,
                            extraido_por: source,
                        });
                    }

                    await salvarDespesas(despesas);
                    totalDespesas += despesas.length;
                }
            } catch (err: any) {
                console.error(`  ❌ Erro na categoria ${categoria}:`, err.message);
            } finally {
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }

    console.log(`\n✅ ETL concluído. Total: ${totalDespesas} despesa(s) processada(s) em ${new Date().toISOString()}`);
}

main().catch(err => {
    console.error('💥 Erro fatal no ETL:', err);
    process.exit(1);
});
