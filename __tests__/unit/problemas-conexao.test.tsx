/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { avisoDoProblema } from "@/components/dossie/Avisos";
import { EtapasPorFonte } from "@/components/investigacao/EtapasPorFonte";
import { ProblemasDeConexao, tituloDosProblemas } from "@/components/investigacao/ProblemasDeConexao";
import type { ProblemaDeFonte } from "@/lib/investigacao/etapas";

const FORA: ProblemaDeFonte = { fonte: "pncp", nome: "PNCP e contratos", texto: "PNCP (portal federal de contratos): demorou demais para responder", gravidade: "fora" };
const PARCIAL: ProblemaDeFonte = { fonte: "tse", nome: "TSE", texto: "TSE (Justiça Eleitoral): recusou o acesso; o restante respondeu", gravidade: "parcial" };

describe("quadro 'Algumas fontes não responderam'", () => {
	it("some sem problema; com problema diz quem, por quê e o que isso significa", () => {
		const { container } = render(<ProblemasDeConexao problemas={[]} rodando />);
		expect(container).toBeEmptyDOMElement();
		render(<ProblemasDeConexao problemas={[FORA, PARCIAL]} rodando />);
		expect(screen.getByRole("status")).toHaveTextContent("2 fontes não responderam");
		expect(screen.getByText("PNCP e contratos")).toBeInTheDocument();
		expect(screen.getByRole("status")).toHaveTextContent("demorou demais para responder");
		expect(screen.getByRole("status")).toHaveTextContent("A investigação continua com as outras fontes.");
		expect(screen.getByRole("status")).toHaveTextContent("isso não quer dizer que não exista");
		expect(tituloDosProblemas(1)).toBe("Uma fonte não respondeu");
	});

	it("no dossiê vira aviso compacto: nada entrou (fora) ou parte entrou (parcial)", () => {
		expect(avisoDoProblema(FORA)).toEqual({
			fonte: "PNCP e contratos · não respondeu",
			mensagem: "PNCP (portal federal de contratos): demorou demais para responder. Nada desta fonte entrou no dossiê; isso não quer dizer que os dados não existam.",
		});
		expect(avisoDoProblema(PARCIAL).mensagem).toContain("Parte desta fonte não entrou no dossiê");
	});
});

describe("lista de fontes", () => {
	it("mostra o estado em palavras e, abaixo do nome, o que aconteceu (ou a descrição fixa)", () => {
		render(
			<EtapasPorFonte
				etapas={[
					{ id: "pncp", nome: "PNCP e contratos", detalhe: "contratos e licitações", status: "fora", texto: "não respondeu", nota: "PNCP: demorou demais para responder" },
					{ id: "casa", nome: "Casa legislativa", detalhe: "perfil, cota e votações", status: "ok", texto: "ok", nota: null },
				]}
			/>,
		);
		const itens = screen.getAllByRole("listitem");
		expect(itens[0]).toHaveAttribute("data-s", "fora");
		expect(itens[0]).toHaveAccessibleName("PNCP e contratos: não respondeu. PNCP: demorou demais para responder");
		expect(itens[0]).toHaveTextContent("✕");
		expect(itens[1]).toHaveTextContent("perfil, cota e votações");
	});
});
