import { describe, expect, it, vi } from "vitest";
import { AgregadorAlesp, lerDespesa, separarBlocos } from "../../scripts/etl/alesp-despesas";
import {
	buscarDespesasAlespDaBase,
	escolherDeputado,
	nomesBatemAlesp,
	reiniciarAvisoAlesp,
} from "../../src/services/integrations/alesp/despesas-base";

const bloco = (ano: number, mes: number, valor: string, extra = "") =>
	`<despesa><Ano>${ano}</Ano><Matricula>300257</Matricula><Mes>${mes}</Mes><Valor>${valor}</Valor><CNPJ>71.806.251/0001-06</CNPJ><Deputado>ANDRÉ DO PRADO</Deputado><Tipo>A - COMBUSTÍVEIS E LUBRIFICANTES</Tipo><Fornecedor>AUTO POSTO MARV &amp; CIA</Fornecedor>${extra}</despesa>`;

describe("ETL ALESP (regras puras)", () => {
	it("lê o bloco, decodifica &amp; e ignora o que é de antes da legislatura atual", () => {
		expect(lerDespesa(bloco(2024, 3, "200.5"))).toEqual({
			matricula: "300257", deputado: "ANDRÉ DO PRADO", ano: 2024, mes: 3, tipo: "A - COMBUSTÍVEIS E LUBRIFICANTES",
			fornecedor: "AUTO POSTO MARV & CIA", documento: "71806251000106", valor: 200.5, quantidade: 1,
		});
		expect(lerDespesa(bloco(2015, 3, "200"))).toBeNull();
		expect(lerDespesa("<despesa><Ano>2024</Ano></despesa>")).toBeNull();
	});

	it("separa blocos do fluxo e guarda o pedaço incompleto para o próximo trecho", () => {
		const texto = `<?xml?><despesas>${bloco(2024, 1, "1")}${bloco(2024, 2, "2")}<despesa><Ano>20`;
		const { blocos, resto } = separarBlocos(texto);
		expect(blocos).toHaveLength(2);
		expect(resto).toBe("<despesa><Ano>20");
	});

	it("o mesmo lançamento repetido soma valor e quantidade (uma linha por chave)", () => {
		const ag = new AgregadorAlesp();
		ag.adicionar(lerDespesa(bloco(2024, 3, "100.10")));
		ag.adicionar(lerDespesa(bloco(2024, 3, "50.20")));
		ag.adicionar(lerDespesa(bloco(2024, 4, "10")));
		ag.adicionar(null);
		expect(ag.linhas().map((l) => [l.mes, l.valor, l.quantidade])).toEqual([[3, 150.3, 2], [4, 10, 1]]);
	});
});

const DEPUTADOS = [
	{ matricula: "300257", deputado: "ANDRÉ DO PRADO", ultimo_ano: 2026 },
	{ matricula: "300100", deputado: "ANDRÉ SANTOS", ultimo_ano: 2026 },
	{ matricula: "300200", deputado: "MARIA SILVA", ultimo_ano: 2026 },
	{ matricula: "300201", deputado: "MARIA SILVA SOUZA", ultimo_ano: 2025 },
];

describe("deputado da ALESP pelo nome", () => {
	it("nome civil do TSE acha o nome parlamentar (todas as palavras do menor no maior)", () => {
		expect(nomesBatemAlesp("ANDRÉ DO PRADO", "ANDRE LUIS DO PRADO")).toBe(true);
		expect(nomesBatemAlesp("ANDRÉ SANTOS", "ANDRE LUIS DO PRADO")).toBe(false);
		expect(escolherDeputado(DEPUTADOS, "ANDRE LUIS DO PRADO")?.matricula).toBe("300257");
	});

	it("ambíguo não escolhe ninguém; nome exato desempata", () => {
		expect(escolherDeputado(DEPUTADOS, "MARIA SILVA SOUZA LIMA")).toBeNull();
		expect(escolherDeputado(DEPUTADOS, "Maria Silva")?.matricula).toBe("300200");
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

describe("despesas da ALESP pela base (Banco de Perfil)", () => {
	it("acha a matrícula pelo nome e traz as despesas do período, maiores primeiro, no formato do pipe", async () => {
		const { cliente, chamadas } = clienteFalso({
			alesp_deputados: { data: DEPUTADOS },
			alesp_despesas: { data: [{ documento: "71806251000106", fornecedor: "AUTO POSTO", tipo: "A - COMBUSTÍVEIS", valor: "1500.50", ano: 2025, mes: 3, quantidade: 4 }] },
		});
		const r = await buscarDespesasAlespDaBase("ANDRE LUIS DO PRADO", 2025, cliente);
		expect(r?.deputado?.matricula).toBe("300257");
		expect(r?.despesas[0]).toMatchObject({ cnpjCpfFornecedor: "71806251000106", valorDocumento: 1500.5, dataDocumento: "2025-03-01", quantidade: 4, fonte: "ALESP" });
		expect(chamadas).toContainEqual(["alesp_despesas", "eq", "matricula", "300257"]);
		expect(chamadas).toContainEqual(["alesp_despesas", "gte", "ano", 2025]);
		expect(chamadas).toContainEqual(["alesp_despesas", "order", "valor", { ascending: false }]);
	});

	it("deputado não achado: lista vazia (sem consultar as despesas)", async () => {
		const { cliente, chamadas } = clienteFalso({ alesp_deputados: { data: DEPUTADOS } });
		expect(await buscarDespesasAlespDaBase("FULANO DE TAL", 2025, cliente)).toEqual({ despesas: [], deputado: null });
		expect(chamadas.some((c) => c[0] === "alesp_despesas")).toBe(false);
	});

	it("base fora do ar: null e aviso no log uma vez", async () => {
		reiniciarAvisoAlesp();
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { cliente } = clienteFalso({ alesp_deputados: { error: { message: "Could not find the table 'public.alesp_deputados'" } } });
		expect(await buscarDespesasAlespDaBase("X", 2025, cliente)).toBeNull();
		expect(await buscarDespesasAlespDaBase("X", 2025, cliente)).toBeNull();
		expect(aviso).toHaveBeenCalledTimes(1);
		expect(aviso).toHaveBeenCalledWith("[ALESP] Base indisponível (Could not find the table 'public.alesp_deputados'); usando o XML ao vivo.");
		aviso.mockRestore();
	});
});
