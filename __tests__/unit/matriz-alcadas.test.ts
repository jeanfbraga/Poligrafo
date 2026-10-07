import { describe, expect, it } from "vitest";
import { ALVOS } from "../../scripts/qa/matriz/alvos";
import { protegerCliente, resultadoVazio } from "../../scripts/qa/matriz/banco-somente-leitura";
import {
	compararResumos,
	type EventoCapturado,
	hashDocumento,
	mascararDocumentos,
	montarResumo,
	prefixoNo,
	refDoPrimeiroCandidato,
} from "../../scripts/qa/matriz/resumo";

const alvo = {
	id: "x", descricao: "X", alcada: "municipal", exercita: "teste", cargoEsperado: "Prefeito",
};

function no(type: string, id: string, data: Record<string, unknown> = {}): EventoCapturado {
	return { tipo: "NODE_NOVO", payload: { id, type, data }, ms: 1 };
}

describe("matriz de alçadas — resumo", () => {
	it("resume identidade sem expor o CPF e confere o cargo esperado", () => {
		const eventos = [
			no("PESSOA", "pessoa-1", { label: "FULANO", cargo: "Vereador Municipal", uf: "SP", cpf: "12345678909" }),
			no("DESPESA", "despesa-1"),
			{ tipo: "DONE", payload: {}, ms: 2 },
		];
		const r = montarResumo(alvo, "SP:PREFEITO:sao-paulo:12345678909", eventos, {
			duracaoMs: 10, estourou: false, escritasBloqueadas: 2,
		});
		expect(r.terminou).toBe("DONE");
		expect(r.identidade?.documento).toBe("CPF");
		expect(r.identidade?.documentoHash).toBe(hashDocumento("12345678909"));
		expect(r.identidade?.cargoCorreto).toBe(false);
		expect(JSON.stringify(r)).not.toContain("12345678909");
		expect(r.nos).toEqual({ PESSOA: 1, DESPESA: 1 });
		expect(r.escritasBloqueadas).toBe(2);
	});

	it("conta sentinelas e marca timeout", () => {
		const eventos = [no("EMPRESA", "empresa-1", { cnpj: "13149954000185", data: "2024-01-01" })];
		const r = montarResumo(alvo, null, eventos, { duracaoMs: 1, estourou: true, escritasBloqueadas: 0 });
		expect(r.terminou).toBe("TIMEOUT");
		expect(r.sentinelas).toEqual({ "13149954000185": 1 });
	});

	it("CNPJ real do Banco do Brasil (00000000000191) não é sentinela; o CPF zerado inteiro é", () => {
		const bb = montarResumo(alvo, null, [no("CONTRATO", "contrato-pncp-00000000000191-2", { documento: "00000000000191" })], { duracaoMs: 1, estourou: false, escritasBloqueadas: 0 });
		expect(bb.sentinelas).toEqual({});
		const zerado = montarResumo(alvo, null, [no("PESSOA", "p", { cpf: "00000000000" })], { duracaoMs: 1, estourou: false, escritasBloqueadas: 0 });
		expect(zerado.sentinelas).toEqual({ "00000000000": 1 });
	});

	it("mascara CPF/CNPJ em mensagens de erro", () => {
		expect(mascararDocumentos("ref ESTADUAL:MG:01236681665 não encontrado")).not.toContain("01236681665");
		expect(mascararDocumentos("ano 2026, id 123")).toBe("ano 2026, id 123");
	});

	it("pega a ref do primeiro candidato como a tela faria", () => {
		const eventos: EventoCapturado[] = [
			{ tipo: "CANDIDATOS_ENCONTRADOS", payload: { candidatos: [{ ref: "FEDERAL:CAMARA:1" }, { ref: "B" }] }, ms: 1 },
		];
		expect(refDoPrimeiroCandidato(eventos)).toBe("FEDERAL:CAMARA:1");
		expect(refDoPrimeiroCandidato([])).toBeNull();
	});

	it("aproxima a fonte pelo prefixo do id do nó", () => {
		expect(prefixoNo("despesa-123")).toBe("despesa");
		expect(prefixoNo("tcu_cert:9")).toBe("tcu");
		expect(prefixoNo(undefined)).toBe("sem");
	});

	it("compara execuções e aponta o que mudou", () => {
		const base = montarResumo(alvo, null, [{ tipo: "ERROR", payload: { mensagem: "x" }, ms: 1 }], {
			duracaoMs: 1, estourou: false, escritasBloqueadas: 0,
		});
		const depois = montarResumo(alvo, null, [no("PESSOA", "p", { cargo: "Prefeito" }), { tipo: "DONE", payload: {}, ms: 1 }], {
			duracaoMs: 1, estourou: false, escritasBloqueadas: 0,
		});
		const diffs = compararResumos([base], [depois]);
		expect(diffs.map((d) => d.campo)).toEqual(expect.arrayContaining(["terminou", "cargo", "cargoCorreto", "nos", "erros"]));
		expect(compararResumos([base], [base])).toEqual([]);
	});

	it("guarda os logs: avisos do console (sem documento) e marcos de identidade/cruzamento do log da tela", () => {
		const eventos: EventoCapturado[] = [
			{ tipo: "STATUS", payload: { msg: "Carregando lote..." }, ms: 1 },
			{ tipo: "STATUS", payload: { msg: "[IDENTIDADE] CPF do TSE diferente do CPF oficial: dados do TSE descartados (possível homônimo)" }, ms: 2 },
			{ tipo: "STATUS", payload: { msg: "[CRUZAMENTO] 2 cruzamento(s) entre 9 fatos verificados." }, ms: 3 },
		];
		const avisos = ["[TSE ELEITOS] Base indisponível (x); seguindo sem ela.", "falha no CPF 12345678909", "falha no CPF 12345678909"];
		const r = montarResumo(alvo, null, eventos, { duracaoMs: 1, estourou: false, escritasBloqueadas: 0, avisos });
		expect(r.logs.avisosConsole).toBe(3);
		expect(r.logs.amostraAvisos).toHaveLength(2);
		expect(JSON.stringify(r.logs)).not.toContain("12345678909");
		expect(r.logs.marcos).toEqual([
			"[IDENTIDADE] CPF do TSE diferente do CPF oficial: dados do TSE descartados (possível homônimo)",
			"[CRUZAMENTO] 2 cruzamento(s) entre 9 fatos verificados.",
		]);
	});

	it("conta cruzamentos pela última versão de cada nó ACHADO e a comparação aponta a mudança", () => {
		const achado = (sev: string, extra = {}) => no("ACHADO", "achado-doador-fornecedor-cota-1", { regra: "doador-fornecedor-cota", severidade: sev, ...extra });
		const r = montarResumo(alvo, null, [achado("ALTA"), achado("ALTA", { explicacao_ia: "x" })], { duracaoMs: 1, estourou: false, escritasBloqueadas: 0 });
		expect(r.achados).toEqual({ "doador-fornecedor-cota:ALTA": 1 });
		const antigo = { ...r, achados: undefined, logs: undefined } as never;
		expect(compararResumos([antigo], [r]).map((d) => d.campo)).toEqual(["achados"]);
	});
});

