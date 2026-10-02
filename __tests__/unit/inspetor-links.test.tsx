/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Inspetor } from "@/components/dossie/Inspetor";
import type { DossieNode } from "@/lib/investigacao/dossie-state";

const no = (id: string, type: string, data: Record<string, unknown>): DossieNode => ({ id, type, position: { x: 0, y: 0 }, data });

function abrir(pessoa: Record<string, unknown>, despesa: Record<string, unknown>, extra: Partial<Parameters<typeof Inspetor>[0]> = {}) {
	const nodes = [no("1", "PESSOA", { label: "Fulano", ...pessoa }), no("2", "DESPESA", { valor: 1000, ...despesa })];
	return render(
		<Inspetor node={nodes[1]} nodes={nodes} edges={[]} jaExpandido={false} ocupado={false} onFechar={vi.fn()} onSelecionar={vi.fn()} onCompartilhar={vi.fn()} onAcao={vi.fn()} {...extra} />,
	);
}

describe("Inspetor — links de documento e portais de transparência", () => {
	it("Câmara sem nota: oferece o Portal de Dados da Câmara (e não o do Senado)", () => {
		abrir({ casa: "CAMARA", cargo: "Deputada Federal" }, { label: "PASSAGEM AÉREA", urlDocumento: null });
		const link = screen.getByRole("link", { name: /Portal de Dados da Câmara/i });
		expect(link).toHaveAttribute("href", "https://dadosabertos.camara.leg.br/");
		expect(screen.queryByRole("link", { name: /Portal do Senado/i })).toBeNull();
	});

	it("Senado sem nota: oferece o Portal do Senado", () => {
		abrir({ casa: "SENADO" }, { label: "ALUGUEL", urlDocumento: null });
		expect(screen.getByRole("link", { name: /Portal do Senado/i })).toHaveAttribute("href", "https://www12.senado.leg.br/transparencia");
		expect(screen.queryByRole("link", { name: /Portal de Dados da Câmara/i })).toBeNull();
	});

	it("com nota digitalizada: mostra o link exato do documento", () => {
		abrir({ casa: "CAMARA" }, { label: "COMBUSTÍVEL", urlDocumento: "https://www.camara.leg.br/documentos/12345.pdf" });
		expect(screen.getByRole("link", { name: /Ver nota digitalizada/i })).toHaveAttribute("href", "https://www.camara.leg.br/documentos/12345.pdf");
	});

	it("ALERJ sem nota: Transparência ALERJ", () => {
		abrir({ casa: "ALERJ" }, { label: "ALIMENTAÇÃO", urlDocumento: null });
		expect(screen.getByRole("link", { name: /Transparência ALERJ/i })).toHaveAttribute("href", "https://www.alerj.rj.gov.br/Transparencia/");
	});

	it("Prefeitura sem nota: portal local usando a URI da pessoa", () => {
		abrir({ casa: "PREFEITURA", uri: "https://transparencia.cidade.sp.gov.br" }, { label: "EVENTO", urlDocumento: null });
		expect(screen.getByRole("link", { name: /Portal da Transparência/i })).toHaveAttribute("href", "https://transparencia.cidade.sp.gov.br");
	});

	it("fornecedor com CNPJ oferece aprofundar; ao clicar dispara a ação com o CNPJ", () => {
		const onAcao = vi.fn();
		abrir({ casa: "CAMARA" }, { label: "ACME", documento: "12345678000190" }, { onAcao });
		fireEvent.click(screen.getByRole("button", { name: /Aprofundar investigação/i }));
		expect(onAcao).toHaveBeenCalledWith(expect.objectContaining({ id: "pivot-cnpj", arg: "12345678000190" }), expect.anything());
	});

	it("com aprofundamento em andamento o botão fica desabilitado", () => {
		abrir({ casa: "CAMARA" }, { label: "ACME", documento: "12345678000190" }, { ocupado: true });
		expect(screen.getByRole("button", { name: /Aprofundar investigação/i })).toBeDisabled();
	});

	it("já expandido mostra a confirmação no lugar do botão", () => {
		abrir({ casa: "CAMARA" }, { label: "ACME", documento: "12345678000190" }, { jaExpandido: true });
		expect(screen.getByText(/aprofundamento concluído no canvas/i)).toBeInTheDocument();
	});

	it("o caixa de risco reflete o score e o motivo da IA", () => {
		abrir({ casa: "CAMARA" }, { label: "X", score_letalidade: 91, motivo_ia: "Fornecedor recente." });
		expect(screen.getByText(/CRÍTICO/)).toBeInTheDocument();
		expect(screen.getByText(/Score 91\/100/)).toBeInTheDocument();
		expect(screen.getByText(/Fornecedor recente\./)).toBeInTheDocument();
	});
});
