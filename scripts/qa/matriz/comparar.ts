/**
 * Compara duas execuções da matriz de alçadas.
 * Uso: npm run qa:matriz:comparar -- antes depois
 */
import fs from "node:fs";
import path from "node:path";
import { compararResumos, type ResumoAlvo } from "./resumo";

function ler(rotulo: string): ResumoAlvo[] {
	const arquivo = path.join(process.cwd(), ".tmp_debug", "matriz", rotulo, "resumos.json");
	return JSON.parse(fs.readFileSync(arquivo, "utf8"));
}

const [antes, depois] = process.argv.slice(2);
if (!antes || !depois) {
	console.error("Uso: npm run qa:matriz:comparar -- <rotulo-antes> <rotulo-depois>");
	process.exit(1);
}

const diffs = compararResumos(ler(antes), ler(depois));
if (diffs.length === 0) {
	console.log("Nenhuma diferença entre as execuções.");
} else {
	console.log(`| Alvo | Campo | ${antes} | ${depois} |\n|---|---|---|---|`);
	for (const d of diffs) console.log(`| ${d.id} | ${d.campo} | ${d.antes} | ${d.depois} |`);
}
