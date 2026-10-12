/**
 * Gravação de referência ("golden master") do pipe de investigação, para refatorar
 * o investigador-principal sem mudar o comportamento.
 *
 *   npm run qa:golden -- gravar      → roda cada alvo de verdade e grava TODA resposta HTTP
 *                                       (sites do governo, bancos, Receita) e os eventos SSE
 *   npm run qa:golden -- reproduzir  → roda de novo servindo as respostas gravadas (sem rede)
 *                                       e compara os eventos com os da gravação
 *   (filtros opcionais por id do alvo, como na matriz)
 *
 * Mesmo protocolo da matriz (scripts/qa/matriz): IA desligada, banco só leitura.
 * Saída em .tmp_debug/golden/<alvo>/ (fora do git: contém dados pessoais).
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { ALVOS, type AlvoMatriz } from "../matriz/alvos";
import { protegerCliente } from "../matriz/banco-somente-leitura";
import { compararEventos, type EventoGolden } from "./comparar";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
(process.env as Record<string, string>).NODE_ENV = "development";
delete process.env.POLIGRAFO_AI_IN_DEV;

const PASTA = path.join(process.cwd(), ".tmp_debug", "golden");

/** Alvos com a ref já escolhida (o golden mede a investigação, não a busca). */
const REFS: Record<string, string> = {
	"dep-federal-mg": "FEDERAL:CAMARA:209787",
	"dep-federal-sp-tse-base": "FEDERAL:CAMARA:178992",
	"dep-federal-rs-gabinete": "FEDERAL:CAMARA:160535",
	"senador-pr": "FEDERAL:SENADO:6331",
	"senador-rj": "FEDERAL:SENADO:5894",
	presidente: "PRESIDENTE:BR:Luiz Inácio Lula da Silva",
	"governador-sp": "GOVERNADOR:SP:TARCISIO GOMES DE FREITAS",
	"dep-estadual-sp": "ALESP:DEPUTADO_ESTADUAL:ANDRE%20LUIS%20DO%20PRADO:08518353840",
	"dep-estadual-rj": "ALERJ:DEPUTADO_ESTADUAL:RODRIGO%20DA%20SILVA%20BACELLAR:",
	"dep-estadual-mg": "ESTADUAL:MG:01236681665",
	"dep-estadual-go": "ESTADUAL:GO:84389028120",
	"dep-estadual-pe": "ESTADUAL:PE:02715836490",
	"dep-distrital-df": "ESTADUAL:DF:01080639179",
	"prefeito-sp-capital": "SP:PREFEITO:sao-paulo:SQ-250002098117",
	"prefeito-rj-capital": "RJ:PREFEITO:rio-de-janeiro:SQ-190002135253",
	"prefeito-niteroi": "RJ:PREFEITO:niteroi:SQ-190001901706",
	"prefeito-recife": "PE:PREFEITO:recife:SQ-170002004102",
	"vereador-rio": "RJ:VEREADOR:rio-de-janeiro:SQ-190002022914",
	"prefeito-goiania": "GO:PREFEITO:goiania:SQ-90002002544",
	"prefeito-cuiaba": "MT:PREFEITO:cuiaba:SQ-110002118922",
};

interface RespostaGravada {
	status: number;
	headers: Record<string, string>;
	corpo: string;
}

/** Chave da requisição sem o que muda a cada execução (carimbos de data e hora). */
export function chaveRequisicao(metodo: string, url: string, corpo: string): string {
	const semHora = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}(:|%3A)\d{2}(:|%3A)\d{2}(\.\d+)?(Z|%2B00(:|%3A)00|\+00:00)?/gi, "<T>");
	return `${metodo.toUpperCase()} ${semHora(url)} ${semHora(corpo)}`;
}

type Modo = "gravar" | "reproduzir";

function instalarFetch(modo: Modo, gravacoes: Map<string, RespostaGravada[]>, faltas: string[]) {
	const original = globalThis.fetch;
	const usos = new Map<string, number>();
	globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
		const req = new Request(entrada as RequestInfo, init);
		const corpo = req.body ? await req.clone().text() : "";
		const chave = chaveRequisicao(req.method, req.url, corpo);
		if (modo === "reproduzir") {
			const lista = gravacoes.get(chave);
			if (!lista?.length) {
				faltas.push(chave);
				return new Response("sem gravação", { status: 599 });
			}
			const i = usos.get(chave) ?? 0;
			usos.set(chave, i + 1);
			const r = lista[Math.min(i, lista.length - 1)];
			return new Response(r.status === 204 || r.status === 304 ? null : r.corpo, { status: r.status, headers: r.headers });
		}
		const res = await original(entrada, init);
		const texto = await res.clone().text().catch(() => "");
		const headers: Record<string, string> = {};
		res.headers.forEach((v, k) => {
			if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) headers[k] = v;
		});
		const lista = gravacoes.get(chave) ?? [];
		lista.push({ status: res.status, headers, corpo: texto });
		gravacoes.set(chave, lista);
		return res;
	}) as typeof fetch;
}

