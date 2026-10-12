import { describe, it, expect } from "vitest";
import { cleanPunctuation, matchPalavraInteira } from "../../src/app/api/investigar/tse";

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
});
