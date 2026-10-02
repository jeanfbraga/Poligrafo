import { describe, expect, it } from "vitest";
import { aplicarEventos, iniciarDossie } from "@/lib/investigacao/dossie-state";
import { jobView } from "@/lib/investigacao/job-view";
import { STORE_INICIAL, type StoreState } from "@/lib/investigacao/store";

const ev = (tipo: string, payload: unknown) => ({ tipo, payload });

function rodando(nome = "Alice"): StoreState {
	let dossie = iniciarDossie({ label: nome, uf: "FEDERAL" });
	dossie = aplicarEventos(dossie, [
		ev("STATUS", { msg: "Aguardando resposta dos servidores da Câmara dos Deputados..." }),
		ev("STATUS", { msg: "Puxando financiadores de campanha no TSE..." }),
		ev("NODE_NOVO", { id: "p1", type: "PESSOA", data: { label: nome } }),
		ev("NODE_NOVO", { id: "d1", type: "DESPESA", data: { score_letalidade: 90 } }),
		ev("NODE_NOVO", { id: "d2", type: "DESPESA", data: { score_letalidade: 70 } }),
	]);
	return { ...STORE_INICIAL, alvo: { nome }, dossie, inicio: 1000 };
}

describe("jobView", () => {
	it("sem alvo investigado: idle e zerado", () => {
		const v = jobView(STORE_INICIAL, { nome: "Alice" });
		expect(v.estado).toBe("idle");
		expect(v.pct).toBe(0);
		expect(v.relogio).toBe("00:00");
		expect(v.etapas.every((e) => e.status === "wait")).toBe(true);
		expect(v.outraEmAndamento).toBe(false);
	});

	it("em andamento: progresso, fontes, contagem de risco e último log", () => {
		const v = jobView(rodando(), { nome: "Alice" }, 75);
		expect(v.estado).toBe("running");
		expect(v.pct).toBeGreaterThan(0);
		expect(v.pct).toBeLessThan(100);
		expect(v.relogio).toBe("01:15");
		expect(v.concluidas).toBe(1);
		expect(v.criticos).toBe(1);
		expect(v.atencao).toBe(1);
		expect(v.nos).toBe(3);
		expect(v.log).toContain("TSE");
		expect(v.etapas.find((e) => e.id === "tse")?.status).toBe("run");
		expect(v.etapas.find((e) => e.id === "casa")?.texto).toBe("ok");
		expect(v.temNos).toBe(true);
	});

	it("o Perfil de outro alvo vê idle e a indicação de investigação em andamento", () => {
		const v = jobView(rodando("Alice"), { nome: "Beltrano" });
		expect(v.estado).toBe("idle");
		expect(v.outraEmAndamento).toBe(true);
		expect(v.nos).toBe(0);
	});

	it("sem alvo informado reflete o store (faixa/chip globais)", () => {
		const v = jobView(rodando("Alice"));
		expect(v.estado).toBe("running");
	});

	it("concluído: 100% e fontes não aplicáveis excluídas", () => {
		const s = rodando();
		const dossie = aplicarEventos(s.dossie, [ev("DONE", {})]);
		const v = jobView({ ...s, dossie, fim: 61000 }, { nome: "Alice" }, 61);
		expect(v.estado).toBe("done");
		expect(v.pct).toBe(100);
		expect(v.aplicaveis).toBe(2);
		expect(v.etapas.find((e) => e.id === "diarios")?.status).toBe("na");
	});

	it("erro expõe a mensagem", () => {
		const s = rodando();
		const dossie = aplicarEventos(s.dossie, [ev("ERROR", { mensagem: "Sem resposta" })]);
		const v = jobView({ ...s, dossie }, { nome: "Alice" });
		expect(v.estado).toBe("error");
		expect(v.erro).toBe("Sem resposta");
	});
});
