import { buscarCpfNoTSE } from "../../tse";

const DOCIGP_BASE = "https://docigp.alerj.rj.gov.br/api/v1";

export async function buscarDeputadoEstadualRJ(nomeBuscado: string): Promise<
	{
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		casa: "ALERJ";
	}[]
> {
	const termo = nomeBuscado.toLowerCase().trim();
	const resultados: any[] = [];

	const tseResult = await buscarCpfNoTSE(termo, "RJ", "7");

	if (tseResult) {
		const nomeCompleto =
			tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
		const documento = tseResult.documentoPrincipal || tseResult.cpf;

		resultados.push({
			ref: `ALERJ:DEPUTADO_ESTADUAL:${encodeURIComponent(nomeCompleto)}:${documento}`,
			id: nomeCompleto,
			nome: nomeCompleto,
			cargo: "Deputado Estadual (RJ)",
			uf: "RJ",
			casa: "ALERJ",
		});
	}

	return resultados;
}

function normalizarTexto(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, " ")
		.trim();
}

function matchNomeSubstrings(
	nNorm: string,
	nickNorm: string,
	termoNorm: string,
): boolean {
	return (
		nNorm.includes(termoNorm) ||
		nickNorm.includes(termoNorm) ||
		termoNorm.includes(nNorm) ||
		termoNorm.includes(nickNorm)
	);
}

function matchPalavrasExtremas(
	palavrasBusca: string[],
	nNorm: string,
): boolean {
	if (palavrasBusca.length < 2) return false;
	const palavrasDocigp = nNorm.split(" ").filter((p) => p.length > 2);
	if (palavrasDocigp.length < 2) return false;
	const primeiro = palavrasBusca[0];
	const ultimo = palavrasBusca[palavrasBusca.length - 1];
	return palavrasDocigp.includes(primeiro) && palavrasDocigp.includes(ultimo);
}

function isCandidatoCorrespondenteDocigp(
	c: any,
	termoNorm: string,
	palavrasBusca: string[],
): boolean {
	const nNorm = normalizarTexto(c.name || "");
	const nickNorm = normalizarTexto(c.nickname || "");
	if (matchNomeSubstrings(nNorm, nickNorm, termoNorm)) return true;
	return matchPalavrasExtremas(palavrasBusca, nNorm);
}

async function consultarPaginaDocigp(page: number): Promise<any[]> {
	try {
		const res = await fetch(`${DOCIGP_BASE}/congressmen?page=${page}`, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(60000),
		});
		if (!res.ok) return [];
		const json = await res.json();
		return json.rows || json.data || [];
	} catch (pageError: any) {
		console.error(`[DOCIGP] Erro na página ${page}: ${pageError?.message}`);
		return [];
	}
}

function mapearPerfilDocigp(match: any) {
	const foto = match.photo_url_linkable || match.thumbnail_url_linkable || "";
	return {
		id: match.id,
		nome: match.name,
		apelido: match.nickname,
		partido: match.party?.code || "S/P",
		fotoUrl: foto,
		temMandato: match.has_mandate,
		publicado: match.is_published,
	};
}

/**
 * Busca o perfil do deputado no DOCIGP e retorna seu ID interno + dados do perfil.
 */
export async function buscarPerfilDOCIGP(
	nomeDeputado: string,
	sendEvent?: any,
): Promise<{
	id: number;
	nome: string;
	apelido: string;
	partido: string;
	fotoUrl: string;
	temMandato: boolean;
	publicado: boolean;
} | null> {
	const termoNorm = normalizarTexto(nomeDeputado);
	const palavrasBusca = termoNorm.split(" ").filter((p) => p.length > 2);

	try {
		for (let page = 1; page <= 8; page++) {
			if (sendEvent) {
				sendEvent("STATUS", {
					msg: `Buscando dossiê no DOCIGP da ALERJ (página ${page} de 8)...`,
				});
			}
			const data = await consultarPaginaDocigp(page);
			const match = data.find((c: any) =>
				isCandidatoCorrespondenteDocigp(c, termoNorm, palavrasBusca),
			);
			if (match) {
				if (sendEvent) {
					sendEvent("STATUS", {
						msg: `Dossiê encontrado no DOCIGP! (ID: ${match.id})`,
					});
				}
				return mapearPerfilDocigp(match);
			}
		}
		return null;
	} catch (error: any) {
		console.error(`[DOCIGP] Erro global: ${error?.message}`);
		return null;
	}
}

