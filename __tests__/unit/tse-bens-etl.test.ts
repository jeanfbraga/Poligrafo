import { describe, expect, it } from "vitest";
import { agruparBens, bensQueMudaram, bensQueSairam, LIMITE_DESCRICAO, type LinhaBens } from "../../scripts/etl/tse-bens";

const bem = (sq: string, tipo: string, descricao: string, valor: string) => ({ SQ_CANDIDATO: sq, DS_TIPO_BEM_CANDIDATO: tipo, DS_BEM_CANDIDATO: descricao, VR_BEM_CANDIDATO: valor });
// Vereador de 2024 sem CPF público: entra pelo número do candidato.
const donos = new Map([["250002351684", { cpf: null, nome: "FULANA DE TAL", cd_cargo: "13", sg_uf: "SP" }]]);

describe("ETL tse_bens (só quem está na janela de mandato)", () => {
	it("agrupa por número do candidato, soma o total e ordena do maior para o menor; quem não é da janela fica fora", () => {
		const csv = [
			bem("250002351684", "Casa", "UMA CASA RESIDENCIAL DE ALVENARIA", "30000,00"),
			bem("250002351684", "Veículo automotor terrestre", "CARRO", "45.500,50"),
			bem("999", "Casa", "DE OUTRA PESSOA", "1.000.000,00"),
		];
		const [linha] = agruparBens(csv, donos, 2024);
		expect(linha).toMatchObject({ sq_candidato: "250002351684", ano_eleicao: 2024, cpf: null, nome: "FULANA DE TAL", valor_total: 75500.5 });
		expect(linha.bens).toEqual([
			{ t: "Veículo automotor terrestre", d: "CARRO", v: 45500.5 },
			{ t: "Casa", d: "UMA CASA RESIDENCIAL DE ALVENARIA", v: 30000 },
		]);
		expect(agruparBens(csv, donos, 2024)).toHaveLength(1);
	});

	it("descrição longa é cortada (não muda a leitura e pesa no banco)", () => {
		const [linha] = agruparBens([bem("250002351684", "Outros", "X".repeat(900), "1,00")], donos, 2024);
		expect(linha.bens[0].d).toHaveLength(LIMITE_DESCRICAO);
	});

	const linha = (sq: string, ano: number, total: number, cpf: string | null = null): LinhaBens => ({ sq_candidato: sq, ano_eleicao: ano, valor_total: total, cpf, nome: "X", cd_cargo: "6", sg_uf: "SP", bens: [] });

	it("grava só o que é novo ou mudou (total ou CPF)", () => {
		const naBase = [{ sq_candidato: "1", ano_eleicao: 2022, valor_total: "100.00", cpf: null }];
		expect(bensQueMudaram([linha("1", 2022, 100)], naBase)).toEqual([]);
		expect(bensQueMudaram([linha("1", 2022, 150), linha("2", 2022, 1)], naBase).map((l) => l.sq_candidato)).toEqual(["1", "2"]);
		expect(bensQueMudaram([linha("1", 2022, 100, "52998224725")], naBase)).toHaveLength(1);
	});

	it("quem saiu da janela sai da base; saída grande demais só na troca de período", () => {
		const naBase = Array.from({ length: 10 }, (_, i) => ({ sq_candidato: String(i), ano_eleicao: 2022, valor_total: 1, cpf: null }));
		const ficam = naBase.slice(1).map((b) => linha(b.sq_candidato, 2022, 1));
		expect(bensQueSairam(naBase, ficam)?.map((b) => b.sq_candidato)).toEqual(["0"]);
		expect(bensQueSairam(naBase, ficam.slice(5))).toBeNull();
		expect(bensQueSairam(naBase, ficam.slice(5), true)).toHaveLength(6);
	});
});
