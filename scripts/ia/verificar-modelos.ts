/**
 * Verificador de modelos de IA — o "canário" da IA.
 *
 * Para cada provedor com chave: lista os modelos oferecidos (/models), faz
 * uma chamada JSON mínima com cada modelo do catálogo e aponta os que
 * sumiram ou falham, além dos gratuitos novos para avaliar. Sai com código 1
 * se algum modelo do catálogo não existe mais. Ver nota 30 do Obsidian.
 *
 * Uso: npm run ia:verificar-modelos            (todos os provedores com chave)
 *      npm run ia:verificar-modelos -- groq    (só um provedor)
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { lerJsonIA } from "../../src/services/ai/gateway";
import {
	chaveDoProvedor,
	type IdProvedor,
	MODELOS,
	PROVEDORES,
	provedorAtivo,
} from "../../src/services/ai/gateway/registro";
import { chamarModelo } from "../../src/services/ai/gateway/transportes";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

interface Linha {
	provedor: string;
	modelo: string;
	estado: "OK" | "SUMIU" | "FALHA" | "JSON_INVALIDO";
	detalhe: string;
}

async function listarModelos(id: IdProvedor): Promise<{ ids: Set<string>; gratuitosNovos: string[] }> {
	const p = PROVEDORES[id];
	const chave = chaveDoProvedor(p) ?? "";
	const base = p.baseUrl(process.env) ?? "";
	const ehGemini = p.transporte === "gemini";
	const url = ehGemini ? `${base}/models?pageSize=1000` : `${base}/models`;
	const headers: Record<string, string> = ehGemini ? { "x-goog-api-key": chave } : { Authorization: `Bearer ${chave}` };
	const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status} ao listar modelos`);
	const json: any = await res.json();
	const lista: any[] = json.data ?? json.models ?? [];
	const ids = new Set(lista.map((m) => String(m.id ?? m.name ?? "").replace(/^models\//, "")));
	const doCatalogo = new Set(MODELOS.filter((m) => m.provedor === id).map((m) => m.id));
	const gratuitosNovos = lista
		.filter((m) => ehGratuito(id, m))
		.map((m) => String(m.id ?? m.name).replace(/^models\//, ""))
		.filter((m) => !doCatalogo.has(m));
	return { ids, gratuitosNovos };
}

function ehGratuito(id: IdProvedor, m: any): boolean {
	if (id === "openrouter") return m.pricing?.prompt === "0" && m.pricing?.completion === "0";
	if (id === "gemini") return (m.supportedGenerationMethods ?? []).includes("generateContent") && /flash|lite|gemma/.test(m.name ?? "");
	return true; // Groq, Cerebras etc.: o plano gratuito vale para o catálogo da conta
}

async function testarModelo(id: IdProvedor, modeloId: string): Promise<Linha> {
	const p = PROVEDORES[id];
	const modelo = MODELOS.find((m) => m.provedor === id && m.id === modeloId)!;
	const r = await chamarModelo(
		{ provedor: p, modelo, chave: chaveDoProvedor(p) ?? "", baseUrl: p.baseUrl(process.env) ?? "", fetchFn: fetch },
		{ sistema: "Responda apenas JSON.", usuario: 'Devolva exatamente {"ok": true}', formato: "json", timeoutMs: 25_000, maxTokens: 200 },
	);
	if (!r.ok) return { provedor: id, modelo: modeloId, estado: "FALHA", detalhe: r.erro ?? `HTTP ${r.status}: ${(r.corpo ?? "").slice(0, 120)}` };
	const json = lerJsonIA(r.texto) as { ok?: unknown } | null;
	return json?.ok === true
		? { provedor: id, modelo: modeloId, estado: "OK", detalhe: "JSON ok" }
		: { provedor: id, modelo: modeloId, estado: "JSON_INVALIDO", detalhe: r.texto.slice(0, 80) };
}

async function verificarProvedor(id: IdProvedor, linhas: Linha[], novos: string[]) {
	try {
		const { ids, gratuitosNovos } = await listarModelos(id);
		novos.push(...gratuitosNovos.slice(0, 15).map((m) => `${id}: ${m}`));
		for (const m of MODELOS.filter((x) => x.provedor === id)) {
			if (!ids.has(m.id)) {
				linhas.push({ provedor: id, modelo: m.id, estado: "SUMIU", detalhe: "não aparece em /models" });
				continue;
			}
			linhas.push(await testarModelo(id, m.id));
		}
	} catch (e) {
		linhas.push({ provedor: id, modelo: "*", estado: "FALHA", detalhe: (e as Error).message });
	}
}

function relatorio(linhas: Linha[], novos: string[]): string {
	const icone = { OK: "✅", SUMIU: "❌", FALHA: "⚠️", JSON_INVALIDO: "⚠️" };
	return [
		"## Verificação de modelos de IA",
		"",
		"| Estado | Provedor | Modelo | Detalhe |",
		"|---|---|---|---|",
		...linhas.map((l) => `| ${icone[l.estado]} ${l.estado} | ${l.provedor} | \`${l.modelo}\` | ${l.detalhe.replace(/\|/g, "/")} |`),
		"",
		"### Gratuitos fora do catálogo (avaliar)",
		...(novos.length ? novos.map((n) => `- ${n}`) : ["- nenhum"]),
		"",
	].join("\n");
}

async function main() {
	const filtro = process.argv.slice(2).filter((a) => !a.startsWith("--"));
	const provedores = (Object.keys(PROVEDORES) as IdProvedor[])
		.filter((id) => provedorAtivo(PROVEDORES[id]))
		.filter((id) => filtro.length === 0 || filtro.includes(id));
	console.log(`Provedores com chave: ${provedores.join(", ") || "nenhum"}`);
	const linhas: Linha[] = [];
	const novos: string[] = [];
	for (const id of provedores) await verificarProvedor(id, linhas, novos);
	const md = relatorio(linhas, novos);
	console.log(md);
	if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
	if (linhas.some((l) => l.estado === "SUMIU")) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
