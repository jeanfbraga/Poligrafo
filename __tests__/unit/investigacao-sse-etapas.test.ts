import { describe, expect, it } from "vitest";
import {
	calcularProgresso,
	ETAPAS_INICIAIS,
	fonteDaMensagem,
	formatarRelogio,
	marcarConcluida,
	registrarStatus,
	resumirEtapas,
	statusDaFonte,
} from "@/lib/investigacao/etapas";
import { consumirSse, parseSseBuffer, parseSseResiduo } from "@/lib/investigacao/sse";

const bloco = (tipo: string, payload: unknown) => `data: ${JSON.stringify({ tipo, payload })}\n\n`;

describe("parseSseBuffer", () => {
	it("extrai eventos completos e devolve o fragmento incompleto", () => {
		const buf = bloco("STATUS", { msg: "a" }) + bloco("DONE", {}) + 'data: {"tipo":"NO';
		const { events, rest } = parseSseBuffer(buf);
		expect(events.map((e) => e.tipo)).toEqual(["STATUS", "DONE"]);
		expect(rest).toBe('data: {"tipo":"NO');
	});

	it("ignora blocos sem prefixo data: e JSON inválido", () => {
		const { events } = parseSseBuffer(`: keep-alive\n\ndata: {nao-json}\n\n${bloco("STATUS", { msg: "x" })}`);
		expect(events).toHaveLength(1);
	});

	it("ignora JSON válido sem o campo tipo", () => {
		const { events } = parseSseBuffer('data: {"foo":1}\n\n');
		expect(events).toEqual([]);
	});

	it("buffer vazio não gera eventos", () => {
		expect(parseSseBuffer("")).toEqual({ events: [], rest: "" });
	});
});

describe("parseSseResiduo", () => {
	it("aproveita um evento final sem \\n\\n", () => {
		const r = parseSseResiduo('data: {"tipo":"DONE","payload":{}}');
		expect(r).toHaveLength(1);
		expect(r[0].tipo).toBe("DONE");
	});

	it("resíduo em branco não gera nada", () => {
		expect(parseSseResiduo("   ")).toEqual([]);
	});
});

describe("consumirSse", () => {
	it("lê eventos divididos em vários chunks", async () => {
		const enc = new TextEncoder();
		const texto = bloco("STATUS", { msg: "um" }) + bloco("DONE", { msg: "fim" });
		const meio = Math.floor(texto.length / 2);
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(enc.encode(texto.slice(0, meio)));
				controller.enqueue(enc.encode(texto.slice(meio)));
				controller.close();
			},
		});
		const tipos: string[] = [];
		await consumirSse(new Response(stream), (e) => tipos.push(e.tipo));
		expect(tipos).toEqual(["STATUS", "DONE"]);
	});

	it("rejeita quando não há body", async () => {
		await expect(consumirSse(new Response(null), () => {})).rejects.toThrow(/stream/i);
	});
});

describe("fonteDaMensagem — classificação dos STATUS reais", () => {
	const casos: [string, string | null][] = [
		["Aguardando resposta dos servidores da Câmara dos Deputados...", "casa"],
		["Puxando financiadores de campanha no TSE...", "tse"],
		["Extraindo dados complementares e patrimônio na base eleitoral do TSE...", "tse"],
		["Analisando faturas de Cartão de Pagamento do Governo Federal (CPGF)...", "cgu"],
		["Expandindo malha societária via BrasilAPI para rastrear blindagem patrimonial...", "receita"],
		["Rastreando emendas parlamentares em todas as legislaturas disponíveis...", "emendas"],
		["Cruzando Financiadores no Portal Nacional de Contratações (PNCP)...", "pncp"],
		["Investigando doador CNPJ 123 no Compras.gov...", "pncp"],
		["[TCE-PA] Foram encontrados 3 Acórdão(s)", "tribunais"],
		["Consultando certidões unificadas no TCU para empresas...", "tribunais"],
		["Varrendo Registro Aeronáutico Brasileiro (ANAC/RAB)...", "complementares"],
		["Consultando financiamentos do BNDES...", "complementares"],
		["[POLÍGRAFO IA] Operando Triagem Documental e Cruzamento Geográfico...", "ia"],
		["Auditando proposições com API Groq/Gemini L1...", "ia"],
		["Executando matemática avançada de grafos...", "ia"],
		["Dossiê finalizado e entregue.", null],
		["Sincronizando log final com a base de inteligência...", null],
	];
	it.each(casos)("%s → %s", (msg, esperado) => {
		expect(fonteDaMensagem(msg)).toBe(esperado);
	});
});

