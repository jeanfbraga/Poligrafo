import { describe, expect, it, vi } from "vitest";
import {
	cnpjDaMatriz,
	dataReceita,
	empresaDaLinha,
	mapaPoliticos,
	montarRegistro,
	pastaMaisRecente,
	vinculoDaLinha,
} from "../../scripts/etl/socios-politicos";
import { empresasDoPoliticoNaBase } from "../../src/services/integrations/receita/socios-politicos";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));

const CPF = "52998224725"; // fictício, miolo 982247
const MAPA = mapaPoliticos([
	{ nr_cpf_candidato: CPF, nm_candidato: "Flávio Nantes Bolsonaro" },
	{ nr_cpf_candidato: null, nm_candidato: "SEM CPF NENHUM" },
	{ nr_cpf_candidato: "11144477735", nm_candidato: "CURTO" },
]);
const DOMINIOS = { qualificacoes: new Map([["22", "Sócio"]]), naturezas: new Map([["2062", "Sociedade Empresária Limitada"]]) };

// Linhas no formato de Socios*.csv da Receita (2026-09).
const linha = (nome: string, cpfMascarado: string, identificador = "2") => ["21636316", identificador, nome, cpfMascarado, "22", "20150107", "", "***000000**", "", "00", "5"];

describe("ETL socios_politicos — quem é sócio", () => {
	it("só eleito com CPF válido e nome de duas palavras ou mais entra no mapa", () => {
		expect([...MAPA.keys()]).toEqual(["FLAVIO NANTES BOLSONARO"]);
	});

	it("nome completo + miolo do CPF iguais: vínculo com data e qualificação", () => {
		expect(vinculoDaLinha(linha("FLAVIO NANTES BOLSONARO", "***982247**"), MAPA)).toEqual({
			cpf_politico: CPF,
			cnpj_basico: "21636316",
			nome_politico: "FLAVIO NANTES BOLSONARO",
			qualificacao_codigo: "22",
			data_entrada: "2015-01-07",
		});
	});

	it("homônimo (mesmo nome, outro CPF), pessoa jurídica ou nome diferente: fora", () => {
		expect(vinculoDaLinha(linha("FLAVIO NANTES BOLSONARO", "***111222**"), MAPA)).toBeNull();
		expect(vinculoDaLinha(linha("FLAVIO NANTES BOLSONARO", "***982247**", "1"), MAPA)).toBeNull();
		expect(vinculoDaLinha(linha("FLAVIO BOLSONARO", "***982247**"), MAPA)).toBeNull();
	});

	it("CNPJ da matriz calculado dos 8 dígitos (Bolsotini: 21.636.316/0001-44)", () => {
		expect(cnpjDaMatriz("21636316")).toBe("21636316000144");
		expect(cnpjDaMatriz("0")).toBe("00000000000191"); // Banco do Brasil
	});

	it("empresa: capital no formato da Receita e CNPJ de campanha (natureza 409-0) fora", () => {
		const e = empresaDaLinha(["21636316", "BOLSOTINI CHOCOLATES E CAFE LTDA", "2062", "49", "100000,00", "03", ""]);
		expect(e).toEqual({ cnpj_basico: "21636316", razao_social: "BOLSOTINI CHOCOLATES E CAFE LTDA", natureza_codigo: "2062", capital_social: 100000 });
		const v = vinculoDaLinha(linha("FLAVIO NANTES BOLSONARO", "***982247**"), MAPA)!;
		expect(montarRegistro(v, e!, DOMINIOS, "2026-09")).toMatchObject({
			cnpj: "21636316000144",
			razao_social: "BOLSOTINI CHOCOLATES E CAFE LTDA",
			natureza_juridica: "Sociedade Empresária Limitada",
			qualificacao_socio: "Sócio",
			referencia: "2026-09",
		});
		expect(montarRegistro(v, { ...e!, natureza_codigo: "4090" }, DOMINIOS, "2026-09")).toBeNull();
	});

	it("datas e pasta mensal mais recente", () => {
		expect(dataReceita("00000000")).toBeNull();
		expect(dataReceita("")).toBeNull();
		expect(pastaMaisRecente(["/public.php/webdav/", "/public.php/webdav/2026-08/", "/public.php/webdav/2026-09/", "/public.php/webdav/cnpj.tar.gz"])).toBe("2026-09");
	});
});

describe("leitura da base socios_politicos", () => {
	function cliente(resposta: { data: unknown; error: { message: string } | null }) {
		const filtros: [string, string, unknown][] = [];
		const consulta = {
			select: () => consulta,
			limit: () => consulta,
			eq: (c: string, v: unknown) => (filtros.push(["eq", c, v]), Promise.resolve(resposta)),
			in: (c: string, v: unknown) => (filtros.push(["in", c, v]), Promise.resolve(resposta)),
		};
		return { filtros, c: { from: () => consulta } as never };
	}

	it("com CPF consulta pelo CPF; sem CPF, pelos nomes civis exatos", async () => {
		const a = cliente({ data: [{ cnpj: "1" }], error: null });
		expect(await empresasDoPoliticoNaBase({ cpf: CPF, nomes: ["X Y"] }, a.c)).toEqual([{ cnpj: "1" }]);
		expect(a.filtros).toEqual([["eq", "cpf_politico", CPF]]);
		const b = cliente({ data: [], error: null });
		await empresasDoPoliticoNaBase({ cpf: null, nomes: ["FLAVIO NANTES BOLSONARO"] }, b.c);
		expect(b.filtros).toEqual([["in", "nome_politico", ["FLAVIO NANTES BOLSONARO"]]]);
	});

	it("base fora do ar: lista vazia e aviso no log; sem CPF nem nome, nem consulta", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const c = cliente({ data: null, error: { message: "relation does not exist" } });
		expect(await empresasDoPoliticoNaBase({ cpf: CPF, nomes: [] }, c.c)).toEqual([]);
		expect(aviso).toHaveBeenCalledWith("[SOCIOS POLITICOS] Base indisponível (relation does not exist); seguindo sem ela.");
		const vazio = cliente({ data: [], error: null });
		expect(await empresasDoPoliticoNaBase({ cpf: null, nomes: [] }, vazio.c)).toEqual([]);
		expect(vazio.filtros).toEqual([]);
		aviso.mockRestore();
	});
});
