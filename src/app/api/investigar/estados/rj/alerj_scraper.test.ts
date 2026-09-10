import { chromium } from "playwright";

async function navegarEBuscar(page: any, nome: string) {
	console.log(`[+] Acessando portal da transparência...`);
	await page.goto("https://docigp.alerj.rj.gov.br/transparencia#/", {
		waitUntil: "networkidle",
		timeout: 60000,
	});
	await page.screenshot({ path: "step1_home.png", fullPage: true });

	console.log(`[+] Buscando o input de pesquisa...`);
	const searchInput = page
		.locator('input[type="search"], input[placeholder*="usca"], input')
		.first();
	await searchInput.fill(nome);
	await searchInput.press("Enter");
	await page.waitForTimeout(4000);
	await page.screenshot({ path: "step2_filled.png" });

	const html = await page.content();
	require("node:fs").writeFileSync("alerj_dom_after_search.html", html);
	console.log(`[+] HTML após a busca salvo!`);

	console.log(`[+] Clicando no perfil do ${nome}...`);
	const nameRow = page
		.locator(`tr.cursor-pointer:has-text("${nome}")`)
		.first();
	await nameRow.click();
	await page.waitForTimeout(5000);
	await page.screenshot({ path: "step3_profile.png", fullPage: true });
}

async function ajustarPaginacaoEClicarPrimeiroMes(page: any) {
	console.log(`[+] Selecionando 250 itens por página (se existir o seletor)...`);
	const paginationSelect = page.locator("select.custom-select").first();
	if ((await paginationSelect.count()) > 0) {
		try {
			await paginationSelect.selectOption({ value: "250" });
			console.log(`[+] Paginação alterada para 250 itens.`);
			await paginationSelect.evaluate((node: any) =>
				node.dispatchEvent(new Event("change")),
			);
			await page.waitForTimeout(4000);
		} catch (e) {
			console.log("Erro ao mudar paginação", e);
		}
	} else {
		console.log(`[-] Seletor de 250 itens não encontrado.`);
	}
	await page.screenshot({ path: "step4_pagination.png", fullPage: true });

	console.log(`[+] Clicando no primeiro mês (linha de orçamento mensal)...`);
	const firstMonthCell = page
		.getByRole("cell", { name: /\d{4} \/ \d{2}/ })
		.first();
	await firstMonthCell.click();
	await page.waitForTimeout(3000);
	await page.screenshot({ path: "step5_month_clicked.png", fullPage: true });

	console.log(`[+] Procurando tabela de lançamentos ao final da página...`);
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(2000);
	await page.screenshot({ path: "step6_scroll_down.png", fullPage: true });
}

async function selecionarLinhaLancamento(page: any) {
	const entriesTable = page.locator("table").nth(2);
	await page.waitForTimeout(4000);
	const entryRows = await entriesTable.locator("tbody tr").all();

	for (const row of entryRows) {
		const tds = row.locator("td");
		if ((await tds.count()) < 4) continue;

		const docsCountStr = await tds.nth(3).innerText();
		const docsCount = parseInt(docsCountStr.trim() || "0", 10);
		console.log(
			`   - Lançamento | Docs: "${docsCountStr}" (Parsed: ${docsCount})`,
		);

		if (docsCount > 0) {
			console.log(`[+] Clicando no Lançamento com Notas Fiscais...`);
			await tds.nth(1).click();
			return row;
		}
	}
	return null;
}

async function extrairLinksDocs(page: any): Promise<string[]> {
	const visualizacaoNodes = await page
		.locator('[title="Visualizar documento"]')
		.all();
	const documentosExtraidos: string[] = [];

	for (const loc of visualizacaoNodes) {
		try {
			let href = await loc.getAttribute("href");
			if (href) {
				if (href.startsWith("/"))
					href = `https://docigp.alerj.rj.gov.br${href}`;
				documentosExtraidos.push(href);
			} else {
				const [popup] = await Promise.all([
					page.waitForEvent("popup"),
					loc.click(),
				]);
				documentosExtraidos.push(popup.url());
				await popup.close();
			}
		} catch (e) {
			console.error("Erro ao pegar documento:", e);
		}
	}
	return documentosExtraidos;
}

async function clicarLancamentoEExtrairDocs(page: any): Promise<string[]> {
	console.log(`[+] Procurando um Lançamento para clicar (Table 2)...`);
	const clickedEntryRow = await selecionarLinhaLancamento(page);

	if (!clickedEntryRow) {
		console.log(`[-] Nenhuma linha com Documentos encontrada neste mês.`);
		return [];
	}

	console.log(
		`[+] Aguardando a tabela de Notas Fiscais/Documentos renderizar (Tabela 3)...`,
	);
	await page.waitForTimeout(4000);
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	await page.waitForTimeout(1000);

	await page
		.waitForSelector('[title="Visualizar documento"]', {
			state: "visible",
			timeout: 10000,
		})
		.catch(() => {});
	await page.waitForTimeout(2000);
	await page.screenshot({ path: "step7_notas_fiscais.png", fullPage: true });

	return extrairLinksDocs(page);
}

async function testAlerjScraper() {
	console.log(`\n[OSINT ALERJ] Iniciando robô Playwright para: Rodrigo Amorim`);
	console.time("Tempo de Extração");

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		await navegarEBuscar(page, "Rodrigo Amorim");
		await ajustarPaginacaoEClicarPrimeiroMes(page);
		const documentosExtraidos = await clicarLancamentoEExtrairDocs(page);

		console.log(`\n======================================================`);
		console.log(
			`[SUCESSO] EXTRAÍDAS ${documentosExtraidos.length} NOTAS FISCAIS!`,
		);
		console.log(`Lista:`, documentosExtraidos);
		console.log(`======================================================\n`);
		console.log(`[+] Robô finalizou a navegação exploratória.`);
	} catch (error: any) {
		console.error(`\n[ERRO PLAYWRIGHT] O robô falhou: ${error.message}`);
	} finally {
		await context.close();
		await browser.close();
		console.timeEnd("Tempo de Extração");
	}
}

testAlerjScraper();

