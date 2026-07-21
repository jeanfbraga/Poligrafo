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
	const normalizar = (s: string) =>
		s
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]/g, " ")
			.trim();
	const termoNorm = normalizar(nomeDeputado);
	const palavrasBusca = termoNorm.split(" ").filter((p) => p.length > 2);

	try {
		// O DOCIGP tem ~136 parlamentares (políticos e ex-políticos), ~7 páginas de 20.
		for (let page = 1; page <= 8; page++) {
			if (sendEvent) {
				sendEvent("STATUS", {
					msg: `Buscando dossiê no DOCIGP da ALERJ (página ${page} de 8)...`,
				});
			}
			try {
				const res = await fetch(`${DOCIGP_BASE}/congressmen?page=${page}`, {
					headers: { Accept: "application/json" },
					signal: AbortSignal.timeout(60000),
				});

				if (!res.ok) continue;

				const json = await res.json();
				const data = json.rows || json.data || [];

				const match = data.find((c: any) => {
					const nNorm = normalizar(c.name || "");
					const nickNorm = normalizar(c.nickname || "");

					if (
						nNorm.includes(termoNorm) ||
						nickNorm.includes(termoNorm) ||
						termoNorm.includes(nNorm) ||
						termoNorm.includes(nickNorm)
					)
						return true;

					const palavrasDocigp = nNorm.split(" ").filter((p) => p.length > 2);
					if (palavrasBusca.length >= 2 && palavrasDocigp.length >= 2) {
						const primeiroBusca = palavrasBusca[0];
						const ultimoBusca = palavrasBusca[palavrasBusca.length - 1];
						if (
							palavrasDocigp.includes(primeiroBusca) &&
							palavrasDocigp.includes(ultimoBusca)
						)
							return true;
					}
					return false;
				});

				if (match) {
					const foto =
						match.photo_url_linkable || match.thumbnail_url_linkable || "";
					if (sendEvent) {
						sendEvent("STATUS", {
							msg: `Dossiê encontrado no DOCIGP! (ID: ${match.id})`,
						});
					}
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
			} catch (pageError: any) {
				console.error(`[DOCIGP] Erro na página ${page}: ${pageError?.message}`);
				// Ignora o erro da página e tenta a próxima
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

/**
 * Busca despesas reais via robô visual (Playwright) no portal DOCIGP.
 */
export async function buscarDespesasDeputadoEstadualRJ(
	nomeDeputado: string,
	sendEvent?: any,
) {
	const despesasExtraidas: any[] = [];

	if (sendEvent)
		sendEvent("STATUS", {
			msg: `[OSINT ALERJ] Iniciando robô visual em 2º plano para buscar: ${nomeDeputado}...`,
		});

	let browser;
	try {
		browser = await chromium.launch({ headless: true }); // headless: true para não travar o servidor NextJS
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto("https://docigp.alerj.rj.gov.br/transparencia#/", {
			waitUntil: "load",
			timeout: 60000,
		});

		if (sendEvent)
			sendEvent("STATUS", {
				msg: `[OSINT ALERJ] Acessado portal da transparência. Buscando perfil...`,
			});

		// Digita na busca
		const searchInput = page
			.locator('input[type="search"], input[placeholder*="usca"], input')
			.first();
		await searchInput.fill(nomeDeputado);
		await searchInput.press("Enter");
		await page.waitForTimeout(3000);

		// Pega o primeiro nome para clicar, o ideal é pegar o sobrenome principal
		const lastName = nomeDeputado.split(" ").pop() || nomeDeputado;
		const nameRow = page
			.locator(`tr.cursor-pointer:has-text("${lastName}")`)
			.first();

		await nameRow.click();
		await page.waitForTimeout(4000);

		if (sendEvent)
			sendEvent("STATUS", {
				msg: `[OSINT ALERJ] Dossiê encontrado. Carregando documentos...`,
			});

		// Tenta expandir a paginação de todos os selects disponíveis na página para 250
		const selects = await page.locator("select").all();
		for (const s of selects) {
			try {
				const options = await s.locator("option").allInnerTexts();
				const maxOption =
					options.find(
						(o) =>
							o.includes("250") || o.includes("100") || o.includes("Todos"),
					) || options[options.length - 1];
				await s.selectOption({ label: maxOption.trim() });
				await page.waitForTimeout(500);
			} catch (_e) {}
		}

		// Clica no primeiro mês disponível na grid principal
		const firstMonthCell = page
			.getByRole("cell", { name: /\d{4} \/ \d{2}/ })
			.first();
		await firstMonthCell.click();
		await page.waitForTimeout(3000);

		if (sendEvent)
			sendEvent("STATUS", {
				msg: `[OSINT ALERJ] Mês mais recente aberto. Buscando Lançamentos...`,
			});

		// Tenta expandir paginação novamente (caso a nova tabela gerou novos selects)
		const selectsAfter = await page.locator("select").all();
		for (const s of selectsAfter) {
			try {
				const options = await s.locator("option").allInnerTexts();
				const maxOption =
					options.find(
						(o) =>
							o.includes("250") || o.includes("100") || o.includes("Todos"),
					) || options[options.length - 1];
				await s.selectOption({ label: maxOption.trim() });
				await page.waitForTimeout(500);
			} catch (_e) {}
		}

		// Rolagem
		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		await page.waitForTimeout(2000);

		// A tabela de Lançamentos é a terceira no DOM (Tabela 2, 0-indexed)
		const maxProcessLimit = 15; // Aumentado para explorar a paginação
		let processedCount = 0;
		let hasNextPage = true;

		if (sendEvent)
			sendEvent("STATUS", {
				msg: `[OSINT ALERJ] Iniciando varredura e extração de PDFs com suporte a paginação...`,
			});

		while (hasNextPage && processedCount < maxProcessLimit) {
			const entriesTable = page.locator("table").nth(2);
			await entriesTable
				.waitFor({ state: "visible", timeout: 10000 })
				.catch(() => {});
			const entryRows = await entriesTable.locator("tbody tr").all();

			for (
				let i = 0;
				i < entryRows.length && processedCount < maxProcessLimit;
				i++
			) {
				try {
					const tr = entryRows[i];
					const tds = tr.locator("td");
					const count = await tds.count();
					if (count < 4) continue;

					const docsCountStr = await tds.nth(3).innerText();
					const docsCount = parseInt(docsCountStr.trim() || "0", 10);

					if (docsCount > 0) {
						const dataStr = await tds.nth(0).innerText();
						const centroCusto = await tds.nth(1).innerText();
						const favorecidoStr = await tds.nth(2).innerText();
						const valorStr = await tds.nth(4).innerText();
						const cnpjCpf = favorecidoStr.replace(/\D/g, "").substring(0, 14);
						const valorAbsoluto = Math.abs(
							parseFloat(valorStr.replace(/\./g, "").replace(",", ".")) || 0,
						);

						// Clica na segunda célula (Objeto) para abrir a tabela de Notas Fiscais
						await tds.nth(1).click();
						await page.waitForTimeout(2000);

						// Aguarda os botões de visualizar documento carregarem
						await page
							.waitForSelector('[title="Visualizar documento"]', {
								state: "visible",
								timeout: 8000,
							})
							.catch(() => {});
						await page.waitForTimeout(1000);

						// Busca botões ou links específicos
						const visualizacaoNodes = await page
							.locator('[title="Visualizar documento"]')
							.all();
						const documentosExtraidos = [];

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
							} catch (_e) {}
						}

						if (valorAbsoluto > 0 && cnpjCpf.length >= 11) {
							despesasExtraidas.push({
								cnpjCpfFornecedor: cnpjCpf,
								nomeFornecedor:
									favorecidoStr.split("\n")[0].trim() ||
									"Fornecedor Identificado",
								tipoDespesa:
									centroCusto.split("\n")[0].trim() ||
									"Verba de Gabinete DOCIGP",
								valorDocumento: valorAbsoluto,
								dataDocumento: dataStr.trim(),
								urlDocumento:
									documentosExtraidos.length > 0
										? documentosExtraidos[0]
										: `https://docigp.alerj.rj.gov.br/transparencia#/`,
							});
							processedCount++;
							if (sendEvent)
								sendEvent("STATUS", {
									msg: `[OSINT ALERJ] NF Extraída: ${documentosExtraidos.length} docs (${processedCount}/${maxProcessLimit})`,
								});
						}
					}
				} catch (err) {
					console.warn(`[DOCIGP] Falha ao extrair linha de orçamento:`, err);
				}
			}

			if (processedCount >= maxProcessLimit) break;

			// Busca os botões de paginação Next. Como a Tabela de Lançamentos é a última expandida no fluxo principal,
			// seu botão Next deve ser o último da página (excluindo qualquer modal de NF, se houvesse, mas os popups tão em nova aba)
			const nextBtns = await page.locator('a[aria-label="Next"]').all();
			if (nextBtns.length > 0) {
				// Pega o último botão Next que representa a tabela atual expandida
				const nextBtn = nextBtns[nextBtns.length - 1];
				const parentLi = nextBtn.locator("xpath=..");

				let isEnabled = true;
				try {
					const classAttr = (await parentLi.getAttribute("class")) || "";
					if (classAttr.includes("disabled")) isEnabled = false;
				} catch (_e) {}

				if (isEnabled) {
					if (sendEvent)
						sendEvent("STATUS", {
							msg: `[OSINT ALERJ] Paginação: Indo para a próxima página de lançamentos...`,
						});
					await nextBtn.click();
					await page.waitForTimeout(3000);
				} else {
					hasNextPage = false;
				}
			} else {
				hasNextPage = false;
			}
		}

		if (sendEvent)
			sendEvent("STATUS", {
				msg: `[OSINT ALERJ] Robô visual finalizado com sucesso.`,
			});
	} catch (error: any) {
		console.error(`[ESTADUAL RJ] Erro no Robô Playwright: ${error?.message}`);
		if (sendEvent)
			sendEvent("STATUS", {
				msg: `[OSINT ALERJ ALERTA] Robô visual falhou: ${error?.message}`,
			});
	} finally {
		if (browser) await browser.close();
	}

	return despesasExtraidas;
}