// Usaremos Playwright nativo conforme solicitado pelo usuário para drilldown completo
import { chromium } from "playwright";

async function navegarParaPerfilAlerj(
	page: any,
	nomeDeputado: string,
	sendEvent?: any,
): Promise<void> {
	await page.goto("https://docigp.alerj.rj.gov.br/transparencia#/", {
		waitUntil: "load",
		timeout: 60000,
	});

	if (sendEvent) {
		sendEvent("STATUS", {
			msg: `[OSINT ALERJ] Acessado portal da transparência. Buscando perfil...`,
		});
	}

	const searchInput = page
		.locator('input[type="search"], input[placeholder*="usca"], input')
		.first();
	await searchInput.fill(nomeDeputado);
	await searchInput.press("Enter");
	await page.waitForTimeout(3000);

	const lastName = nomeDeputado.split(" ").pop() || nomeDeputado;
	const nameRow = page
		.locator(`tr.cursor-pointer:has-text("${lastName}")`)
		.first();

	await nameRow.click();
	await page.waitForTimeout(4000);

	if (sendEvent) {
		sendEvent("STATUS", {
			msg: `[OSINT ALERJ] Dossiê encontrado. Carregando documentos...`,
		});
	}
}

async function ajustarSelectsPaginacaoAlerj(page: any): Promise<void> {
	const selects = await page.locator("select").all();
	for (const s of selects) {
		try {
			const options = await s.locator("option").allInnerTexts();
			const maxOption =
				options.find(
					(o: string) =>
						o.includes("250") || o.includes("100") || o.includes("Todos"),
				) || options[options.length - 1];
			await s.selectOption({ label: maxOption.trim() });
			await page.waitForTimeout(500);
		} catch {}
	}
}

async function abrirMesMaisRecenteAlerj(
	page: any,
	sendEvent?: any,
): Promise<void> {
	const firstMonthCell = page
		.getByRole("cell", { name: /\d{4} \/ \d{2}/ })
		.first();
	await firstMonthCell.click();
	await page.waitForTimeout(3000);

	if (sendEvent) {
		sendEvent("STATUS", {
			msg: `[OSINT ALERJ] Mês mais recente aberto. Buscando Lançamentos...`,
		});
	}
}

async function extrairDocumentosPopupAlerj(page: any): Promise<string[]> {
	const visualizacaoNodes = await page
		.locator('[title="Visualizar documento"]')
		.all();
	const documentosExtraidos: string[] = [];

	for (const loc of visualizacaoNodes) {
		try {
			const href = await loc.getAttribute("href");
			if (href) {
				const fullHref = href.startsWith("/")
					? `https://docigp.alerj.rj.gov.br${href}`
					: href;
				documentosExtraidos.push(fullHref);
			} else {
				const [popup] = await Promise.all([
					page.waitForEvent("popup"),
					loc.click(),
				]);
				documentosExtraidos.push(popup.url());
				await popup.close();
			}
		} catch {}
	}
	return documentosExtraidos;
}

async function extrairLancamentoLinhaAlerj(
	tr: any,
	page: any,
): Promise<any | null> {
	const tds = tr.locator("td");
	const count = await tds.count();
	if (count < 4) return null;

	const docsCountStr = await tds.nth(3).innerText();
	const docsCount = parseInt(docsCountStr.trim() || "0", 10);
	if (docsCount <= 0) return null;

	const dataStr = await tds.nth(0).innerText();
	const centroCusto = await tds.nth(1).innerText();
	const favorecidoStr = await tds.nth(2).innerText();
	const valorStr = await tds.nth(4).innerText();
	const cnpjCpf = favorecidoStr.replace(/\D/g, "").substring(0, 14);
	const valorAbsoluto = Math.abs(
		parseFloat(valorStr.replace(/\./g, "").replace(",", ".")) || 0,
	);

	await tds.nth(1).click();
	await page.waitForTimeout(2000);

	await page
		.waitForSelector('[title="Visualizar documento"]', {
			state: "visible",
			timeout: 8000,
		})
		.catch(() => {});
	await page.waitForTimeout(1000);

	const documentosExtraidos = await extrairDocumentosPopupAlerj(page);
	if (valorAbsoluto <= 0 || cnpjCpf.length < 11) return null;

	return {
		cnpjCpfFornecedor: cnpjCpf,
		nomeFornecedor:
			favorecidoStr.split("\n")[0].trim() || "Fornecedor Identificado",
		tipoDespesa:
			centroCusto.split("\n")[0].trim() || "Verba de Gabinete DOCIGP",
		valorDocumento: valorAbsoluto,
		dataDocumento: dataStr.trim(),
		urlDocumento:
			documentosExtraidos.length > 0
				? documentosExtraidos[0]
				: `https://docigp.alerj.rj.gov.br/transparencia#/`,
	};
}

