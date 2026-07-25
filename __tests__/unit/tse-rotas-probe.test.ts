/**
 * Teste de Probe Autônomo — Rotas do TSE
 *
 * Objetivo: descobrir quais rotas da API do TSE estão acessíveis
 * e quais estão bloqueadas pelo WAF (retornando HTML em vez de JSON).
 *
 * Este teste faz chamadas REAIS à internet — não roda no CI.
 * Execute manualmente com: npx vitest run __tests__/unit/tse-rotas-probe.test.ts
 */

import { describe, it, expect } from "vitest";

const TIMEOUT = 15000;

// Bibo Nunes (RS) — Deputado Federal conhecido
const CANDIDATO_ID = "210001648587";
const UF = "RS";
const CARGO = "6"; // Deputado Federal
const ID_ELEICAO = "2040602022";
const ANO = "2022";

// User-Agents para testar
const UA_CHROME_120 =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const UA_CHROME_126 =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const UA_CHROME_128 =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.120 Safari/537.36";

const HEADERS_BASE = {
	Accept: "application/json, text/plain, */*",
	"Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
	Referer: "https://divulgacandcontas.tse.jus.br/divulga/",
	"Sec-Fetch-Dest": "empty",
	"Sec-Fetch-Mode": "cors",
	"Sec-Fetch-Site": "same-origin",
	Connection: "keep-alive",
};

async function probeURL(url: string, userAgent: string, label: string) {
	console.log(`\n[PROBE] ${label}`);
	console.log(`  URL: ${url}`);
	console.log(`  UA: ${userAgent.substring(userAgent.indexOf("Chrome/"), userAgent.indexOf("Chrome/") + 15)}`);

	try {
		const res = await fetch(url, {
			headers: {
				...HEADERS_BASE,
				"User-Agent": userAgent,
			},
			signal: AbortSignal.timeout(TIMEOUT),
		});

		console.log(`  HTTP Status: ${res.status}`);
		console.log(`  Content-Type: ${res.headers.get("content-type")}`);

		const contentType = res.headers.get("content-type") || "";
		const isJson = contentType.includes("application/json");

		if (!res.ok) {
			const body = await res.text();
			console.log(`  Body (primeiros 200 chars): ${body.substring(0, 200)}`);
			return { status: res.status, isJson, data: null, blocked: true };
		}

		if (isJson) {
			const data = await res.json();
			const keys = Object.keys(data);
			console.log(`  ✅ JSON válido! Keys: [${keys.join(", ")}]`);
			if (data.rankingDoadores) {
				console.log(`  📊 rankingDoadores: ${data.rankingDoadores.length} itens`);
			}
			if (data.candidatos) {
				console.log(`  📊 candidatos: ${data.candidatos.length} itens`);
			}
			return { status: res.status, isJson: true, data, blocked: false };
		} else {
			const text = await res.text();
			console.log(`  ❌ Resposta NÃO-JSON (WAF/HTML). Primeiros 300 chars:`);
			console.log(`  ${text.substring(0, 300)}`);
			return { status: res.status, isJson: false, data: null, blocked: true };
		}
	} catch (err: any) {
		console.log(`  ❌ ERRO: ${err.name}: ${err.message}`);
		return { status: 0, isJson: false, data: null, blocked: true, error: err.message };
	}
}

