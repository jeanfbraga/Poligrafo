#!/usr/bin/env node
/**
 * Seed real: Reutiliza crawlCategory do ETL principal, apenas 1 vereador (Gigi Castilho).
 * Popula cmrj_despesas com dados reais extraídos do portal CMRJ.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BASE_URL = 'https://transparencia.camara.rj.gov.br/vereadores/cota-de-gabinete';

// Crawls the DOCman tree recursivamente, igual ao ETL principal
async function crawlCategory(page: Page, url: string, visited = new Set<string>()): Promise<{ href: string; text: string }[]> {
    if (visited.has(url)) return [];
    visited.add(url);

    console.log(`  🔍 ${url.replace(BASE_URL, '') || '/'}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(2500);

    const links = await page.$$eval('a[href]', (anchors) =>
        anchors.map(a => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent || '').trim() }))
    );

    const files: { href: string; text: string }[] = [];
    const subcats: string[] = [];

    for (const l of links) {
        if (!l.href || l.href.includes('?format=') || l.href.includes('search?') || l.href.endsWith('#')) continue;

        if (l.href.endsWith('/file') || /\.(pdf|xls|xlsx|csv)$/i.test(l.href) || l.href.includes('download')) {
            if (!files.some(f => f.href === l.href)) {
                files.push({ href: l.href, text: l.text });
            }
        } else if (l.href.startsWith(url) && l.href.length > url.length + 1) {
            if (!subcats.includes(l.href)) subcats.push(l.href);
        }
    }

    for (const subcat of subcats.slice(0, 5)) {
        const sub = await crawlCategory(page, subcat, visited);
        files.push(...sub);
    }

    return files;
}

async function downloadViaPlaywright(page: Page, url: string): Promise<{ buffer: Buffer; type: string } | null> {
    try {
        const result = await page.evaluate(async (u: string) => {
            const r = await fetch(u, { redirect: 'follow' });
            if (!r.ok) return null;
            const type = r.headers.get('content-type') || '';
            const ab = await r.arrayBuffer();
            return { bytes: Array.from(new Uint8Array(ab)), type };
        }, url);
        if (!result) return null;
        return { buffer: Buffer.from(result.bytes), type: result.type };
    } catch { return null; }
}

function parseCsv(csv: string, vereadorNome: string, categoria: string, fonte: string) {
    const linhas = csv.split('\n').filter(l => l.trim());
    const despesas: any[] = [];
    for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(';').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 3) continue;
        const valorStr = (cols[cols.length - 1] || '0').replace(/R\$/g, '').replace(/\./g, '').replace(',', '.').trim();
        const valor = parseFloat(valorStr);
        if (isNaN(valor) || valor <= 0) continue;
        despesas.push({
            vereador_nome: vereadorNome,
            fornecedor_nome: cols[1] || null,
            fornecedor_cnpj_cpf: (cols[0] || '').replace(/\D/g, '') || null,
            valor,
            data_despesa: cols[cols.length - 2] || null,
            categoria_despesa: categoria,
            descricao: cols[2] || null,
            fonte_arquivo: fonte,
            extraido_por: 'playwright-seed-v2',
        });
    }
    return despesas;
}

const CATEGORIAS = [
    { slug: 'abastecimento-e-manutencao',  label: 'Combustível e Manutenção' },
    { slug: 'selos-e-correspondencias',     label: 'Postagem e Correspondência' },
    { slug: 'auxilio-alimentacao',          label: 'Auxílio Alimentação' },
    { slug: 'locacao-de-veiculos-blindados', label: 'Locação de Veículos' },
];

// Vereadores para seed rápido
const VEREADORES = [
    { nome: 'Gigi Castilho',  primeiro: 'gigi' },
    { nome: 'Carlo Caiado',   primeiro: 'carlo' },
    { nome: 'Tainá de Paula', primeiro: 'taina' },
    { nome: 'William Siri',   primeiro: 'william' },
    { nome: 'Monica Benicio', primeiro: 'monica' },
    { nome: 'Dr. Marcos Paulo', primeiro: 'marcos' }
];

async function main() {
    console.log('🚀 Seed Real CMRJ (v2 com networkidle)\n');

    const { error: pingErr } = await supabase.from('cmrj_despesas').select('id').limit(1);
    if (pingErr) { console.error('❌ Supabase:', pingErr.message); process.exit(1); }
    console.log('✅ Supabase OK\n');

    const browser: Browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
    let totalSalvas = 0;

    try {
        for (const vereador of VEREADORES) {
            console.log(`\n👤 ${vereador.nome}`);
            for (const cat of CATEGORIAS) {
                const catUrl = `${BASE_URL}/${cat.slug}`;
                const page = await browser.newPage();
                try {
                    const todosLinks = await crawlCategory(page, catUrl);
                    const linksVer = todosLinks.filter(l =>
                        l.text.toLowerCase().includes(vereador.primeiro) ||
                        l.href.toLowerCase().includes(vereador.primeiro)
                    );
                    console.log(`  📂 ${cat.slug}: ${todosLinks.length} total → ${linksVer.length} para "${vereador.primeiro}"`);

                    for (const { href, text } of linksVer.slice(0, 5)) {
                        console.log(`  ⬇ ${text.slice(0, 60) || href.slice(-50)}`);
                        const dl = await downloadViaPlaywright(page, href);
                        if (!dl) { console.log('    ⚠ Download vazio'); continue; }

                        const textContent = dl.buffer.toString('utf-8');
                        const isCsv = textContent.includes(';') && textContent.split('\n').length > 2;
                        if (!isCsv) { console.log(`    📄 Não CSV (${dl.type})`); continue; }

                        const despesas = parseCsv(textContent, vereador.nome, cat.label, href);
                        if (!despesas.length) { console.log('    ⏭ Nenhuma despesa válida'); continue; }

                        const { error } = await supabase.from('cmrj_despesas').upsert(despesas, {
                            onConflict: 'vereador_nome,fornecedor_cnpj_cpf,valor,data_despesa,categoria_despesa',
                            ignoreDuplicates: true,
                        });
                        if (error) console.warn(`    ⚠ Upsert: ${error.message}`);
                        else { totalSalvas += despesas.length; console.log(`    ✅ ${despesas.length} salvas`); }
                    }
                } catch (e: any) {
                    console.warn(`  ❌ Erro categoria ${cat.slug}: ${e.message}`);
                } finally {
                    await page.close();
                }
                await new Promise(r => setTimeout(r, 800));
            }
        }
    } finally {
        await browser.close();
    }

    const { count } = await supabase.from('cmrj_despesas').select('*', { count: 'exact', head: true });
    console.log(`\n✅ Total no banco: ${count ?? 0} despesa(s). Inseridas agora: ${totalSalvas}`);

    if ((count ?? 0) === 0) {
        console.log('\n⚠️  O portal retornou apenas PDFs. Execute o ETL completo com OCR:');
        console.log('   npx tsx scripts/etl/cmrj_cotas_etl.ts');
        console.log('\n   Os testes de integração validam que a API responde corretamente');
        console.log('   mesmo com tabela vazia (totalGastos=0, arrays vazios).');
    }
}

main().catch(err => { console.error('💥', err); process.exit(1); });
