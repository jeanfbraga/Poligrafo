/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobBanner, JobChip, JobRibbon, jobVisivel } from "@/components/investigacao/JobIndicadores";
import { InvestigacaoProvider } from "@/components/investigacao/InvestigacaoProvider";
import { JobPanel } from "@/components/investigacao/JobPanel";
import { aplicarEventos, iniciarDossie } from "@/lib/investigacao/dossie-state";
import { criarStore, STORE_INICIAL, type Store } from "@/lib/investigacao/store";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const ev = (tipo: string, payload: unknown) => ({ tipo, payload });
const alvo = { nome: "Alice", ref: "FEDERAL:CAMARA:1", uf: "FEDERAL" };

function storeCom(status: "running" | "done" | "partial" | "error"): Store {
	let dossie = iniciarDossie({ label: "Alice", uf: "FEDERAL" });
	dossie = aplicarEventos(dossie, [
		ev("STATUS", { msg: "Puxando financiadores de campanha no TSE..." }),
		ev("NODE_NOVO", { id: "p1", type: "PESSOA", data: { label: "ALICE" } }),
		ev("NODE_NOVO", { id: "d1", type: "DESPESA", data: { score_letalidade: 90 } }),
	]);
	if (status === "done") dossie = aplicarEventos(dossie, [ev("DONE", {})]);
	if (status === "error") dossie = aplicarEventos(dossie, [ev("ERROR", { mensagem: "Sem resposta" })]);
	if (status === "partial") dossie = { ...dossie, status: "partial" };
	return criarStore({ ...STORE_INICIAL, alvo, dossie, inicio: Date.now() - 65_000, fim: status === "running" ? null : Date.now() });
}

const montar = (store: Store, ui: React.ReactNode) =>
	render(<InvestigacaoProvider storeInicial={store}>{ui}</InvestigacaoProvider>);

describe("JobPanel — estados da investigação", () => {
	it("ocioso: explica o tempo e oferece Investigar", () => {
		const store = criarStore();
		montar(store, <JobPanel alvo={alvo} onAbrir={() => {}} />);
		expect(screen.getByText(/leva alguns/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Investigar/i })).toBeInTheDocument();
		expect(screen.queryByText(/Cancelar/)).toBeNull();
	});

	it("com a ação principal no topo, o painel não repete Investigar / Acompanhar / Abrir dossiê", () => {
		const { unmount } = montar(criarStore(), <JobPanel alvo={alvo} onAbrir={() => {}} acaoNoTopo />);
		expect(screen.queryByRole("button", { name: /Investigar/i })).toBeNull();
		expect(screen.getByText(/botão Investigar parlamentar no topo/)).toBeInTheDocument();
		unmount();

		const run = montar(storeCom("running"), <JobPanel alvo={alvo} onAbrir={() => {}} acaoNoTopo />);
		expect(screen.queryByRole("button", { name: /Acompanhar ao vivo/i })).toBeNull();
		expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument(); // ação secundária continua
		run.unmount();

		montar(storeCom("done"), <JobPanel alvo={alvo} onAbrir={() => {}} acaoNoTopo />);
		expect(screen.queryByRole("button", { name: /Abrir dossiê/i })).toBeNull();
		expect(screen.getByRole("button", { name: "Reinvestigar" })).toBeInTheDocument();
	});

	it("em andamento: mostra %, estatísticas, etapas, log e botões", () => {
		montar(storeCom("running"), <JobPanel alvo={alvo} onAbrir={() => {}} />);
		expect(screen.getByText("Em andamento")).toBeInTheDocument();
		expect(screen.getByText(/Nós encontrados/)).toBeInTheDocument();
		expect(screen.getByRole("list", { name: "Etapas por fonte" })).toBeInTheDocument();
		expect(screen.getByText(/financiadores de campanha/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Acompanhar ao vivo/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
	});

	it("em andamento no mobile: etapas ficam recolhidas em <details>", () => {
		const { container } = montar(storeCom("running"), <JobPanel alvo={alvo} onAbrir={() => {}} mobile />);
		expect(container.querySelector("details.pg-stagesd")).toBeInTheDocument();
		expect(screen.getByText(/uma faixa fica no topo/)).toBeInTheDocument();
	});

	it("concluído: abre o dossiê e permite reinvestigar", () => {
		const onAbrir = vi.fn();
		montar(storeCom("done"), <JobPanel alvo={alvo} onAbrir={onAbrir} />);
		expect(screen.getByText("✓ Concluída")).toBeInTheDocument();
		expect(screen.getByText(/Resultado guardado/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /Abrir dossiê/i }));
		expect(onAbrir).toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Reinvestigar" })).toBeInTheDocument();
	});

	it("interrompido: oferece Recomeçar e Abrir parcial", () => {
		montar(storeCom("partial"), <JobPanel alvo={alvo} onAbrir={() => {}} />);
		expect(screen.getByText("▲ Interrompida")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Recomeçar" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Abrir parcial" })).toBeInTheDocument();
	});

	it("erro: mostra a mensagem e Tentar de novo", () => {
		montar(storeCom("error"), <JobPanel alvo={alvo} onAbrir={() => {}} />);
		expect(screen.getByText(/A investigação falhou: Sem resposta/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
	});

	it("o Perfil de outro alvo continua ocioso e avisa da investigação em curso", () => {
		montar(storeCom("running"), <JobPanel alvo={{ nome: "Beltrano", uf: "FEDERAL" }} onAbrir={() => {}} />);
		expect(screen.getByText(/outra investigação em andamento/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Investigar/i })).toBeInTheDocument();
	});

});

describe("Indicadores do job", () => {
	it("faixa em andamento exibe progresso e Cancelar", () => {
		montar(storeCom("running"), <JobRibbon />);
		expect(screen.getByText("Investigando")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
	});

	it("faixa concluída e parcial", () => {
		const a = montar(storeCom("done"), <JobRibbon />);
		expect(screen.getByText("✓ Concluído")).toBeInTheDocument();
		a.unmount();
		montar(storeCom("partial"), <JobRibbon />);
		expect(screen.getByText("▲ Parcial")).toBeInTheDocument();
	});

	it("faixa em erro mostra Falhou", () => {
		montar(storeCom("error"), <JobRibbon />);
		expect(screen.getByText("◆ Falhou")).toBeInTheDocument();
	});

	it("sem job a faixa não renderiza nada", () => {
		const { container } = montar(criarStore(), <JobRibbon />);
		expect(container).toBeEmptyDOMElement();
	});

	it("chip e banner só aparecem rodando, ou pronto ainda não visto", () => {
		expect(jobVisivel("running", true)).toBe(true);
		expect(jobVisivel("done", false)).toBe(true);
		expect(jobVisivel("done", true)).toBe(false);
		expect(jobVisivel("idle", false)).toBe(false);
		const onAbrir = vi.fn();
		montar(storeCom("running"), <JobChip nome="Alice" onAbrir={onAbrir} jaVisto={false} />);
		fireEvent.click(screen.getByRole("button", { name: /Investigando Alice/ }));
		expect(onAbrir).toHaveBeenCalled();
	});

	it("banner mobile troca o texto quando o dossiê fica pronto", () => {
		montar(storeCom("done"), <JobBanner nome="Alice" onAbrir={() => {}} jaVisto={false} />);
		expect(screen.getByText("Dossiê de Alice pronto")).toBeInTheDocument();
	});
});