describe("TSE API Routes Probe — Detecção de WAF", () => {
	// =============================================
	// ROTA 1: Listagem de Candidatos (usada no buscarCpfNoTSE)
	// =============================================
	it("Rota 1: /candidatura/listar — deve retornar JSON", async () => {
		const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${ANO}/${UF}/${ID_ELEICAO}/${CARGO}/candidatos`;
		const result = await probeURL(url, UA_CHROME_126, "Rota 1: Listagem de Candidatos");
		expect(result.status).toBe(200);
		// Não faz assert de JSON pois queremos VER o resultado mesmo se falhar
	}, TIMEOUT + 5000);

	// =============================================
	// ROTA 2: Prestador/Consulta (a rota que está bloqueando — ranking de doadores)
	// =============================================
	it("Rota 2a: /prestador/consulta — Chrome 120 (UA atual)", async () => {
		const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta/${ID_ELEICAO}/${ANO}/${UF}/${CARGO}/90/90/${CANDIDATO_ID}`;
		const result = await probeURL(url, UA_CHROME_120, "Rota 2a: Prestador/Consulta (Chrome 120)");
		console.log(`  Resultado: ${result.blocked ? "BLOQUEADO" : "LIVRE"}`);
	}, TIMEOUT + 5000);

	it("Rota 2b: /prestador/consulta — Chrome 126 (UA atualizado)", async () => {
		const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta/${ID_ELEICAO}/${ANO}/${UF}/${CARGO}/90/90/${CANDIDATO_ID}`;
		const result = await probeURL(url, UA_CHROME_126, "Rota 2b: Prestador/Consulta (Chrome 126)");
		console.log(`  Resultado: ${result.blocked ? "BLOQUEADO" : "LIVRE"}`);
	}, TIMEOUT + 5000);

	it("Rota 2c: /prestador/consulta — Chrome 128 (UA mais recente)", async () => {
		const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta/${ID_ELEICAO}/${ANO}/${UF}/${CARGO}/90/90/${CANDIDATO_ID}`;
		const result = await probeURL(url, UA_CHROME_128, "Rota 2c: Prestador/Consulta (Chrome 128)");
		console.log(`  Resultado: ${result.blocked ? "BLOQUEADO" : "LIVRE"}`);
	}, TIMEOUT + 5000);

	// =============================================
	// ROTA 3: Receitas do Candidato (rota alternativa para doadores)
	// =============================================
	it("Rota 3: /prestador/receitas — rota alternativa de receitas", async () => {
		const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta/receitas/${ID_ELEICAO}/${ANO}/${UF}/${CARGO}/90/90/${CANDIDATO_ID}`;
		const result = await probeURL(url, UA_CHROME_126, "Rota 3: Receitas do Candidato");
		console.log(`  Resultado: ${result.blocked ? "BLOQUEADO" : "LIVRE"}`);
	}, TIMEOUT + 5000);

	// =============================================
	// ROTA 4: Busca direta por detalhes do candidato (a que funciona)
	// =============================================
	it("Rota 4: /candidatura/buscar — detalhes do candidato", async () => {
		const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${UF}/2/${ID_ELEICAO}/candidato`;
		const result = await probeURL(url, UA_CHROME_126, "Rota 4: Busca de Candidato");
		console.log(`  Resultado: ${result.blocked ? "BLOQUEADO" : "LIVRE"}`);
	}, TIMEOUT + 5000);

	// =============================================
	// ROTA 5: Resumo financeiro do candidato (alternativa potencial)
	// =============================================
	it("Rota 5: /prestador/consulta/totalRecebido — resumo financeiro", async () => {
		const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta/totalRecebido/${ID_ELEICAO}/${ANO}/${UF}/${CARGO}/90/90/${CANDIDATO_ID}`;
		const result = await probeURL(url, UA_CHROME_126, "Rota 5: Total Recebido");
		console.log(`  Resultado: ${result.blocked ? "BLOQUEADO" : "LIVRE"}`);
	}, TIMEOUT + 5000);

	// =============================================
	// ROTA 6: Dados Abertos TSE (repositório estático — sem WAF)
	// =============================================
	it("Rota 6: Dados Abertos TSE — CSV header check", async () => {
		const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2022.zip`;
		console.log(`\n[PROBE] Rota 6: Dados Abertos TSE (HEAD request)`);
		console.log(`  URL: ${url}`);
		try {
			const res = await fetch(url, {
				method: "HEAD",
				signal: AbortSignal.timeout(TIMEOUT),
			});
			console.log(`  HTTP Status: ${res.status}`);
			console.log(`  Content-Type: ${res.headers.get("content-type")}`);
			console.log(`  Content-Length: ${res.headers.get("content-length")} bytes`);
			console.log(`  ✅ Dados Abertos acessíveis (sem WAF)`);
		} catch (err: any) {
			console.log(`  ❌ ERRO: ${err.message}`);
		}
	}, TIMEOUT + 5000);

	// =============================================
	// ROTA 7: Sem Referer / Sem headers extras (fingerprint mínimo)
	// =============================================
	it("Rota 7: /prestador/consulta — SEM Referer (fingerprint mínimo)", async () => {
		const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta/${ID_ELEICAO}/${ANO}/${UF}/${CARGO}/90/90/${CANDIDATO_ID}`;
		console.log(`\n[PROBE] Rota 7: Prestador SEM headers Sec-Fetch`);
		try {
			const res = await fetch(url, {
				headers: {
					"User-Agent": UA_CHROME_128,
					Accept: "application/json",
				},
				signal: AbortSignal.timeout(TIMEOUT),
			});
			const ct = res.headers.get("content-type") || "";
			console.log(`  HTTP Status: ${res.status}`);
			console.log(`  Content-Type: ${ct}`);
			if (ct.includes("json")) {
				const data = await res.json();
				console.log(`  ✅ JSON válido! Keys: [${Object.keys(data).join(", ")}]`);
			} else {
				const text = await res.text();
				console.log(`  ❌ NÃO-JSON: ${text.substring(0, 200)}`);
			}
		} catch (err: any) {
			console.log(`  ❌ ERRO: ${err.message}`);
		}
	}, TIMEOUT + 5000);
});
