/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UfPainel } from "@/components/dashboard/UfPainel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const dados = {
	SP: { total: 43_479_299.98, deputados: [{ nome: "DEP A", total_gasto: 900_000, partido: "ABC", uf: "SP", id_deputado: 1 }] },
	MG: { total: 35_597_475.76, deputados: [] },
	RJ: { total: 27_885_519.45, deputados: [] },
	RR: { total: 6_657_386.99, deputados: [] },
	AC: { total: 6_719_432.75, deputados: [] },
};

describe("UfPainel — pódio e mapa pixel", () => {
	it("o pódio usa o total pré-computado da UF e ordena por total (2º · 1º · 3º)", () => {
		render(<UfPainel ceapEstados={dados} mobile={false} />);
		expect(screen.getByText("43,5 mi")).toBeInTheDocument();
		expect(screen.getByText("35,6 mi")).toBeInTheDocument();
		expect(screen.getByText("27,9 mi")).toBeInTheDocument();
		// AC e RR ficam fora do pódio
		expect(screen.queryByText("6,7 mi")).not.toBeInTheDocument();
		const botoes = screen.getAllByRole("button", { name: /lugar/ });
		expect(botoes.map((b) => b.getAttribute("aria-label"))).toEqual([
			expect.stringContaining("2º lugar, Minas Gerais"),
			expect.stringContaining("1º lugar, São Paulo"),
			expect.stringContaining("3º lugar, Rio de Janeiro"),
		]);
	});

	it("desktop mostra o mapa do Brasil e o detalhe da UF líder", () => {
		render(<UfPainel ceapEstados={dados} mobile={false} />);
		expect(screen.getByRole("img", { name: /Mapa do Brasil/ })).toBeInTheDocument();
		expect(screen.getByText(/SP · São Paulo · #1/)).toBeInTheDocument();
		expect(screen.getByText("DEP A")).toBeInTheDocument();
	});

	it("clicar numa UF do mapa troca o detalhe", () => {
		render(<UfPainel ceapEstados={dados} mobile={false} />);
		fireEvent.click(screen.getByRole("button", { name: "RJ · Rio de Janeiro" }));
		expect(screen.getByText(/RJ · Rio de Janeiro · #3/)).toBeInTheDocument();
	});

	it("o 1º lugar dispara a celebração do troféu com fogos", () => {
		const { container } = render(<UfPainel ceapEstados={dados} mobile={false} />);
		fireEvent.mouseEnter(screen.getByRole("button", { name: /1º lugar/ }));
		expect(container.querySelector(".pg-trophy--celebrating")).toBeInTheDocument();
		expect(container.querySelectorAll(".pg-particle").length).toBeGreaterThan(0);
	});

	it("mobile não renderiza o mapa: mostra ranking por estado em lista", () => {
		render(<UfPainel ceapEstados={dados} mobile />);
		expect(screen.queryByRole("img", { name: /Mapa do Brasil/ })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /SP\s*São Paulo/ }));
		expect(screen.getByText("DEP A")).toBeInTheDocument();
	});

	it("mobile limita a 8 estados e expande para todos", () => {
		const muitos = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`U${i}`, { total: 100 - i, deputados: [] }]));
		render(<UfPainel ceapEstados={muitos} mobile />);
		expect(screen.getByRole("button", { name: "Ver os 12 estados" })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Ver os 12 estados" }));
		expect(screen.getByRole("button", { name: "Mostrar só os 8 primeiros" })).toBeInTheDocument();
	});

	it("sem dados não renderiza nada", () => {
		const { container } = render(<UfPainel ceapEstados={{}} mobile={false} />);
		expect(container).toBeEmptyDOMElement();
	});
});
