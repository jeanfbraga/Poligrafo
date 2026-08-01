/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PessoaNode } from "../../src/components/nodes/PessoaNode";
import React from "react";

// Mock React Flow components that NodeShell might use
vi.mock("@xyflow/react", () => ({
	Handle: ({ type, position, id }: any) => (
		<div data-testid={`handle-${type}-${position}-${id}`} />
	),
	Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

describe("PessoaNode Photo Fallback", () => {
	it("should render primary photo initially", () => {
		const data = {
			label: "Político Teste",
			cargo: "SENADOR",
			uf: "SP",
			urlFoto: "https://supabase.co/foto.jpg",
			urlFotoFallback: "https://camara.leg.br/foto-fallback.jpg",
		};
		render(<PessoaNode data={data} />);
		
		const img = screen.getByRole("img");
		expect(img.getAttribute("src")).toBe("https://supabase.co/foto.jpg");
	});

	it("should fallback to urlFotoFallback if primary photo fails", () => {
		const data = {
			label: "Político Teste",
			cargo: "SENADOR",
			uf: "SP",
			urlFoto: "https://supabase.co/foto-invalida.jpg",
			urlFotoFallback: "https://camara.leg.br/foto-fallback.jpg",
		};
		render(<PessoaNode data={data} />);
		
		const img = screen.getByRole("img");
		expect(img.getAttribute("src")).toBe("https://supabase.co/foto-invalida.jpg");

		// Simulate image load error
		fireEvent.error(img);

		// Now it should have fallback src
		expect(img.getAttribute("src")).toBe("https://camara.leg.br/foto-fallback.jpg");
	});

	it("should render generic User icon if no photo is provided", () => {
		const data = {
			label: "Político Teste",
			cargo: "SENADOR",
			uf: "SP",
			urlFoto: null,
			urlFotoFallback: null,
		};
		
		const { container } = render(<PessoaNode data={data} />);
		
		// Img shouldn't exist
		const img = screen.queryByRole("img");
		expect(img).toBeNull();
		
		// Should contain svg (lucide User icon) inside the header area
		const svg = container.querySelector("svg");
		expect(svg).toBeTruthy();
	});
});
