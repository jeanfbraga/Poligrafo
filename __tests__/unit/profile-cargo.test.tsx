/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileHeader, { rotuloDoCargo } from "@/components/perfil/ProfileHeader";

describe("rotuloDoCargo", () => {
	it("titular é o caso comum (só o cargo); suplente aparece no rótulo", () => {
		expect(rotuloDoCargo({ condicao_eleitoral: "Titular" })).toBe("Deputado Federal");
		expect(rotuloDoCargo({ condicao_eleitoral: "Suplente" })).toBe("Deputado Federal · Suplente");
	});

	it("sem condição, só o cargo; tolera perfil vazio", () => {
		expect(rotuloDoCargo({})).toBe("Deputado Federal");
		expect(rotuloDoCargo(null)).toBe("Deputado Federal");
	});
});

describe("ProfileHeader — cargo atual visível", () => {
	it("mostra o cargo sob o nome", () => {
		render(
			<ProfileHeader
				idDeputado="74454"
				perfil={{ nome_eleitoral: "Eunício Oliveira", partido: "MDB", uf: "CE", situacao: "Exercício", condicao_eleitoral: "Titular", profissoes: [], comissoes: [], frentes: [] }}
			/>,
		);
		expect(screen.getByText("Deputado Federal")).toBeInTheDocument();
		expect(screen.getAllByText(/exercício/i)).toHaveLength(1);
		expect(screen.getByText("Eunício Oliveira")).toBeInTheDocument();
	});
});