describe("matriz de alçadas — banco somente leitura", () => {
	it("bloqueia escritas e RPCs, mantém leituras e esconde o cache pesquisas", async () => {
		const chamadas: string[] = [];
		const construtor = {
			select: () => { chamadas.push("select"); return { eq: () => Promise.resolve({ data: [1] }) }; },
			upsert: () => { chamadas.push("upsert-real"); },
			insert: () => { chamadas.push("insert-real"); },
		};
		const cliente = {
			from: (_t: string) => construtor as unknown,
			rpc: (_fn: string) => { chamadas.push("rpc-real"); return Promise.resolve({}); },
		};
		const escritas: { tipo: string; alvo: string; metodo: string }[] = [];
		protegerCliente(cliente, escritas);

		const tabela = cliente.from("ceap_despesas_cache") as typeof construtor;
		await (tabela.select() as { eq: () => Promise<unknown> }).eq();
		const r = await ((cliente.from("tse_bens_historico") as any).upsert({}).select().single());
		await (cliente.rpc("incrementar_pesquisa") as Promise<unknown>);
		const cache = await (cliente.from("pesquisas") as any).select("*").eq("termo", "x").maybeSingle();

		expect(chamadas).toEqual(["select"]);
		expect(r).toMatchObject({ error: null });
		expect(cache).toMatchObject({ data: [], error: null });
		expect(escritas).toEqual([
			{ tipo: "tabela", alvo: "tse_bens_historico", metodo: "upsert" },
			{ tipo: "rpc", alvo: "incrementar_pesquisa", metodo: "rpc" },
		]);
	});

	it("resultado vazio é encadeável e aguardável", async () => {
		const r = await (resultadoVazio() as any).eq("a", 1).order("b").limit(1);
		expect(r).toMatchObject({ data: null, error: null });
	});
});

describe("matriz de alçadas — catálogo", () => {
	it("ids únicos e as três alçadas cobertas", () => {
		const ids = ALVOS.map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const alcada of ["federal", "estadual", "municipal"]) {
			expect(ALVOS.some((a) => a.alcada === alcada)).toBe(true);
		}
	});
});
