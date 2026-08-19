/**
 * Polígrafo Doctor — Ferramenta de Diagnóstico de Ambiente para Desenvolvedores
 * 
 * Executa uma bateria de verificações no ambiente local para garantir
 * que todas as dependências, variáveis e conexões estejam prontas para desenvolvimento.
 * 
 * Uso: npm run doctor
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Carrega .env.local
const envLocalPath = path.join(process.cwd(), ".env.local");
const hasEnvLocal = fs.existsSync(envLocalPath);

if (hasEnvLocal) {
	dotenv.config({ path: envLocalPath });
}

console.log("\n========================================================");
console.log("🕵️‍♂️  POLÍGRAFO DOCTOR — DIAGNÓSTICO DE AMBIENTE & DX");
console.log("========================================================\n");

let warnings = 0;
let errors = 0;

// 1. Versão do Node.js
const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split(".")[0], 10);
if (majorVersion >= 20) {
	console.log(`✅ [NODE.JS] Versão v${nodeVersion} detectada (Requisito: >= 20.0.0).`);
} else {
	console.log(`❌ [NODE.JS] Versão v${nodeVersion} incompatível! O Polígrafo requer Node.js >= 20.0.0.`);
	errors++;
}

// 2. Arquivo .env.local
if (hasEnvLocal) {
	console.log("✅ [.ENV.LOCAL] Arquivo .env.local encontrado.");
} else {
	console.log("❌ [.ENV.LOCAL] Arquivo .env.local NÃO encontrado! Copie o .env.example: cp .env.example .env.local");
	errors++;
}

// 3. Credenciais do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseAnon && supabaseService) {
	console.log("✅ [SUPABASE] Credenciais essenciais configuradas (URL, Anon Key, Service Role).");
} else {
	console.log("⚠️  [SUPABASE] Credenciais ausentes no .env.local:");
	if (!supabaseUrl) console.log("   - NEXT_PUBLIC_SUPABASE_URL está vazia");
	if (!supabaseAnon) console.log("   - NEXT_PUBLIC_SUPABASE_ANON_KEY está vazia");
	if (!supabaseService) console.log("   - SUPABASE_SERVICE_ROLE_KEY está vazia");
	console.log("   💡 Sem Supabase, o sistema usará fallback para APIs externas (sem cache/dashboard).");
	warnings++;
}

// 4. Motores de Inteligência Artificial (Cascata L1 -> L4)
const hasGroq = !!process.env.GROQ_API_KEY;
const hasGemini = !!process.env.GEMINI_API_KEY;
const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

if (hasGroq || hasGemini || hasOpenRouter) {
	const activeKeys = [];
	if (hasGroq) activeKeys.push("Groq (L1)");
	if (hasOpenRouter) activeKeys.push("OpenRouter (L2)");
	if (hasGemini) activeKeys.push("Gemini (L3)");
	console.log(`✅ [IA CASCATA] Motores configurados: ${activeKeys.join(", ")}.`);
} else {
	console.log("ℹ️  [IA CASCATA] Nenhuma chave de IA configurada. O Polígrafo operará no modo Heurística Matemática Local (L4).");
}

// 5. Chaves Governamentais Opcionais
const hasTransparencia = !!process.env.TRANSPARENCIA_API_KEY;
const hasDatajud = !!process.env.DATAJUD_API_KEY;

if (hasTransparencia && hasDatajud) {
	console.log("✅ [APIS GOV] CGU (Transparência) e CNJ (DataJud) configurados.");
} else {
	const missing = [];
	if (!hasTransparencia) missing.push("TRANSPARENCIA_API_KEY (Emendas PIX / Sanções / Convênios)");
	if (!hasDatajud) missing.push("DATAJUD_API_KEY (Processos de Improbidade)");
	console.log(`ℹ️  [APIS GOV] Chaves opcionais ausentes: ${missing.join(", ")}.`);
}

// 6. Índice Local de Parlamentares
const indexPath = path.join(process.cwd(), "src/services/integrations/data/congresso-index.json");
if (fs.existsSync(indexPath)) {
	try {
		const indexData = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
		console.log(`✅ [ÍNDICE CONGRESSO] Base local indexada com ${indexData.length} parlamentares.`);
	} catch {
		console.log("⚠️  [ÍNDICE CONGRESSO] Arquivo congresso-index.json corrompido. Rode: npm run update:index");
		warnings++;
	}
} else {
	console.log("⚠️  [ÍNDICE CONGRESSO] congresso-index.json ausente. Rode: npm run update:index");
	warnings++;
}

console.log("\n--------------------------------------------------------");
if (errors === 0 && warnings === 0) {
	console.log("🎉 AMBIENTE 100% PRONTO! Você pode rodar 'npm run dev' e começar a programar.");
} else if (errors === 0) {
	console.log(`✨ AMBIENTE OPERACIONAL com ${warnings} aviso(s) opcionais.`);
	console.log("   Você pode rodar 'npm run dev' normalmente.");
} else {
	console.log(`🚨 FORAM ENCONTRADOS ${errors} ERRO(S) CRÍTICO(S) no ambiente.`);
	console.log("   Por favor, corrija os itens marcados com ❌ acima antes de iniciar.");
}
console.log("========================================================\n");
