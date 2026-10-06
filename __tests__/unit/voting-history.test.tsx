/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import VotingHistory, { temaDoVoto } from "@/components/perfil/VotingHistory";

const voto = (extra: Record<string, unknown>) => ({
	id_votacao: "2580259-24",
	id_proposicao: 2601999,
	voto: "Sim",
	projeto_nome: "Aprovado o Substitutivo. Sim: 300; Não: 100",
	projeto_tema: "Economia",
	data_votacao: "2026-08-12T15:00:00",
	...extra,
});

describe("VotingHistory", () => {
	it("leva à proposição principal (prefixo do id da votação), não ao parecer votado", () => {
		render(<VotingHistory votos={[voto({})]} idDeputado="109429" />);
		expect(screen.getByRole("link")).toHaveAttribute("href", "/perfil/deputado/109429/projeto/2580259");
	});

	it("sem o padrão no id da votação, usa o id_proposicao", () => {
		render(<VotingHistory votos={[voto({ id_votacao: "abc" })]} idDeputado="1" />);
		expect(screen.getByRole("link")).toHaveAttribute("href", "/perfil/deputado/1/projeto/2601999");
	});

	it("sem nenhum id, a linha não é link", () => {
		render(<VotingHistory votos={[voto({ id_votacao: "abc", id_proposicao: null })]} idDeputado="1" />);
		expect(screen.queryByRole("link")).toBeNull();
	});
});

describe("temaDoVoto", () => {
	it("mostra o tema quando ele acrescenta algo", () => {
		expect(temaDoVoto(voto({}))).toBe("Economia");
	});

	it("troca por Plenário quando o tema só repete o nome da votação", () => {
		const nome = "Aprovado o Substitutivo. Sim: 300; Não: 100";
		expect(temaDoVoto(voto({ projeto_nome: nome, projeto_tema: nome }))).toBe("Plenário");
		expect(temaDoVoto(voto({ projeto_nome: nome, projeto_tema: "Aprovado o Substitutivo" }))).toBe("Plenário");
	});

	it("tema vazio ou 'Não especificado' vira Plenário", () => {
		expect(temaDoVoto(voto({ projeto_tema: null }))).toBe("Plenário");
		expect(temaDoVoto(voto({ projeto_tema: "Não especificado" }))).toBe("Plenário");
	});
});