describe("etapas por fonte", () => {
	const reg = (...msgs: string[]) => msgs.reduce(registrarStatus, ETAPAS_INICIAIS);

	it("estado inicial: tudo aguardando, progresso 0", () => {
		expect(statusDaFonte(ETAPAS_INICIAIS, "tse", true)).toBe("wait");
		expect(calcularProgresso(ETAPAS_INICIAIS, true)).toBe(0);
	});

	it("a fonte da última mensagem está consultando e as anteriores ok", () => {
		const s = reg("Aguardando resposta dos servidores da Câmara", "Puxando financiadores de campanha no TSE...");
		expect(statusDaFonte(s, "casa", true)).toBe("ok");
		expect(statusDaFonte(s, "tse", true)).toBe("run");
		expect(statusDaFonte(s, "pncp", true)).toBe("wait");
	});

	it("mensagem de lentidão marca a fonte como slow", () => {
		const s = reg("A API oficial da Câmara está lenta hoje, forçando a conexão...");
		expect(statusDaFonte(s, "casa", true)).toBe("slow");
	});

	it("quando a IA começa, fontes nunca vistas viram 'não se aplica'", () => {
		const s = reg("Puxando financiadores de campanha no TSE...", "[POLÍGRAFO IA] Operando Triagem");
		expect(statusDaFonte(s, "diarios", true)).toBe("na");
		expect(statusDaFonte(s, "tse", true)).toBe("ok");
		expect(statusDaFonte(s, "ia", true)).toBe("run");
	});

	it("mensagens sem fonte não alteram o estado", () => {
		expect(registrarStatus(ETAPAS_INICIAIS, "Dossiê finalizado e entregue.")).toBe(ETAPAS_INICIAIS);
	});

	it("o progresso não regride quando uma fonte é revisitada", () => {
		const a = reg("Aguardando resposta da Câmara", "Puxando financiadores de campanha no TSE...", "Rastreando emendas parlamentares...");
		const antes = calcularProgresso(a, true);
		const b = registrarStatus(a, "Extraindo gastos da Cota de Gabinete para a malha...");
		expect(calcularProgresso(b, true)).toBeGreaterThanOrEqual(antes);
	});

	it("só chega a 100% quando concluída; antes disso fica abaixo", () => {
		const s = reg(
			"Aguardando resposta da Câmara",
			"Puxando financiadores de campanha no TSE...",
			"[POLÍGRAFO IA] Operando Triagem",
		);
		expect(calcularProgresso(s, true)).toBeLessThan(100);
		expect(calcularProgresso(marcarConcluida(s), true)).toBe(100);
	});

	it("concluída: vistas ok, nunca vistas 'na'", () => {
		const s = marcarConcluida(reg("Puxando financiadores de campanha no TSE..."));
		expect(statusDaFonte(s, "tse", false)).toBe("ok");
		expect(statusDaFonte(s, "diarios", false)).toBe("na");
	});

	it("interrompida: a fonte atual vira 'cut', as vistas ficam ok e as outras 'cut'", () => {
		const s = reg("Aguardando resposta da Câmara", "Puxando financiadores de campanha no TSE...");
		expect(statusDaFonte(s, "casa", false)).toBe("ok");
		expect(statusDaFonte(s, "tse", false)).toBe("cut");
		expect(statusDaFonte(s, "pncp", false)).toBe("cut");
	});

	it("resumirEtapas conta concluídas e aplicáveis", () => {
		const s = marcarConcluida(reg("Aguardando resposta da Câmara", "Puxando financiadores de campanha no TSE..."));
		const r = resumirEtapas(s, false);
		expect(r.concluidas).toBe(2);
		expect(r.aplicaveis).toBe(2);
		expect(r.total).toBe(10);
	});
});

describe("formatarRelogio", () => {
	it("formata mm:ss", () => {
		expect(formatarRelogio(0)).toBe("00:00");
		expect(formatarRelogio(65.9)).toBe("01:05");
		expect(formatarRelogio(3600)).toBe("60:00");
	});

	it("valores negativos viram 00:00", () => {
		expect(formatarRelogio(-3)).toBe("00:00");
	});
});
