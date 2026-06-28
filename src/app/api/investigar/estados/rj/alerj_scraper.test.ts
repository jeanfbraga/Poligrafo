import { chromium } from 'playwright';

async function testAlerjScraper() {
    console.log(`\n[OSINT ALERJ] Iniciando robô Playwright para: Rodrigo Amorim`);
    console.time('Tempo de Extração');

    const browser = await chromium.launch({ headless: false }); 
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log(`[+] Acessando portal da transparência...`);
        await page.goto('https://docigp.alerj.rj.gov.br/transparencia#/', { waitUntil: 'networkidle', timeout: 60000 });
        await page.screenshot({ path: 'step1_home.png', fullPage: true });

        console.log(`[+] Buscando o input de pesquisa...`);
        // Tenta achar o input pelo texto descritivo mais comum ou apenas o primeiro input text 
        const searchInput = page.locator('input[type="search"], input[placeholder*="usca"], input').first();
        await searchInput.fill('Rodrigo Amorim');
        await searchInput.press('Enter');
        await page.waitForTimeout(4000); // Aguarda debounce e request AJAX da busca
        await page.screenshot({ path: 'step2_filled.png' });
        
        const html = await page.content();
        require('fs').writeFileSync('alerj_dom_after_search.html', html);
        console.log(`[+] HTML após a busca salvo!`);
        
        console.log(`[+] Clicando no perfil do Rodrigo Amorim...`);
        // O DOM mostra que a linha da tabela inteira é clicável (<tr class="cursor-pointer">)
        const nameRow = page.locator(`tr.cursor-pointer:has-text("Rodrigo Amorim")`).first();
        await nameRow.click();
        
        // Aguarda a injeção da nova página/modal
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'step3_profile.png', fullPage: true });

        console.log(`[+] Selecionando 250 itens por página (se existir o seletor)...`);
        // A print do usuário mostra um "select" nativo com o valor "10" acima da tabela
        const paginationSelect = page.locator('select.custom-select').first();
        if (await paginationSelect.count() > 0) {
            try {
                // Selecionando diretamente o <option value="250">
                await paginationSelect.selectOption({ value: '250' });
                console.log(`[+] Paginação alterada para 250 itens.`);
                // Força um dispatchEvent pro Vue entender o change caso selectOption não dispare natural
                await paginationSelect.evaluate((node) => node.dispatchEvent(new Event('change')));
                await page.waitForTimeout(4000); // Aguarda a grid inteira esticar
            } catch(e) { console.log('Erro ao mudar paginação', e); }
        } else {
            console.log(`[-] Seletor de 250 itens não encontrado.`);
        }
        await page.screenshot({ path: 'step4_pagination.png', fullPage: true });

        console.log(`[+] Clicando no primeiro mês (linha de orçamento mensal)...`);
        // Baseado no codegen: await page.getByRole('cell', { name: '2025 / 12' }).click();
        // Vamos buscar a primeira célula que se pareça com um mês (ex: 2025 / 12)
        const firstMonthCell = page.getByRole('cell', { name: /\d{4} \/ \d{2}/ }).first();
        await firstMonthCell.click();

        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'step5_month_clicked.png', fullPage: true });
        
        console.log(`[+] Procurando tabela de lançamentos ao final da página...`);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'step6_scroll_down.png', fullPage: true });

        console.log(`[+] Procurando um Lançamento para clicar (Table 2)...`);
        // O codegen fez: await page.getByRole('cell', { name: 'Assessoria de Imprensa e' }).click();
        // Como o texto é dinâmico, vamos pegar a Tabela 2 e clicar na primeira célula da primeira linha válida (com docs > 0)
        const entriesTable = page.locator('table').nth(2);
        await page.waitForTimeout(4000);
        
        const entryRows = await entriesTable.locator('tbody tr').all();
        let clickedEntryRow = null;

        for (const row of entryRows) {
            const tds = row.locator('td');
            if (await tds.count() < 4) continue;
            
            const docsCountStr = await tds.nth(3).innerText();
            const docsCount = parseInt(docsCountStr.trim() || '0');
            console.log(`   - Lançamento | Docs: "${docsCountStr}" (Parsed: ${docsCount})`);
            
            if (docsCount > 0) {
                console.log(`[+] Clicando no Lançamento com Notas Fiscais...`);
                // Clica exatamente no texto da primeira célula (como 'Assessoria de Imprensa...')
                await tds.nth(1).click();
                clickedEntryRow = row;
                break;
            }
        }

        if (!clickedEntryRow) {
             console.log(`[-] Nenhuma linha com Documentos encontrada neste mês.`);
             return;
        }

        console.log(`[+] Aguardando a tabela de Notas Fiscais/Documentos renderizar (Tabela 3)...`);
        
        // Espera de estabilização
        await page.waitForTimeout(4000); 
        
        // Rola até o fim da página de novo
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

        // Aguarda os botões de visualizar documento carregarem (em qualquer local do DOM)
        await page.waitForSelector('[title="Visualizar documento"]', { state: 'visible', timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(2000); // estabilizar

        await page.screenshot({ path: 'step7_notas_fiscais.png', fullPage: true });

        // Busca botões ou links específicos baseados no codegen do usuário
        const visualizacaoNodes = await page.locator('[title="Visualizar documento"]').all();
        const documentosExtraidos = [];
        
        for (const loc of visualizacaoNodes) {
            try {
                // Tenta pegar href
                let href = await loc.getAttribute('href');
                if (href) {
                    if (href.startsWith('/')) href = 'https://docigp.alerj.rj.gov.br' + href;
                    documentosExtraidos.push(href);
                } else {
                    // Se não tiver href, é um botão que abre popup. Vamos simular o clique e pegar a URL.
                    const [popup] = await Promise.all([
                        page.waitForEvent('popup'),
                        loc.click()
                    ]);
                    const popupUrl = popup.url();
                    documentosExtraidos.push(popupUrl);
                    await popup.close();
                }
            } catch(e) { console.error("Erro ao pegar documento:", e); }
        }

        console.log(`\n======================================================`);
        console.log(`[SUCESSO] EXTRAÍDAS ${documentosExtraidos.length} NOTAS FISCAIS!`);
        console.log(`Lista:`, documentosExtraidos);
        console.log(`======================================================\n`);

        console.log(`[+] Robô finalizou a navegação exploratória.`);

    } catch (error: any) {
        console.error(`\n[ERRO PLAYWRIGHT] O robô falhou: ${error.message}`);
    } finally {
        await context.close();
        await browser.close();
        console.timeEnd('Tempo de Extração');
    }
}

testAlerjScraper();
