import { describe, expect, it } from "vitest";
import {
	cnpjValido,
	cpfValido,
	documentoOuNulo,
	ehMascarado,
	mascararCpf,
	mioloCpf,
} from "../../src/lib/documento";

describe("documento", () => {
	it("valida CPF pelos dígitos verificadores", () => {
		expect(cpfValido("529.982.247-25")).toBe(true);
		expect(cpfValido("52998224726")).toBe(false);
		expect(cpfValido("00000000000")).toBe(false); // sentinela antiga
		expect(cpfValido("11111111111")).toBe(false);
		expect(cpfValido("123")).toBe(false);
	});

	it("valida CNPJ pelos dígitos verificadores", () => {
		expect(cnpjValido("33.000.167/0001-01")).toBe(true); // Petrobras
		expect(cnpjValido("33000167000102")).toBe(false);
		expect(cnpjValido("00000000000000")).toBe(false); // sentinela antiga
	});

	it("CPF mascarado pela fonte nunca é válido (antes virava '123456')", () => {
		expect(ehMascarado("***.123.456-**")).toBe(true);
		expect(cpfValido("***.123.456-**")).toBe(false);
		expect(documentoOuNulo("***.123.456-**")).toBeNull();
	});

	it("documento inválido vira null, nunca sentinela", () => {
		expect(documentoOuNulo("")).toBeNull();
		expect(documentoOuNulo("00000000000000")).toBeNull();
		expect(documentoOuNulo("529.982.247-25")).toBe("52998224725");
	});

	it("máscara LGPD no formato do QSA e miolo para conferência de sócio", () => {
		expect(mascararCpf("52998224725")).toBe("***.982.247-**");
		expect(mioloCpf("***.982.247-**")).toBe("982247");
		expect(mioloCpf("529.982.247-25")).toBe("982247");
		expect(mioloCpf("x")).toBeNull();
	});
});
