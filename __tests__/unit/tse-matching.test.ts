import { describe, it, expect } from "vitest";
import {
	cleanPunctuation,
	matchPalavraInteira,
	encontrarCandidatoPorNome,
} from "../../src/app/api/investigar/tse";

describe("TSE Matching & Resiliência de Nomes", () => {
	describe("cleanPunctuation", () => {
		it("deve remover pontos, hífens, barras e caracteres especiais mantendo espaços únicos", () => {
			expect(cleanPunctuation("DR. FÁBIO RUEDA")).toBe("DR FÁBIO RUEDA");
			expect(cleanPunctuation("PROF. DR. SILVA-SANTOS / RJ")).toBe("PROF DR SILVA SANTOS RJ");
			expect(cleanPunctuation("")).toBe("");
		});
	});

	describe("matchPalavraInteira", () => {
		it("deve encontrar palavra inteira mesmo cercada por pontuações", () => {
			expect(matchPalavraInteira("dr. fabio rueda", "dr")).toBe(true);
			expect(matchPalavraInteira("dr. fabio rueda", "fabio")).toBe(true);
			expect(matchPalavraInteira("dr. fabio rueda", "rueda")).toBe(true);
		});

		it("não deve dar falso positivo para substrings no meio de outras palavras", () => {
			expect(matchPalavraInteira("pedro rueda", "dro")).toBe(false);
			expect(matchPalavraInteira("eduardo", "edu")).toBe(false);
		});
	});

	describe("encontrarCandidatoPorNome", () => {
		const candidatosMock = [
			{
				id: 1001,
				nomeUrna: "DR. FÁBIO RUEDA",
				nomeCompleto: "FABIO GONÇALVES DE RUEDA",
				cargo: { nome: "Deputado Federal" },
			},
			{
				id: 1002,
				nomeUrna: "PASTOR SERGIO",
				nomeCompleto: "SERGIO PEREIRA DOS SANTOS",
				cargo: { nome: "Deputado Federal" },
			},
			{
				id: 1003,
				nomeUrna: "TIRIRICA",
				nomeCompleto: "FRANCISCO EVERARDO OLIVEIRA SILVA",
				cargo: { nome: "Deputado Federal" },
			},
		];

		it("deve encontrar candidato com pontuação ('DR.') quando buscado sem pontuação ('Dr Fabio Rueda')", () => {
			const match = encontrarCandidatoPorNome(candidatosMock, "Dr Fabio Rueda");
			expect(match).not.toBeNull();
			expect(match?.id).toBe(1001);
		});

		it("deve encontrar candidato quando buscado sem prefixo de título ('Fabio Rueda')", () => {
			const match = encontrarCandidatoPorNome(candidatosMock, "Fabio Rueda");
			expect(match).not.toBeNull();
			expect(match?.id).toBe(1001);
		});

		it("deve encontrar candidato quando query possui prefixo de título mas urna não possui", () => {
			const candidatosSemPrefixo = [
				{
					id: 2001,
					nomeUrna: "FABIO RUEDA",
					nomeCompleto: "FABIO GONÇALVES DE RUEDA",
				},
			];
			const match = encontrarCandidatoPorNome(candidatosSemPrefixo, "Dr Fabio Rueda");
			expect(match).not.toBeNull();
			expect(match?.id).toBe(2001);
		});

		it("deve usar nomeSecundario (nome civil) quando nome de urna for apelido", () => {
			const match = encontrarCandidatoPorNome(candidatosMock, "Deputado Francisco", "Francisco Everardo Oliveira Silva");
			expect(match).not.toBeNull();
			expect(match?.id).toBe(1003);
		});

		it("deve retornar null quando nenhum candidato corresponder", () => {
			const match = encontrarCandidatoPorNome(candidatosMock, "Candidato Inexistente");
			expect(match).toBeNull();
		});
	});
});