async function rodarAlvo(alvo: AlvoMatriz, ref: string): Promise<EventoGolden[]> {
	const { parseInvestigarRequest } = await import("../../../src/services/core/request-parser");
	const { executarInvestigacaoPrincipal } = await import("../../../src/services/core/investigador-principal");
	const { observarFontes } = await import("../../../src/lib/fonte-http/observador");
	const { criarOuvinteDeEtapas } = await import("../../../src/services/core/etapas-ao-vivo");
	const { criarPrazo } = await import("../../../src/lib/prazo");
	const { PRAZO_FONTES_MS } = await import("../../../src/services/core/teto-investigacao");
	// Cada alvo começa limpo: disjuntores e cache em memória de um alvo não vazam para o seguinte.
	const { reiniciarEstadoFonteHttp } = await import("../../../src/lib/fonte-http");
	reiniciarEstadoFonteHttp();
	const q = new URLSearchParams({ nome: alvo.consulta.nome ?? "", ref: decodeURIComponent(ref) });
	if (alvo.consulta.uf) q.set("uf", alvo.consulta.uf);
	const url = `http://localhost/api/investigar?${q}`;
	const parsed = parseInvestigarRequest(url) as Record<string, unknown>;
	const eventos: EventoGolden[] = [];
	let fechado = false;
	const sendEvent = (tipo: string, payload: unknown) => {
		if (!fechado) eventos.push({ tipo, payload });
	};
	await observarFontes(criarOuvinteDeEtapas(sendEvent), () => executarInvestigacaoPrincipal({
		...parsed,
		sendEvent,
		safeClose: () => {
			fechado = true;
		},
		isDev: true,
		dbSearchId: null,
		reqUrl: url,
	}), { prazo: criarPrazo(PRAZO_FONTES_MS) }).catch((e: Error) => sendEvent("ERROR", { mensagem: `exceção: ${e.message}` }));
	return eventos;
}

function lerJson<T>(arquivo: string): T {
	return JSON.parse(fs.readFileSync(arquivo, "utf8")) as T;
}

interface Rodada {
	modo: Modo;
	gravacoes: Map<string, RespostaGravada[]>;
	faltas: string[];
}

function salvarGravacao(r: Rodada, alvo: AlvoMatriz, pasta: string, eventos: EventoGolden[]): number {
	fs.writeFileSync(path.join(pasta, "http.json"), JSON.stringify(Object.fromEntries(r.gravacoes)));
	fs.writeFileSync(path.join(pasta, "eventos.json"), JSON.stringify(eventos, null, 1));
	console.log(`● ${alvo.id}: ${eventos.length} eventos, ${r.gravacoes.size} requisições gravadas`);
	return 0;
}

/** Referência: a reprodução do código antigo (mesmas respostas), não a gravação ao vivo. */
function criarReferencia(r: Rodada, alvo: AlvoMatriz, arqRef: string, eventos: EventoGolden[]): number {
	fs.writeFileSync(arqRef, JSON.stringify(eventos, null, 1));
	console.log(`● ${alvo.id}: referência criada (${eventos.length} eventos; ${r.faltas.length} requisição(ões) sem gravação)`);
	for (const f of r.faltas.slice(0, 5)) console.log(`   sem gravação: ${f.slice(0, 200)}`);
	return 0;
}

function comparar(alvo: AlvoMatriz, pasta: string, arqRef: string, eventos: EventoGolden[]): number {
	const dif = compararEventos(lerJson<EventoGolden[]>(arqRef), eventos);
	fs.writeFileSync(path.join(pasta, "ultima.json"), JSON.stringify(eventos, null, 1));
	console.log(`${dif.length ? "✗" : "✓"} ${alvo.id}: ${eventos.length} eventos${dif.length ? `\n   ${dif.slice(0, 8).join("\n   ")}` : ""}`);
	return dif.length;
}

/** Roda um alvo e devolve quantas divergências houve (0 ao gravar ou criar a referência). */
async function processarAlvo(r: Rodada, alvo: AlvoMatriz): Promise<number> {
	const pasta = path.join(PASTA, alvo.id);
	fs.mkdirSync(pasta, { recursive: true });
	r.gravacoes.clear();
	r.faltas.length = 0;
	if (r.modo === "reproduzir") {
		for (const [k, v] of Object.entries(lerJson<Record<string, RespostaGravada[]>>(path.join(pasta, "http.json")))) r.gravacoes.set(k, v);
	}
	const eventos = await rodarAlvo(alvo, REFS[alvo.id]);
	if (r.modo === "gravar") return salvarGravacao(r, alvo, pasta, eventos);
	const arqRef = path.join(pasta, "referencia.json");
	return fs.existsSync(arqRef) ? comparar(alvo, pasta, arqRef, eventos) : criarReferencia(r, alvo, arqRef, eventos);
}

async function main() {
	const [modo, ...filtros] = process.argv.slice(2) as [Modo, ...string[]];
	if (modo !== "gravar" && modo !== "reproduzir") throw new Error("Use: gravar | reproduzir [filtros]");
	const alvos = ALVOS.filter((a) => REFS[a.id] && (!filtros.length || filtros.some((f) => a.id.includes(f))));
	const r: Rodada = { modo, gravacoes: new Map(), faltas: [] };
	instalarFetch(modo, r.gravacoes, r.faltas);
	const { supabaseAdmin } = await import("../../../src/lib/supabase-admin");
	const { supabasePerfilAdmin } = await import("../../../src/lib/supabase-perfil");
	protegerCliente(supabaseAdmin as never, [] as never);
	protegerCliente(supabasePerfilAdmin as never, [] as never);
	let divergencias = 0;
	for (const alvo of alvos) divergencias += await processarAlvo(r, alvo);
	console.log(divergencias ? `\n${divergencias} divergência(s).` : "\nSem divergências.");
	process.exit(divergencias ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
