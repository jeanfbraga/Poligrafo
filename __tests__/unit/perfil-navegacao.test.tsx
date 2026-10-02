/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NavegacaoDeSecoes from "@/components/perfil/NavegacaoDeSecoes";
import { ResumoPerfil } from "@/components/perfil/ResumoPerfil";
import { resumoDoPerfil } from "@/lib/perfil-resumo";

const SECOES = [
	{ id: "perfil", rotulo: "Perfil" },
	{ id: "invest", rotulo: "Investigação" },
	{ id: "cota", rotulo: "Cota" },
];

afterEach(() => {
	document.body.innerHTML = "";
});

describe("NavegacaoDeSecoes", () => {
	it("a primeira seção começa ativa e todas as abas aparecem", () => {
		render(<NavegacaoDeSecoes secoes={SECOES} />);
		expect(screen.getByRole("navigation", { name: "Seções do perfil" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Perfil" })).toHaveAttribute("aria-current", "true");
		expect(screen.getByRole("button", { name: "Cota" })).toHaveAttribute("aria-current", "false");
	});

	it("clicar numa aba a marca como atual e rola até a seção", () => {
		const alvo = document.createElement("section");
		alvo.id = "cota";
		alvo.scrollIntoView = vi.fn();
		document.body.appendChild(alvo);
		render(<NavegacaoDeSecoes secoes={SECOES} />);
		fireEvent.click(screen.getByRole("button", { name: "Cota" }));
		expect(screen.getByRole("button", { name: "Cota" })).toHaveAttribute("aria-current", "true");
		expect(alvo.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
	});
});

describe("ResumoPerfil", () => {
	it("mostra os 5 números e cada um leva à sua seção", () => {
		const alvo = document.createElement("section");
		alvo.id = "patrimonio";
		alvo.scrollIntoView = vi.fn();
		document.body.appendChild(alvo);
		render(<ResumoPerfil itens={resumoDoPerfil({ tse: { patrimonioTotal: 1500000, anoEleicao: 2022 }, producao: [{}], votos: [{}, {}] })} />);
		expect(screen.getAllByRole("listitem")).toHaveLength(5);
		fireEvent.click(screen.getByTitle("Ir para Patrimônio declarado"));
		expect(alvo.scrollIntoView).toHaveBeenCalled();
	});
});
