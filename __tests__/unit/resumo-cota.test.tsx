/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResumoCota } from "@/components/dossie/ResumoCota";
import { resumirCota } from "@/lib/investigacao/cota";
import type { DossieNode } from "@/lib/investigacao/dossie-state";

const desp = (id: string, valor: number, data: string): DossieNode => ({
	id,
	type: "DESPESA",
	position: { x: 0, y: 0 },
	data: { label: id, valor, dataDocumento: data },
});

describe("ResumoCota", () => {
	it("mostra total, período e o recorte (60 maiores notas desde 2024)", () => {
		const notas = Array.from({ length: 60 }, (_, i) => desp(`d${i}`, 100, i === 0 ? "2024-02-06T00:00:00" : "2026-08-25T00:00:00"));
		render(<ResumoCota resumo={resumirCota(notas, [])!} />);
		const bloco = screen.getByLabelText("Resumo da cota parlamentar");
		expect(bloco).toHaveTextContent("6.000,00");
		expect(bloco).toHaveTextContent("60 notas");
		expect(bloco).toHaveTextContent("06/02/2024");
		expect(bloco).toHaveTextContent("25/08/2026");
		expect(bloco).toHaveTextContent(/60 maiores notas \(por valor\) desde 2024/);
	});

	it("com poucas notas diz que são todas", () => {
		render(<ResumoCota resumo={resumirCota([], [desp("a", 10, "2025-01-01"), desp("b", 20, "2025-02-01")])!} />);
		expect(screen.getByLabelText("Resumo da cota parlamentar")).toHaveTextContent("Todas as 2 notas desde 2024");
	});
});