async function avancarProximaPaginaAlerj(
	page: any,
	sendEvent?: any,
): Promise<boolean> {
	const nextBtns = await page.locator('a[aria-label="Next"]').all();
	if (nextBtns.length === 0) return false;

	const nextBtn = nextBtns[nextBtns.length - 1];
	const parentLi = nextBtn.locator("xpath=..");

	let isEnabled = true;
	try {
		const classAttr = (await parentLi.getAttribute("class")) || "";
		if (classAttr.includes("disabled")) isEnabled = false;
	} catch {}

	if (!isEnabled) return false;

	if (sendEvent) {
		sendEvent("STATUS", {
			msg: `[OSINT ALERJ] Paginação: Indo para a próxima página de lançamentos...`,
		});
	}
	await nextBtn.click();
	await page.waitForTimeout(3000);
	return true;
}

async function varrerTabelaLancamentosAlerj(
	page: any,
	maxLimit: number,
	sendEvent?: any,
): Promise<any[]> {
	const despesas: any[] = [];
	let hasNextPage = true;

	if (sendEvent) {
		sendEvent("STATUS", {
			msg: `[OSINT ALERJ] Iniciando varredura e extração de PDFs com suporte a paginação...`,
		});
	}

	while (hasNextPage && despesas.length < maxLimit) {
		const entriesTable = page.locator("table").nth(2);
		await entriesTable
			.waitFor({ state: "visible", timeout: 10000 })
			.catch(() => {});
		const entryRows = await entriesTable.locator("tbody tr").all();

		for (let i = 0; i < entryRows.length && despesas.length < maxLimit; i++) {
			try {
				const despesa = await extrairLancamentoLinhaAlerj(
					entryRows[i],
					page,
				);
				if (despesa) {
					despesas.push(despesa);
					if (sendEvent) {
						sendEvent("STATUS", {
							msg: `[OSINT ALERJ] NF Extraída: ${despesas.length}/${maxLimit}`,
						});
					}
				}
			} catch (err) {
				console.warn(`[DOCIGP] Falha ao extrair linha de orçamento:`, err);
			}
		}

		if (despesas.length >= maxLimit) break;
		hasNextPage = await avancarProximaPaginaAlerj(page, sendEvent);
	}

	return despesas;
}

/**
 * Busca despesas reais via robô visual (Playwright) no portal DOCIGP.
 */
export async function buscarDespesasDeputadoEstadualRJ(
	nomeDeputado: string,
	sendEvent?: any,
) {
	if (sendEvent) {
		sendEvent("STATUS", {
			msg: `[OSINT ALERJ] Iniciando robô visual em 2º plano para buscar: ${nomeDeputado}...`,
		});
	}

	let browser;
	try {
		browser = await chromium.launch({ headless: true });
		const context = await browser.newContext();
		const page = await context.newPage();

		await navegarParaPerfilAlerj(page, nomeDeputado, sendEvent);
		await ajustarSelectsPaginacaoAlerj(page);
		await abrirMesMaisRecenteAlerj(page, sendEvent);
		await ajustarSelectsPaginacaoAlerj(page);

		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(2000);

		const despesas = await varrerTabelaLancamentosAlerj(page, 15, sendEvent);

		if (sendEvent) {
			sendEvent("STATUS", {
				msg: `[OSINT ALERJ] Robô visual finalizado com sucesso.`,
			});
		}
		return despesas;
	} catch (error: any) {
		console.error(`[ESTADUAL RJ] Erro no Robô Playwright: ${error?.message}`);
		if (sendEvent) {
			sendEvent("STATUS", {
				msg: `[OSINT ALERJ ALERTA] Robô visual falhou: ${error?.message}`,
			});
		}
		return [];
	} finally {
		if (browser) await browser.close();
	}
}
