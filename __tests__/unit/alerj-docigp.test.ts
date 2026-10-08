import { beforeEach, describe, expect, it, vi } from "vitest";
import { dataIsoBr, lancamentosDosOrcamentos, lerLancamento, nomeDoDeputado } from "../../scripts/etl/alerj-docigp";
import { escolherPorNome, nomesBatem } from "../../src/lib/nome-parlamentar";
import { buscarDespesasAlerjDaBase, despesasAlerjParaOPipe, reiniciarAvisoAlerj } from "../../src/services/integrations/alerj/despesas-base";

const DEP = { id: 95, nome: "ALAN DE OLIVEIRA LOPES (Alan Lopes)" };
const lancamento = (extra: Record<string, unknown> = {}) => ({
	id: 9001, value: "-135.00", date: "31/01/2025", object: "gasolina", cost_center_name: "Combustíveis",
	provider_cpf_cnpj: "71.806.251/0001-06", provider_name: "AUTO POSTO X", document_number: "123", documents_count: 1,
	is_transport_or_credit: false, ...extra,
});

describe("ETL ALERJ / DOCIGP (regras puras)", () => {
	it("débito vira gasto positivo, com data ISO, fornecedor e documento só com dígitos", () => {
		expect(lerLancamento(lancamento(), DEP, { year: 2025, month: "01" })).toEqual({
			lancamento_id: 9001, deputado_id: 95, deputado: DEP.nome, ano: 2025, mes: 1, data: "2025-01-31", valor: 135,
			objeto: "gasolina", centro_custo: "Combustíveis", documento: "71806251000106", fornecedor: "AUTO POSTO X",
			numero_documento: "123", qtd_documentos: 1,
		});
	});

	it("crédito, depósito e transporte de saldo não são gasto", () => {
		expect(lerLancamento(lancamento({ value: "20000.00" }), DEP, { year: 2025, month: 1 })).toBeNull();
		expect(lerLancamento(lancamento({ is_transport_or_credit: true }), DEP, { year: 2025, month: 1 })).toBeNull();
		expect(lerLancamento(lancamento({ id: null }), DEP, { year: 2025, month: 1 })).toBeNull();
	});

	it("lançamentos vêm embutidos em cada orçamento mensal", () => {
		const orcamentos = [
			{ year: 2025, month: 1, entries: [lancamento(), lancamento({ id: 9002, value: "30000.00" })] },
			{ year: 2025, month: 2, entries: [lancamento({ id: 9003, date: "10/02/2025" })] },
			{ year: 2025, month: 3 },
		];
		expect(lancamentosDosOrcamentos(orcamentos, DEP).map((l) => [l.lancamento_id, l.mes])).toEqual([[9001, 1], [9003, 2]]);
		expect(dataIsoBr("sem data")).toBeNull();
	});

	it("nome do deputado com apelido", () => {
		expect(nomeDoDeputado({ name: "ALAN DE OLIVEIRA LOPES", nickname: "Alan Lopes" })).toBe("ALAN DE OLIVEIRA LOPES (Alan Lopes)");
		expect(nomeDoDeputado({ name: "FULANO", nickname: "fulano" })).toBe("FULANO");
	});
});

describe("nome do parlamentar (ALESP e ALERJ)", () => {
	const lista = [{ d: "ALAN DE OLIVEIRA LOPES (Alan Lopes)" }, { d: "RODRIGO DA SILVA BACELLAR (Rodrigo Bacellar)" }, { d: "MARIA SILVA (Maria)" }, { d: "MARIA SILVA SOUZA (Mariazinha)" }];
	it("nome civil do TSE ou apelido acham o deputado; ambíguo não escolhe ninguém", () => {
		expect(escolherPorNome(lista, "ALAN DE OLIVEIRA LOPES", (x) => x.d)?.d).toBe(lista[0].d);
		expect(escolherPorNome(lista, "Rodrigo Bacellar", (x) => x.d)?.d).toBe(lista[1].d);
		expect(escolherPorNome(lista, "MARIA SILVA SOUZA LIMA", (x) => x.d)).toBeNull();
		expect(nomesBatem("ANDRÉ DO PRADO", "ANDRE LUIS DO PRADO")).toBe(true);
	});
});

