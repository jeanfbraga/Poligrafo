/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PessoaAvatar } from "@/components/nodes/PessoaAvatar";

describe("PessoaAvatar — cadeia de fallback de foto", () => {
	it("renderiza a foto principal primeiro", () => {
		render(<PessoaAvatar urlFoto="https://supabase.co/foto.jpg" urlFotoFallback="https://camara.leg.br/f.jpg" nome="Teste" />);
		expect(screen.getByRole("img").getAttribute("src")).toBe("https://supabase.co/foto.jpg");
	});

	it("usa o fallback quando a principal falha", () => {
		render(<PessoaAvatar urlFoto="https://supabase.co/invalida.jpg" urlFotoFallback="https://camara.leg.br/f.jpg" nome="Teste" />);
		fireEvent.error(screen.getByRole("img"));
		expect(screen.getByRole("img").getAttribute("src")).toBe("https://camara.leg.br/f.jpg");
	});

	it("sem fotos (ou ambas falhando) mostra o ícone pixel de pessoa", () => {
		const { container, rerender } = render(<PessoaAvatar urlFoto={null} urlFotoFallback={null} />);
		expect(screen.queryByRole("img")).toBeNull();
		expect(container.querySelector("svg")).toBeInTheDocument();
		rerender(<PessoaAvatar urlFoto="a.jpg" nome="X" />);
		fireEvent.error(screen.getByRole("img"));
		expect(screen.queryByRole("img")).toBeNull();
		expect(container.querySelector("svg")).toBeInTheDocument();
	});
});
