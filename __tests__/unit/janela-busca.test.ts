import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: {} }));

const buscarCandidatos = vi.fn();
vi.mock("@/services/core/busca-candidatos", () => ({ buscarCandidatos: (...a: unknown[]) => buscarCandidatos(...a) }));

import { aplicarEventos, iniciarDossie } from "@/lib/investigacao/dossie-state";
import { executarModoBusca } from "@/services/core/investigacao/modo-busca";
import { type Eleito, eleitoNaJanela } from "@/services/integrations/tse/eleitos";

const HOJE = new Date("2026-10-12T12:00:00Z");
const eleito = (cd_cargo: string, ano_eleicao: number, ds_sit_tot_turno = "ELEITO") => ({ cd_cargo, ano_eleicao, ds_sit_tot_turno }) as Eleito;

describe("base de eleitos na janela de mandato", () => {
	it("senador de 2018 e vereador de 2024 entram; deputado de 2018, vereador de 2020 e suplente, não", () => {
		expect(eleitoNaJanela(eleito("5", 2018), HOJE)).toBe(true);
		expect(eleitoNaJanela(eleito("13", 2024, "ELEITO POR QP"), HOJE)).toBe(true);
		expect(eleitoNaJanela(eleito("6", 2018), HOJE)).toBe(false);
		expect(eleitoNaJanela(eleito("13", 2020), HOJE)).toBe(false);
		expect(eleitoNaJanela(eleito("7", 2022, "SUPLENTE"), HOJE)).toBe(false);
	});

	it("presidente fica sempre, de qualquer eleição", () => {
		expect(eleitoNaJanela(eleito("1", 2014), HOJE)).toBe(true);
	});
});

function execucao() {
	const eventos: [string, any][] = [];
	const safeClose = vi.fn();
	const p = { nomeParaBusca: "Pessoa Comum", ufScope: "GO", ufParam: "GO", cargoParam: "FEDERAL", nomeBruto: "Pessoa Comum", correcoesNomes: {}, safeClose };
	return { e: { p, sendEvent: (t: string, x: any) => eventos.push([t, x]) } as never, eventos, safeClose };
}

describe("modo busca: fora da janela não é falha", () => {
	it("ninguém na janela: NAO_ENCONTRADO com o termo (a tela explica a regra) e fecha o stream", async () => {
		buscarCandidatos.mockResolvedValueOnce({ candidatos: [], houveErroApi: false });
		const { e, eventos, safeClose } = execucao();
		await executarModoBusca(e);
		expect(eventos).toEqual([["NAO_ENCONTRADO", { termo: "Pessoa Comum", motivo: "FORA_DA_JANELA" }]]);
		expect(safeClose).toHaveBeenCalled();
	});

	it("fonte fora do ar e nada encontrado: ERROR (aí sim é falha), sem citar o TSE ao vivo", async () => {
		buscarCandidatos.mockResolvedValueOnce({ candidatos: [], houveErroApi: true });
		const { e, eventos } = execucao();
		await executarModoBusca(e);
		expect(eventos[0][0]).toBe("ERROR");
		expect(eventos[0][1].mensagem).toBe("A busca falhou: uma das fontes (Câmara, Senado ou a nossa base de eleitos) não respondeu. Tente novamente em alguns minutos.");
	});

	it("a tela: NAO_ENCONTRADO vira o aviso da regra, termina a busca e não marca erro", () => {
		const d = aplicarEventos(iniciarDossie({ label: "Pessoa Comum" }), [{ tipo: "NAO_ENCONTRADO", payload: { termo: "Pessoa Comum", motivo: "FORA_DA_JANELA" } }]);
		expect(d.naoEncontrado).toEqual({ termo: "Pessoa Comum" });
		expect(d.status).toBe("done");
		expect(d.erro).toBe("");
		expect(d.nodes.every((n) => !n.data?.isSearching)).toBe(true);
	});
});
