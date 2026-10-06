/**
 * Canário de fontes — testa cada endpoint governamental usado pelo Polígrafo.
 *
 * Uso:
 *   npm run qa:canario                  # todas as sondas
 *   npm run qa:canario -- pncp tce      # só sondas cujo id contém "pncp" ou "tce"
 *   npm run qa:canario -- --json saida.json
 *
 * Sai com código 1 se alguma sonda crítica falhar. Escreve um resumo em
 * $GITHUB_STEP_SUMMARY quando roda no GitHub Actions.
 *
 * Ideia portada do scripts/canary_sources.py do mcp-brasil.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { linhaMarkdown } from "./canario/avaliacoes";
import { SONDAS } from "./canario/sondas";
import type { ContextoSonda, ResultadoSonda, Sonda } from "./canario/tipos";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const CONCORRENCIA = 6;

function lerArgumentos(argv: string[]) {
	const iJson = argv.indexOf("--json");
	const json = iJson >= 0 ? argv[iJson + 1] : undefined;
	const filtros = argv.filter((a, i) => !a.startsWith("--") && (iJson < 0 || i !== iJson + 1));
	return { json, filtros };
}

async function executarSonda(sonda: Sonda, ctx: ContextoSonda): Promise<ResultadoSonda> {
	const inicio = Date.now();
	const veredito = await sonda.executar(ctx).catch((e: Error) => ({
		estado: "FALHA" as const,
		detalhe: `erro inesperado: ${e.message}`,
	}));
	const { executar: _e, ...meta } = sonda;
	return { ...meta, ...veredito, ms: Date.now() - inicio };
}

async function executarTodas(sondas: Sonda[], ctx: ContextoSonda): Promise<ResultadoSonda[]> {
	const resultados: ResultadoSonda[] = new Array(sondas.length);
	let proxima = 0;
	async function trabalhador() {
		while (proxima < sondas.length) {
			const i = proxima++;
			resultados[i] = await executarSonda(sondas[i], ctx);
			const r = resultados[i];
			console.log(`[${r.estado.padEnd(6)}] ${r.id.padEnd(30)} ${r.detalhe} (${r.ms} ms)`);
		}
	}
	await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
	return resultados;
}

function resumoMarkdown(resultados: ResultadoSonda[]): string {
	const contagem = (e: string) => resultados.filter((r) => r.estado === e).length;
	const ordem = { FALHA: 0, ALERTA: 1, PULADA: 2, OK: 3 } as Record<string, number>;
	const linhas = [...resultados]
		.sort((a, b) => ordem[a.estado] - ordem[b.estado] || a.alcada.localeCompare(b.alcada))
		.map(linhaMarkdown);
	return [
		"## Canário de fontes do Polígrafo",
		"",
		`✅ ${contagem("OK")} ok · ⚠️ ${contagem("ALERTA")} alerta · ❌ ${contagem("FALHA")} falha · ⏭️ ${contagem("PULADA")} pulada`,
		"",
		"| Estado | Alçada | Fonte | Usada em | Detalhe | Tempo |",
		"|---|---|---|---|---|---|",
		...linhas,
		"",
	].join("\n");
}

async function main() {
	const { json, filtros } = lerArgumentos(process.argv.slice(2));
	const sondas = filtros.length
		? SONDAS.filter((s) => filtros.some((f) => s.id.includes(f)))
		: SONDAS;
	const ctx: ContextoSonda = { env: process.env, timeoutMs: 25_000 };

	console.log(`Canário de fontes: ${sondas.length} sonda(s)\n`);
	const resultados = await executarTodas(sondas, ctx);
	const markdown = resumoMarkdown(resultados);

	if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
	if (json) fs.writeFileSync(json, JSON.stringify(resultados, null, 2));
	console.log(`\n${markdown}`);

	const criticasFalhando = resultados.filter((r) => r.critica && r.estado === "FALHA");
	if (criticasFalhando.length) {
		console.error(`Sondas críticas falhando: ${criticasFalhando.map((r) => r.id).join(", ")}`);
		process.exit(1);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
