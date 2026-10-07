import { describe, expect, it } from "vitest";
import { inicioDoPeriodo, lerTabelaGabinete, valorMonetario } from "../../scripts/etl/gabinete-camara";
import { agruparServidores } from "../../src/lib/gabinete";

const linha = (nome: string, grupo: string, cargo: string, periodo: string, salario: string) =>
	`<tr><td> ${nome} </td><td>${grupo}</td><td>${cargo}</td><td>${periodo}</td><td>${salario}</td></tr>`;

const HTML = `
<table class="table"><thead><tr><th>Nome</th><th>Grupo funcional</th><th>Cargo</th><th>Período de exercício</th><th>Remuneração mensal</th></tr></thead>
<tbody>
${linha("Maria Souza", "Secretário Parlamentar", "SP25", "De 01/02/2023 a 17/02/2026", "R$ 12.345,67")}
${linha("Maria Souza", "Secretário Parlamentar", "SP25", "De 01/02/2023 a 17/02/2026", "R$ 12.345,67")}
${linha("João Lima", "Cargo de Natureza Especial", "CNE-07", "Desde 01/03/2024", "")}
<tr><td colspan="5">Total</td></tr>
</tbody></table>
<table class="table"><tbody>
${linha("Maria Souza", "Secretário Parlamentar", "SP20", "Desde 18/02/2026", "R$ 9.000,00")}
</tbody></table>`;

describe("gabinete da Câmara (leitura da página)", () => {
	it("tira a repetição, grava remuneração e a data real de início (não a data da carga)", () => {
		const r = lerTabelaGabinete(HTML, 204396);
		expect(r).toEqual([
			{ deputado_id: 204396, nome: "Maria Souza", cargo: "Secretário Parlamentar", periodo: "De 01/02/2023 a 17/02/2026", data_nomeacao: "2023-02-01", salario: 12345.67 },
			{ deputado_id: 204396, nome: "João Lima", cargo: "Cargo de Natureza Especial", periodo: "Desde 01/03/2024", data_nomeacao: "2024-03-01", salario: null },
			{ deputado_id: 204396, nome: "Maria Souza", cargo: "Secretário Parlamentar", periodo: "Desde 18/02/2026", data_nomeacao: "2026-02-18", salario: 9000 },
		]);
	});

	it("auxiliares de período e valor", () => {
		expect(inicioDoPeriodo("sem data")).toBeNull();
		expect(valorMonetario("R$ 1.000,50")).toBe(1000.5);
		expect(valorMonetario("—")).toBeNull();
	});

	it("tela: vínculo idêntico repetido no banco aparece uma vez só", () => {
		const [pessoa] = agruparServidores(
			[
				{ nome: "Maria Souza", cargo: "Secretário Parlamentar", periodo: "Desde 18/02/2026" },
				{ nome: "MARIA SOUZA", cargo: "Secretário Parlamentar", periodo: "Desde 18/02/2026" },
				{ nome: "Maria Souza", cargo: "Secretário Parlamentar", periodo: "De 01/02/2023 a 17/02/2026" },
			],
			new Date(2026, 9, 7),
		);
		expect(pessoa.vinculos.map((v) => v.periodo)).toEqual(["Desde 18/02/2026", "De 01/02/2023 a 17/02/2026"]);
	});
});
