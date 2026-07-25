/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UfHeatGrid } from "@/components/dashboard/UfHeatGrid";

// Mock GSAP (usado pelo BarRanking/AnimatedNumber) para evitar animações em teste
vi.mock("gsap", () => ({
	default: {
		context: (fn: any) => {
			fn();
			return { revert: vi.fn() };
		},
		from: vi.fn(),
		to: (obj: any, config: any) => {
			obj.val = config.val;
			if (config.onUpdate) config.onUpdate();
			return { kill: vi.fn() };
		},
	},
}));
vi.mock("@gsap/react", () => ({ useGSAP: (fn: any) => fn() }));

describe("UfHeatGrid — pódio usa o total pré-computado da UF", () => {
	it("exibe o total real da UF, não a soma dos 5 deputados do detalhe", () => {
		// Regressão do bug "4,4 mi repetidos": o detalhe traz no máx. 5
		// deputados; o pódio deve usar `total` (soma de TODOS os deputados).
		const data = {
			SP: {
				total: 43_479_299.98,
				deputados: [
					{ nome: "DEP A", total_gasto: 900_000, partido: "N/A" },
					{ nome: "DEP B", total_gasto: 800_000, partido: "N/A" },
				],
			},
			MG: { total: 35_597_475.76, deputados: [] },
			RJ: { total: 27_885_519.45, deputados: [] },
			RR: { total: 6_657_386.99, deputados: [] },
		};
		render(<UfHeatGrid data={data as any} />);

		// Pódio: SP (1º) com 43,5 mi — e não "1,7 mi" (soma do detalhe)
		expect(screen.getByText("43,5 mi")).toBeInTheDocument();
		expect(screen.getByText("35,6 mi")).toBeInTheDocument();
		expect(screen.getByText("27,9 mi")).toBeInTheDocument();
		// RR fora do pódio entra no grid a partir do 4º lugar
		expect(screen.getByText("RR")).toBeInTheDocument();
	});

	it("ordena o pódio pelo total, não pela ordem das chaves", () => {
		const data = {
			AC: { total: 6_719_432.75, deputados: [] },
			RR: { total: 6_657_386.99, deputados: [] },
			SP: { total: 43_479_299.98, deputados: [] },
			MG: { total: 35_597_475.76, deputados: [] },
			RJ: { total: 27_885_519.45, deputados: [] },
			BA: { total: 26_718_790.04, deputados: [] },
		};
		render(<UfHeatGrid data={data as any} />);
		expect(screen.getByText("43,5 mi")).toBeInTheDocument(); // SP em 1º
		expect(screen.queryByText("6,7 mi")).not.toBeInTheDocument(); // AC/RR fora do pódio
	});
});
