import { describe, expect, it } from "vitest";
import {
	brl,
	brlCurto,
	cpfMascarado,
	dataBR,
	documentoFormatado,
	iniciais,
	numeroSeguro,
	percentual,
	soDigitos,
} from "@/lib/format";

describe("formatadores pt-BR", () => {
	it("numeroSeguro aceita número e texto numérico e rejeita o resto", () => {
		expect(numeroSeguro("12.5")).toBe(12.5);
		expect(numeroSeguro(0)).toBe(0);
		expect(numeroSeguro("")).toBeNull();
		expect(numeroSeguro(null)).toBeNull();
		expect(numeroSeguro("abc")).toBeNull();
		expect(numeroSeguro(Number.NaN)).toBeNull();
	});

	it("brl usa duas casas e traço para inválido", () => {
		expect(brl(1482300)).toBe("R$ 1.482.300,00");
		expect(brl(0)).toBe("R$ 0,00");
		expect(brl(undefined)).toBe("—");
	});

	it("brlCurto escolhe a escala certa", () => {
		expect(brlCurto(800)).toBe("R$ 800");
		expect(brlCurto(1230.4)).toBe("R$ 1,2 mil");
		expect(brlCurto(48900)).toBe("R$ 49 mil");
		expect(brlCurto(1186000)).toBe("R$ 1,19 mi");
		expect(brlCurto(14210000)).toBe("R$ 14,21 mi");
		expect(brlCurto(2.1e9)).toBe("R$ 2,1 bi");
		expect(brlCurto("x")).toBe("—");
	});

	it("documento: CPF, CNPJ e outros", () => {
		expect(soDigitos("12.345.678/0001-90")).toBe("12345678000190");
		expect(documentoFormatado("12345678901")).toBe("123.456.789-01");
		expect(documentoFormatado("12345678000190")).toBe("12.345.678/0001-90");
		expect(documentoFormatado("123")).toBe("123");
		expect(documentoFormatado(undefined)).toBe("");
	});

	it("cpfMascarado mantém o miolo; não-CPF vira vazio", () => {
		expect(cpfMascarado("12345678901")).toBe("***.456.789-**");
		expect(cpfMascarado("123")).toBe("");
	});

	it("dataBR converte ISO e preserva dd/mm/aaaa", () => {
		expect(dataBR("2025-03-12")).toBe("12/03/2025");
		expect(dataBR("2025-03-12T10:00:00Z")).toBe("12/03/2025");
		expect(dataBR("12/03/2025")).toBe("12/03/2025");
		expect(dataBR("2025-03-12 10:00")).toBe("12/03/2025");
		expect(dataBR("texto livre")).toBe("texto livre");
		expect(dataBR(null)).toBe("");
	});

	it("percentual e iniciais", () => {
		expect(percentual(38.24)).toBe("38,2%");
		expect(percentual("x")).toBe("—");
		expect(iniciais("Alice Ribeiro Monteiro")).toBe("AM");
		expect(iniciais("Alice")).toBe("A");
		expect(iniciais("  ")).toBe("");
	});
});
