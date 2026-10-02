import { describe, expect, it } from "vitest";
import { INICIO_LEGISLATURA, mandatoDoHistorico, statusDoMandato } from "@/lib/mandato";

const ev = (dataHora: string, descricaoStatus: string, situacao = "Exercício") => ({ dataHora, descricaoStatus, situacao, idLegislatura: 57 });

describe("mandatoDoHistorico", () => {
	it("posse tardia por recontagem; 'Alteração de partido' não vira entrada", () => {
		const m = mandatoDoHistorico(
			[
				ev("2023-02-01T00:00", "Nome no início da legislatura", ""),
				ev("2026-07-09T15:27", "DIVERSO - Decisão da Mesa - Convocado para posse como titular por recontagem de votos", "CONVOCADO"),
				ev("2026-07-09T15:53", "Entrada - Posse de Eleito Titular"),
				ev("2026-07-14T12:00", "Alteração de partido"),
			],
			{ situacao: "Exercício", condicaoEleitoral: "Titular", data: "2026-07-09" },
		);
		expect(m.situacao).toBe("Exercício");
		expect(m.dataPosse).toBe("2026-07-09");
		expect(m.dataEntrada).toBe("2026-07-09");
		expect(m.origemPosse).toBe("recontagem");
	});

	it("licença depois da última entrada vira Licença, com motivo", () => {
		const m = mandatoDoHistorico(
			[ev("2023-02-01T00:00", "Entrada - Posse"), ev("2024-03-01T10:00", "Saída - Afastamento - tratamento de saúde", "Licença")],
			{ situacao: "Licença", condicaoEleitoral: "Titular" },
		);
		expect(m.situacao).toBe("Licença");
		expect(m.motivoAfastamento).toBe("saude");
		expect(m.dataSaida).toBe("2024-03-01");
	});

	it("tolera histórico vazio", () => {
		const m = mandatoDoHistorico([], undefined);
		expect(m.situacao).toBe("Exercício");
		expect(m.condicaoEleitoral).toBe("Titular");
		expect(m.dataPosse).toBe("");
	});
});

describe("statusDoMandato — um selo e uma frase por cenário", () => {
	it("mandato inteiro: só 'Em exercício', sem frase", () => {
		const s = statusDoMandato({ situacao: "Exercício", condicao_eleitoral: "Titular", data_posse: INICIO_LEGISLATURA, data_entrada: INICIO_LEGISLATURA });
		expect(s).toMatchObject({ rotulo: "Em exercício", tom: "phos", detalhe: "", condicao: "" });
	});

	it("posse tardia por recontagem de votos", () => {
		const s = statusDoMandato({ situacao: "Exercício", condicao_eleitoral: "Titular", data_posse: "2026-07-09", data_entrada: "2026-07-09", origem_posse: "recontagem" });
		expect(s.rotulo).toBe("Em exercício");
		expect(s.detalhe).toBe("Tomou posse em 09/07/2026 (convocado pela Mesa após recontagem de votos).");
	});

	it("retorno ao exercício depois de afastamento", () => {
		const s = statusDoMandato({ situacao: "Exercício", condicao_eleitoral: "Titular", data_posse: "2023-02-01", data_entrada: "2025-05-10" });
		expect(s.detalhe).toBe("Retomou o exercício em 10/05/2025.");
	});

	it("suplente em exercício", () => {
		const s = statusDoMandato({ situacao: "Exercício", condicao_eleitoral: "Suplente", data_posse: "2025-03-01", data_entrada: "2025-03-01" });
		expect(s).toMatchObject({ rotulo: "Em exercício", tom: "warn", condicao: "Suplente" });
		expect(s.detalhe).toBe("Assumiu em 01/03/2025.");
	});

	it("suplente fora de exercício", () => {
		const s = statusDoMandato({ situacao: "Suplência", condicao_eleitoral: "Suplente", data_posse: "2024-01-10", data_saida: "2024-06-30" });
		expect(s.rotulo).toBe("Suplente fora de exercício");
		expect(s.detalhe).toBe("Exerceu o mandato de 10/01/2024 a 30/06/2024.");
	});

	it("licenciado, com motivo", () => {
		const s = statusDoMandato({ situacao: "Licença", condicao_eleitoral: "Titular", data_saida: "2026-03-05", motivo_afastamento: "ministro" });
		expect(s).toMatchObject({ rotulo: "Licenciado", tom: "steel" });
		expect(s.detalhe).toBe("Afastado desde 05/03/2026 para exercer o cargo de Ministro de Estado.");
	});

	it("perfil sem dados de mandato: sem selo e sem frase", () => {
		expect(statusDoMandato(null)).toMatchObject({ rotulo: "", detalhe: "", condicao: "" });
	});
});
