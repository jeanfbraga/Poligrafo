import { describe, expect, it } from "vitest";
import {
	CARGO_TSE,
	eleicoesParaCarregar,
	emMandato,
	inicioLegislaturaVigente,
	legislaturaVigente,
	mandatosVigentes,
	naJanela,
	posseRecente,
} from "@/lib/janela-mandato";

const em = (iso: string) => new Date(`${iso}T12:00:00Z`);
const HOJE = em("2026-10-12");

describe("janela de mandato — quem o Polígrafo investiga", () => {
	it("hoje: deputados, governadores e presidente de 2022; prefeitos e vereadores de 2024", () => {
		expect(mandatosVigentes(CARGO_TSE.DEPUTADO_FEDERAL, HOJE)).toEqual([{ eleicao: 2022, inicio: "2023-02-01", fim: "2027-01-31" }]);
		expect(mandatosVigentes(CARGO_TSE.PRESIDENTE, HOJE)).toEqual([{ eleicao: 2022, inicio: "2023-01-01", fim: "2027-01-04" }]);
		expect(mandatosVigentes(CARGO_TSE.GOVERNADOR, HOJE)).toEqual([{ eleicao: 2022, inicio: "2023-01-01", fim: "2027-01-05" }]);
		expect(mandatosVigentes(CARGO_TSE.VEREADOR, HOJE)).toEqual([{ eleicao: 2024, inicio: "2025-01-01", fim: "2028-12-31" }]);
	});

	it("Senado tem dois mandatos vigentes: eleitos em 2018 (até jan/2027) e em 2022 (até jan/2031)", () => {
		expect(mandatosVigentes(CARGO_TSE.SENADOR, HOJE).map((m) => [m.eleicao, m.fim])).toEqual([
			[2018, "2027-01-31"],
			[2022, "2031-01-31"],
		]);
		expect(emMandato(CARGO_TSE.SENADOR, 2018, HOJE)).toBe(true);
	});

	it("troca de período sozinha nas posses de 2027 (presidente 5/jan, governador 6/jan, deputados 1º/fev)", () => {
		expect(emMandato(CARGO_TSE.PRESIDENTE, 2022, em("2027-01-04"))).toBe(true);
		expect(emMandato(CARGO_TSE.PRESIDENTE, 2026, em("2027-01-05"))).toBe(true);
		expect(emMandato(CARGO_TSE.GOVERNADOR, 2022, em("2027-01-05"))).toBe(true);
		expect(emMandato(CARGO_TSE.GOVERNADOR, 2026, em("2027-01-06"))).toBe(true);
		expect(emMandato(CARGO_TSE.DEPUTADO_ESTADUAL, 2022, em("2027-01-31"))).toBe(true);
		expect(emMandato(CARGO_TSE.DEPUTADO_ESTADUAL, 2022, em("2027-02-01"))).toBe(false);
		expect(emMandato(CARGO_TSE.SENADOR, 2018, em("2027-02-01"))).toBe(false);
		expect(legislaturaVigente(em("2027-02-01"))).toBe(58);
		expect(inicioLegislaturaVigente(em("2027-02-01"))).toBe("2027-02-01");
	});

	it("legislatura e início de hoje: 57ª, desde 2023-02-01", () => {
		expect(legislaturaVigente(HOJE)).toBe(57);
		expect(inicioLegislaturaVigente(HOJE)).toBe("2023-02-01");
	});

	it("ex-deputado de 2018 fica fora; presidente fica sempre (exceção decidida em 12/10/2026)", () => {
		expect(naJanela(CARGO_TSE.DEPUTADO_FEDERAL, 2018, HOJE)).toBe(false);
		expect(naJanela(CARGO_TSE.VEREADOR, 2020, HOJE)).toBe(false);
		expect(naJanela(CARGO_TSE.PRESIDENTE, 2014, HOJE)).toBe(true);
		expect(naJanela(CARGO_TSE.VICE_PRESIDENTE, 2014, HOJE)).toBe(true); // Temer
		expect(naJanela(CARGO_TSE.GOVERNADOR, 2018, HOJE)).toBe(false);
	});

	it("posse recente (45 dias): libera a saída grande nas cargas só na troca de período", () => {
		expect(posseRecente(HOJE)).toBe(false);
		expect(posseRecente(em("2027-01-05"))).toBe(true); // presidente
		expect(posseRecente(em("2027-02-20"))).toBe(true); // deputados e senadores (1º/fev)
		expect(posseRecente(em("2027-04-01"))).toBe(false);
		expect(posseRecente(em("2029-01-10"))).toBe(true); // prefeitos e vereadores
	});

	it("cargas guardam os mandatos vigentes e a eleição já realizada à espera da posse", () => {
		expect(eleicoesParaCarregar(em("2026-09-30"))).toEqual([2018, 2022, 2024]);
		expect(eleicoesParaCarregar(HOJE)).toEqual([2018, 2022, 2024, 2026]);
		expect(eleicoesParaCarregar(em("2027-03-01"))).toEqual([2022, 2024, 2026]);
	});
});
