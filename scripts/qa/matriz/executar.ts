/**
 * Matriz de alçadas — roda a investigação de cada alvo de `alvos.ts`
 * chamando a mesma função da rota /api/investigar, sem IA e sem escrever
 * no banco, e salva um resumo por alvo para comparar antes/depois.
 *
 * Uso:
 *   npm run qa:matriz -- --rotulo antes            # todos os alvos
 *   npm run qa:matriz -- --rotulo depois prefeito  # só ids que contêm "prefeito"
 *   npm run qa:matriz:comparar -- antes depois
 *
 * Saída em .tmp_debug/matriz/<rotulo>/ (fora do git). `--eventos` também
 * salva os eventos brutos (contêm dados pessoais: não publicar).
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ALVOS, type AlvoMatriz } from "./alvos";
import { protegerCliente } from "./banco-somente-leitura";
import {
	type EventoCapturado,
	montarResumo,
	refDoPrimeiroCandidato,
	type ResumoAlvo,
} from "./resumo";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
// IA desligada e gravação de cache bloqueada (o pipe lê NODE_ENV).
(process.env as Record<string, string>).NODE_ENV = "development";
delete process.env.POLIGRAFO_AI_IN_DEV;

const TIMEOUT_MS = Number(process.env.MATRIZ_TIMEOUT_MS ?? 6 * 60_000);

function lerArgumentos(argv: string[]) {
	const valor = (flag: string) => {
		const i = argv.indexOf(flag);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const rotulo = valor("--rotulo") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
	const usados = new Set(["--rotulo", rotulo, "--eventos"]);
	const filtros = argv.filter((a) => !usados.has(a) && !a.startsWith("--"));
	return { rotulo, filtros, salvarEventos: argv.includes("--eventos") };
}

function montarUrl(consulta: AlvoMatriz["consulta"], ref?: string | null): string {
	const p = new URLSearchParams();
	if (consulta.nome) p.set("nome", consulta.nome);
	if (consulta.uf) p.set("uf", consulta.uf);
	if (consulta.cargo) p.set("cargo", consulta.cargo);
	const r = ref ?? consulta.ref;
	if (r) p.set("ref", r);
	return `http://localhost/api/investigar?${p.toString()}`;
}

async function rodarPipe(url: string): Promise<{ eventos: EventoCapturado[]; estourou: boolean }> {
	const { parseInvestigarRequest } = await import("../../../src/services/core/request-parser");
	const { executarInvestigacaoPrincipal } = await import("../../../src/services/core/investigador-principal");
	const parsed = parseInvestigarRequest(url) as Record<string, unknown>;
	const eventos: EventoCapturado[] = [];
	const inicio = Date.now();
	let fechado = false;
	const sendEvent = (tipo: string, payload: unknown) => {
		if (!fechado) eventos.push({ tipo, payload, ms: Date.now() - inicio });
	};
	const execucao = executarInvestigacaoPrincipal({
		...parsed,
		sendEvent,
		safeClose: () => {
			fechado = true;
		},
		isDev: true,
		dbSearchId: null,
		reqUrl: url,
	}).catch((e: Error) => sendEvent("ERROR", { mensagem: `exceção: ${e.message}` }));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const estourou = await Promise.race([
		execucao.then(() => false),
		new Promise<boolean>((r) => {
			timer = setTimeout(() => r(true), TIMEOUT_MS);
		}),
	]);
	clearTimeout(timer);
	fechado = true;
	return { eventos, estourou };
}

/** Captura console.warn/console.error durante a execução (continuam aparecendo no terminal). */
async function comLogs<T>(fn: () => Promise<T>): Promise<{ valor: T; avisos: string[] }> {
	const avisos: string[] = [];
	const originais = { warn: console.warn, error: console.error };
	const capturar = (original: (...a: unknown[]) => void) => (...args: unknown[]) => {
		avisos.push(args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
		original(...args);
	};
	console.warn = capturar(originais.warn);
	console.error = capturar(originais.error);
	try {
		return { valor: await fn(), avisos };
	} finally {
		console.warn = originais.warn;
		console.error = originais.error;
	}
}

async function rodadasDoAlvo(alvo: AlvoMatriz) {
	let ref = alvo.consulta.ref ?? null;
	let rodada = await rodarPipe(montarUrl(alvo.consulta));
	const candidatos = rodada.eventos.some((e) => e.tipo === "CANDIDATOS_ENCONTRADOS");
	if (!ref && candidatos) {
		ref = refDoPrimeiroCandidato(rodada.eventos);
		if (ref) rodada = await rodarPipe(montarUrl(alvo.consulta, ref));
	}
	return { ref, rodada };
}

async function investigarAlvo(alvo: AlvoMatriz, escritas: unknown[]) {
	const inicio = Date.now();
	const antesEscritas = escritas.length;
	const { valor, avisos } = await comLogs(() => rodadasDoAlvo(alvo));
	const { ref, rodada } = valor;
	const resumo = montarResumo(alvo, ref, rodada.eventos, {
		duracaoMs: Date.now() - inicio,
		estourou: rodada.estourou,
		escritasBloqueadas: escritas.length - antesEscritas,
		avisos,
	});
	return { resumo, eventos: rodada.eventos };
}

function linha(r: ResumoAlvo): string {
	const id = r.identidade;
	const cargo = id ? `${id.cargo}${id.cargoCorreto ? "" : " ✗"}` : "—";
	const totalNos = Object.values(r.nos).reduce((a, b) => a + b, 0);
	const sentinelas = Object.values(r.sentinelas).reduce((a, b) => a + b, 0);
	return `| ${r.id} | ${r.terminou} | ${cargo} | ${id?.documento ?? "—"} | ${totalNos} | ${sentinelas} | ${(r.duracaoMs / 1000).toFixed(0)} s | ${r.erros[0] ?? ""} |`;
}

async function main() {
	const { rotulo, filtros, salvarEventos } = lerArgumentos(process.argv.slice(2));
	const alvos = filtros.length ? ALVOS.filter((a) => filtros.some((f) => a.id.includes(f))) : ALVOS;
	const pasta = path.join(process.cwd(), ".tmp_debug", "matriz", rotulo);
	fs.mkdirSync(pasta, { recursive: true });

	const escritas: unknown[] = [];
	const { supabaseAdmin } = await import("../../../src/lib/supabase-admin");
	const { supabasePerfilAdmin } = await import("../../../src/lib/supabase-perfil");
	protegerCliente(supabaseAdmin as never, escritas as never);
	protegerCliente(supabasePerfilAdmin as never, escritas as never);

	const resumos: ResumoAlvo[] = [];
	for (const alvo of alvos) {
		console.log(`\n▶ ${alvo.id} — ${alvo.descricao}`);
		const { resumo, eventos } = await investigarAlvo(alvo, escritas);
		resumos.push(resumo);
		// Salva a cada alvo: uma execução interrompida não perde o que já rodou.
		fs.writeFileSync(path.join(pasta, "resumos.json"), JSON.stringify(resumos, null, 2));
		if (salvarEventos) fs.writeFileSync(path.join(pasta, `${alvo.id}.eventos.json`), JSON.stringify(eventos, null, 1));
		console.log(`  ${resumo.terminou} · cargo=${resumo.identidade?.cargo ?? "—"} · nós=${JSON.stringify(resumo.nos)}`);
		console.log(`  achados=${JSON.stringify(resumo.achados)} · avisos no console=${resumo.logs.avisosConsole}`);
	}

	fs.writeFileSync(path.join(pasta, "resumos.json"), JSON.stringify(resumos, null, 2));
	const tabela = [
		`## Matriz de alçadas — ${rotulo}`,
		"",
		"| Alvo | Fim | Cargo no nó | Documento | Nós | Sentinelas | Tempo | Primeiro erro |",
		"|---|---|---|---|---|---|---|---|",
		...resumos.map(linha),
	].join("\n");
	fs.writeFileSync(path.join(pasta, "resumo.md"), tabela);
	console.log(`\n${tabela}\n\nSalvo em ${pasta}`);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
