/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandSearch } from "@/components/layout/CommandSearch";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** O nome vem fatiado em spans por causa do destaque; casa pelo texto completo do <b>. */
const porNome = (nome: string) => (_: string, el: Element | null) => el?.tagName === "B" && el.textContent === nome;

describe("CommandSearch (busca global)", () => {
	beforeEach(() => {
		push.mockClear();
		localStorage.clear();
		global.fetch = vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ pesquisas: [] }) });
	});

	const digitar = (texto: string) => {
		const input = screen.getByPlaceholderText("nome do político");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: texto } });
		return input;
	};

	it("a alçada já vem pré-selecionada em FEDERAL", () => {
		render(<CommandSearch />);
		expect(screen.getByRole("button", { name: /Alçada: FEDERAL/ })).toBeInTheDocument();
	});

	it("encontra Lula com digitação parcial e sem acento", async () => {
		render(<CommandSearch />);
		digitar("Inacio lula");
		await waitFor(() => expect(screen.getByText(porNome("Luiz Inácio Lula da Silva"))).toBeInTheDocument());
	});

	it("mostra o órgão (CMA) de vereadores no resultado", async () => {
		render(<CommandSearch />);
		digitar("Elber");
		await waitFor(() => {
			expect(screen.getByText(porNome("Elber Batalha"))).toBeInTheDocument();
			expect(screen.getByText("CMA")).toBeInTheDocument();
		});
	});

	it("Enter abre o resultado destacado: presidente vai ao perfil do presidente", async () => {
		render(<CommandSearch />);
		const input = digitar("Inacio lula");
		await waitFor(() => screen.getByText(porNome("Luiz Inácio Lula da Silva")));
		fireEvent.keyDown(input, { key: "Enter" });
		expect(push).toHaveBeenCalledWith("/perfil/presidente/lula");
	});

	it("sem resultados oferece a busca ao vivo, que vai ao Dossiê com a alçada", async () => {
		render(<CommandSearch />);
		digitar("Zzzzz Inexistente");
		fireEvent.click(await screen.findByText("Buscar nas fontes ao vivo"));
		expect(push).toHaveBeenCalledTimes(1);
		const href = String(push.mock.calls[0][0]);
		expect(href).toContain("/dossie?");
		expect(href).toContain("uf=FEDERAL");
	});

	it("Esc fecha o dropdown e o popover de alçada lista os 27 estados", () => {
		render(<CommandSearch />);
		const input = digitar("a");
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		fireEvent.keyDown(input, { key: "Escape" });
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /Alçada/ }));
		expect(screen.getAllByRole("button").filter((b) => /^[A-Z]{2}$/.test(b.textContent ?? "")).length).toBe(27);
	});

	it("trocar a alçada filtra os resultados e é lembrada", async () => {
		render(<CommandSearch />);
		fireEvent.click(screen.getByRole("button", { name: /Alçada/ }));
		fireEvent.click(screen.getByRole("button", { name: "SE" }));
		expect(localStorage.getItem("pg:alcada")).toBe("SE");
		expect(screen.getByRole("button", { name: /Alçada: SE/ })).toBeInTheDocument();
	});
});
