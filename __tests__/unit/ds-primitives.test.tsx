/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	FilterChip,
	KStats,
	Kv,
	Panel,
	PixelBar,
	RankRow,
	Seg,
	Tag,
} from "@/components/ds";
import { PixelIcon } from "@/components/pixel/PixelIcon";

describe("PixelIcon", () => {
	it("é decorativo (aria-hidden) sem rótulo", () => {
		const { container } = render(<PixelIcon name="search" />);
		expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
	});

	it("expõe role=img quando recebe rótulo", () => {
		render(<PixelIcon name="search" label="Buscar" />);
		expect(screen.getByRole("img", { name: "Buscar" })).toBeInTheDocument();
	});

	it("usa 16px (grade 8) entre 12 e 15 e 20px (grade 10) a partir de 16", () => {
		const { container, rerender } = render(<PixelIcon name="user" size={14} />);
		expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 8 8");
		expect(container.querySelector("svg")).toHaveAttribute("width", "16");
		rerender(<PixelIcon name="user" size={20} />);
		expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 10 10");
		expect(container.querySelector("svg")).toHaveAttribute("width", "20");
	});
});

describe("Tag, FilterChip e Seg", () => {
	it("Tag aplica a classe do tom", () => {
		render(<Tag tone="crit">CRÍTICO</Tag>);
		expect(screen.getByText("CRÍTICO")).toHaveClass("pg-tag", "pg-tag--crit");
	});

	it("FilterChip reflete aria-pressed e dispara onClick", () => {
		const onClick = vi.fn();
		render(
			<FilterChip pressed onClick={onClick} tone="warn">
				Atenção
			</FilterChip>,
		);
		const chip = screen.getByRole("button", { name: "Atenção" });
		expect(chip).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(chip);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("Seg marca a opção ativa e notifica a troca", () => {
		const onChange = vi.fn();
		render(
			<Seg
				label="Visão"
				value="a"
				onChange={onChange}
				options={[
					{ value: "a", label: "Achados" },
					{ value: "b", label: "Rede" },
				]}
			/>,
		);
		expect(screen.getByRole("button", { name: "Achados" })).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(screen.getByRole("button", { name: "Rede" }));
		expect(onChange).toHaveBeenCalledWith("b");
	});
});

describe("Panel, Kv, KStats", () => {
	it("Panel renderiza título, subtítulo e corpo", () => {
		render(
			<Panel title="Votos" sub="Plenário" flush>
				<p>conteúdo</p>
			</Panel>,
		);
		expect(screen.getByText("Votos")).toBeInTheDocument();
		expect(screen.getByText("Plenário")).toHaveClass("pg-panel__sub");
		expect(screen.getByText("conteúdo").parentElement).toHaveClass("pg-panel__body--flush");
	});

	it("Kv destaca o item big", () => {
		render(<Kv items={[{ key: "v", label: "Valor", value: "R$ 1,00", big: true }]} />);
		expect(screen.getByText("R$ 1,00")).toHaveClass("pg-kv__big");
	});

	it("KStats usa a variante de 3 colunas e cor de risco", () => {
		const { container } = render(
			<KStats
				cols={3}
				items={[
					{ key: "a", label: "Nós", value: 5 },
					{ key: "b", label: "Críticos", value: 2, tone: "crit" },
				]}
			/>,
		);
		expect(container.firstChild).toHaveClass("pg-kstats--3");
		expect(screen.getByText("2")).toHaveStyle({ color: "var(--pg-crit)" });
	});
});

describe("PixelBar e RankRow", () => {
	it("PixelBar limita o valor entre 0 e 100", () => {
		const { rerender } = render(<PixelBar value={150} />);
		expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
		rerender(<PixelBar value={-5} />);
		expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
	});

	it("RankRow numera com dois dígitos e vira botão com onClick", () => {
		const onClick = vi.fn();
		render(<RankRow pos={3} name="Fulano" sub="XYZ·RJ" value="R$ 1 mi" percent={40} onClick={onClick} />);
		expect(screen.getByText("03")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button"));
		expect(onClick).toHaveBeenCalled();
	});

	it("RankRow sem onClick não é botão", () => {
		render(<RankRow pos={1} name="Fulano" value="1" percent={10} />);
		expect(screen.queryByRole("button")).toBeNull();
	});
});