function clienteFalso(respostas: Record<string, { data?: unknown[]; error?: { message: string } }>) {
	const chamadas: unknown[][] = [];
	const cliente = {
		from(tabela: string) {
			const q: Record<string, unknown> = {};
			for (const m of ["select", "eq", "gte", "order", "limit"]) q[m] = (...a: unknown[]) => (chamadas.push([tabela, m, ...a]), q);
			q.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => {
				const r = respostas[tabela] ?? { data: [] };
				return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(ok, erro);
			};
			return q;
		},
	};
	return { cliente: cliente as never, chamadas };
}

describe("despesas da ALERJ pela base (Banco de Perfil)", () => {
	beforeEach(() => reiniciarAvisoAlerj());

	it("acha o deputado e devolve as despesas no formato do pipe, maiores primeiro", async () => {
		const { cliente, chamadas } = clienteFalso({
			alerj_deputados: { data: [{ deputado_id: 95, deputado: DEP.nome, ultimo_ano: 2026 }] },
			alerj_despesas: { data: [{ documento: "71806251000106", fornecedor: "AUTO POSTO X", centro_custo: "Combustíveis", objeto: "gasolina", valor: "135.00", data: "2025-01-31", ano: 2025, mes: 1, numero_documento: "123" }] },
		});
		const r = await buscarDespesasAlerjDaBase("ALAN DE OLIVEIRA LOPES", 2025, cliente);
		expect(r?.despesas[0]).toMatchObject({ cnpjCpfFornecedor: "71806251000106", tipoDespesa: "Combustíveis", descricao: "gasolina", valorDocumento: 135, dataDocumento: "2025-01-31", fonte: "ALERJ — DOCIGP" });
		expect(chamadas).toContainEqual(["alerj_despesas", "eq", "deputado_id", 95]);
		expect(chamadas).toContainEqual(["alerj_despesas", "order", "valor", { ascending: false }]);
	});

	it("base fora do ar: null e aviso no log uma vez", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { cliente } = clienteFalso({ alerj_deputados: { error: { message: "Could not find the table 'public.alerj_deputados'" } } });
		expect(await buscarDespesasAlerjDaBase("X", 2025, cliente)).toBeNull();
		expect(await buscarDespesasAlerjDaBase("X", 2025, cliente)).toBeNull();
		expect(aviso).toHaveBeenCalledTimes(1);
		expect(aviso).toHaveBeenCalledWith("[ALERJ] Base indisponível (Could not find the table 'public.alerj_deputados').");
		aviso.mockRestore();
	});
});

describe("deputado do RJ no pipe (antes: nenhuma despesa)", () => {
	const hoje = new Date(2026, 9, 7);
	const rodar = async (resposta: Awaited<ReturnType<typeof buscarDespesasAlerjDaBase>>) => {
		const eventos: { tipo: string; payload: any }[] = [];
		const buscar = vi.fn(async () => resposta);
		const r = await despesasAlerjParaOPipe("ALAN DE OLIVEIRA LOPES", (tipo, payload) => eventos.push({ tipo, payload }), hoje, buscar);
		return { r, eventos, buscar };
	};

	it("com a base: as 60 maiores dos últimos 2 anos e o log diz de onde vieram", async () => {
		const despesas = Array.from({ length: 70 }, (_v, i) => ({ valorDocumento: 70 - i })) as never;
		const { r, eventos, buscar } = await rodar({ despesas, deputado: { deputado_id: 95, deputado: DEP.nome, ultimo_ano: 2026 } });
		expect(buscar).toHaveBeenCalledWith("ALAN DE OLIVEIRA LOPES", 2025);
		expect(r).toHaveLength(60);
		expect(eventos).toEqual([{ tipo: "STATUS", payload: { msg: `[ALERJ] 70 despesa(s) de gabinete de ${DEP.nome} desde 2025, pela base do DOCIGP.` } }]);
	});

	it("nome ambíguo: aviso na tela; base fora do ar: o log diz que não foi consultado (nada inventado)", async () => {
		const ambiguo = await rodar({ despesas: [], deputado: null });
		expect(ambiguo.r).toEqual([]);
		expect(ambiguo.eventos[0]).toMatchObject({ tipo: "API_WARNING", payload: { mensagem: '"ALAN DE OLIVEIRA LOPES" não foi identificado(a) com segurança na lista de deputados do DOCIGP (nome ausente ou ambíguo).' } });
		const fora = await rodar(null);
		expect(fora.r).toEqual([]);
		expect(fora.eventos).toEqual([{ tipo: "STATUS", payload: { msg: "[ALERJ] Base de despesas do DOCIGP indisponível; despesas de gabinete não consultadas." } }]);
	});
});
