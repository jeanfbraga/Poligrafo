/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { construirCard } from "@/components/nodes/card-model";
import { AvaliacaoIA, ChipScore, NodeCard } from "@/components/nodes/NodeCard";

const despesa = (score: number | undefined, motivo = "Despesa sem padrões de risco.") =>
	construirCard("DESPESA", { label: "RADIO PRESS PRODUCOES LTDA", valor: 17508, score_letalidade: score, motivo_ia: motivo, casa: "CAMARA" });

describe("NodeCard — avaliação da IA fora do cabeçalho", () => {
	it("o score não fica no cabeçalho (não compete com o tipo/título)", () => {
		const { container } = render(<NodeCard modelo={despesa(30)} />);
		const cab = container.querySelector(".pg-node__head");
		expect(cab).toBeInTheDocument();
		expect(cab!.querySelector(".pg-node__score")).toBeNull();
	});

	it("mostra o bloco Avaliação IA com nível, nota, barra e justificativa", () => {
		render(<AvaliacaoIA modelo={despesa(30)} />);
		const bloco = screen.getByLabelText("Avaliação da IA");
		expect(bloco).toHaveClass("pg-ia--ok");
		expect(bloco).toHaveTextContent("NORMAL");
		expect(bloco).toHaveTextContent("30");
		expect(bloco).toHaveTextContent("/100");
		expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
		expect(bloco).toHaveTextContent("Despesa sem padrões de risco.");
	});

	it("risco crítico e atenção usam o nível correspondente", () => {
		const { rerender } = render(<AvaliacaoIA modelo={despesa(90, "Fracionamento suspeito")} />);
		expect(screen.getByLabelText("Avaliação da IA")).toHaveClass("pg-ia--crit");
		expect(screen.getByLabelText("Avaliação da IA")).toHaveTextContent("CRÍTICO");
		rerender(<AvaliacaoIA modelo={despesa(70, "Valor acima da média")} />);
		expect(screen.getByLabelText("Avaliação da IA")).toHaveClass("pg-ia--warn");
		expect(screen.getByLabelText("Avaliação da IA")).toHaveTextContent("ATENÇÃO");
	});

	it("sem score só aparece a justificativa (sem barra)", () => {
		const m = construirCard("PESSOA", { label: "ALICE" });
		render(<AvaliacaoIA modelo={{ ...m, score: null, motivo: "Contexto" }} />);
		expect(screen.queryByRole("progressbar")).toBeNull();
		expect(screen.getByText(/Contexto/)).toBeInTheDocument();
	});

	it("destaque textual longo (qualificação do sócio) usa o modificador de corpo menor", () => {
		const longo = construirCard("SOCIO", { label: "MATTHEUS", cargo: "30-Sócio ou Acionista Menor (Assistido/Representado)" });
		const { container, rerender } = render(<NodeCard modelo={longo} />);
		expect(container.querySelector(".pg-node__hero--long")).toBeInTheDocument();
		rerender(<NodeCard modelo={construirCard("SOCIO", { label: "X", cargo: "Sócio" })} />);
		expect(container.querySelector(".pg-node__hero--long")).toBeNull();
	});

	it("crítico por regra (emenda fantasma, nota 20) explica a regra em vez de parecer nota alta", () => {
		const m = construirCard("EMENDA", { label: "E", isFantasma: true, score_letalidade: 20, motivo_ia: "Execução 12%" });
		expect(m.regra).toBe("emenda fantasma");
		render(<AvaliacaoIA modelo={m} />);
		const bloco = screen.getByLabelText("Avaliação da IA");
		expect(bloco).toHaveClass("pg-ia--crit");
		expect(bloco).toHaveTextContent("CRÍTICO · REGRA");
		expect(bloco).toHaveTextContent("Crítico por regra: emenda fantasma. Nota da IA: 20/100.");
	});

	it("chip compacto mostra REGRA (e a nota no tooltip) quando o crítico vem de regra", () => {
		const m = construirCard("EMENDA", { label: "E", isFantasma: true, score_letalidade: 20 });
		const { container } = render(<ChipScore modelo={m} />);
		const chip = container.querySelector(".pg-node__score")!;
		expect(chip).toHaveTextContent("REGRA");
		expect(chip.getAttribute("title")).toMatch(/Nota da IA: 20\/100/);
	});

	it("linha mobile não repete o subtítulo quando ele é igual ao tipo", () => {
		const m = { ...despesa(30), tag: "Manutenção de escritório", sub: "MANUTENÇÃO DE ESCRITÓRIO" };
		const { container, rerender } = render(<NodeCard modelo={m} densidade="row" />);
		expect(container.querySelectorAll(".pg-row__t > span")).toHaveLength(0);
		rerender(<NodeCard modelo={{ ...m, sub: "Outro texto" }} densidade="row" />);
		expect(container.querySelectorAll(".pg-row__t > span")).toHaveLength(1);
	});

	it("densidade slim só mostra o score quando há risco", () => {
		const { container, rerender } = render(<NodeCard modelo={despesa(30)} densidade="slim" />);
		expect(container.querySelector(".pg-node__score")).toBeNull();
		rerender(<NodeCard modelo={despesa(90)} densidade="slim" />);
		expect(container.querySelector(".pg-node__score--inline")).toBeInTheDocument();
	});
});
