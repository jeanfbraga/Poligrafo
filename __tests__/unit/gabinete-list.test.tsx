/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GabineteList from "@/components/perfil/GabineteList";

const servidores = [
	{ nome: "ALINE MARIA PEREIRA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 19/02/2025 a 17/02/2026" },
	{ nome: "ALINE MARIA PEREIRA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 31/03/2026" },
	{ nome: "FLAELSON LÉDA DOS REIS", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 14/02/2025 a 17/02/2026" },
];

describe("GabineteList — uma linha por servidor", () => {
	it("agrupa os períodos: 3 registros viram 2 servidores", () => {
		render(<GabineteList servidores={servidores} />);
		expect(screen.getAllByText("Aline Maria Pereira")).toHaveLength(1);
		expect(screen.getByText(/2 servidores · 3 períodos registrados/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Todos \(2\)/ })).toBeInTheDocument();
	});

	it("períodos encerrados não saem mais 'ATIVO': filtros contam por pessoa", () => {
		render(<GabineteList servidores={servidores} />);
		expect(screen.getByRole("button", { name: /Ativos \(1\)/ })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Exonerados \(1\)/ })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /Exonerados/ }));
		expect(screen.getByText("Flaelson Léda dos Reis")).toBeInTheDocument();
		expect(screen.queryByText("Aline Maria Pereira")).toBeNull();
	});

	it("o botão de períodos expande a lista do servidor", () => {
		render(<GabineteList servidores={servidores} />);
		expect(screen.queryByLabelText("Períodos de ALINE MARIA PEREIRA")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /2 períodos/ }));
		const lista = screen.getByLabelText("Períodos de ALINE MARIA PEREIRA");
		expect(lista).toHaveTextContent("Desde 31/03/2026");
		expect(lista).toHaveTextContent("De 19/02/2025 a 17/02/2026");
	});

	it("sem servidores mostra a mensagem do gabinete", () => {
		render(<GabineteList servidores={[]} />);
		expect(screen.getByText(/Nenhum servidor encontrado/)).toBeInTheDocument();
	});
});
