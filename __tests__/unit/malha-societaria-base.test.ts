import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	empresasDoPoliticoNaBase: vi.fn(),
	buscarEmpresasDoSocio: vi.fn(async () => []),
}));

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));
vi.mock("@/services/integrations/receita/socios-politicos", () => ({ empresasDoPoliticoNaBase: m.empresasDoPoliticoNaBase }));
vi.mock("@/services/core/socio-search", () => ({ buscarEmpresasDoSocio: m.buscarEmpresasDoSocio }));
vi.mock("@/app/api/investigar/scrapers/osint-societario", () => ({ expandirMalhaSocietaria: vi.fn(async () => []) }));
vi.mock("@/app/api/investigar/scrapers/osint-fiscal", () => ({ buscarReceitasFederais: vi.fn(async () => undefined) }));
vi.mock("@/app/api/investigar/scrapers/osint-contratos", () => ({ buscarConveniosTransferegov: vi.fn(async () => null) }));

import { ColecaoNos } from "@/services/core/colecao-nos";
import type { Investigacao } from "@/services/core/investigacao/contexto";
import { malhaSocietaria } from "@/services/core/investigacao/malha-societaria";

const CPF = "52998224725";

function investigacao(confianca: "alta" | "media", cpf: string | null = CPF) {
	const eventos: [string, any][] = [];
	const inv = {
		p: {} as never,
		sendEvent: (t: string, p: unknown) => eventos.push([t, p]),
		nos: new ColecaoNos(),
		malha: [] as any[],
		dep: { nome: "Flávio Bolsonaro" },
		detalhes: { nomeCivil: "FLAVIO NANTES BOLSONARO" },
		identidade: { confianca, cpf, evidencias: [], conflitos: [], sqCandidato: null },
		cpf,
		pessoaId: "pessoa-1",
	} as unknown as Investigacao;
	return { inv, eventos };
}

const empresa = (cnpj: string, data: string, razao = `EMPRESA ${cnpj}`) => ({
	cpf_politico: CPF, cnpj, nome_politico: "FLAVIO NANTES BOLSONARO", razao_social: razao,
	natureza_juridica: "Sociedade Empresária Limitada", qualificacao_socio: "Sócio", data_entrada: data, referencia: "2026-09",
});

describe("malha societária: empresas do QSA da Receita (base socios_politicos)", () => {
	it("entram pelo CPF confirmado, sem repetir a empresa declarada, com o motivo e o aviso na tela", async () => {
		m.empresasDoPoliticoNaBase.mockResolvedValue([empresa("21636316000144", "2015-01-07", "BOLSOTINI"), empresa("27516314000106", "2017-04-10", "BOLSONARO DIGITAL LTDA")]);
		const { inv, eventos } = investigacao("alta");
		const declarada = { id: "empresa-tse-pessoa-1-2018-0", type: "EMPRESA" as const, _origemId: "pessoa-1", data: { cnpj: "21.636.316/0001-44" } };
		const cnpjs = await malhaSocietaria(inv, Promise.resolve([declarada]));
		expect(m.empresasDoPoliticoNaBase).toHaveBeenCalledWith({ cpf: CPF, nomes: [] });
		expect(cnpjs).toEqual(["21636316000144", "27516314000106"]);
		const daBase = inv.malha.filter((n) => n.id.startsWith("empresa-rev-"));
		expect(daBase).toHaveLength(1);
		expect(daBase[0]).toMatchObject({ id: "empresa-rev-27516314000106", data: { label: "BOLSONARO DIGITAL LTDA", forcaVinculo: "CPF_E_NOME" } });
		expect(daBase[0].data.motivo_ia).toBe("Vínculo societário confirmado no quadro de sócios da Receita (arquivo aberto de CNPJ de 2026-09): Sócio desde 2017-04-10, conferido por nome e CPF.");
		const msgs = eventos.filter(([t]) => t === "STATUS").map(([, p]) => p.msg);
		expect(msgs).toContain("[RECEITA] 1 empresa(s) em que o político é sócio, pelo quadro de sócios da Receita (conferido por nome e CPF); outras 1 já estavam no dossiê ou ficaram de fora (limite de 10).");
	});

	it("no máximo 10, as de entrada mais recente", async () => {
		m.empresasDoPoliticoNaBase.mockResolvedValue(Array.from({ length: 14 }, (_, i) => empresa(String(10000000000100 + i), `20${String(10 + i).padStart(2, "0")}-01-01`)));
		const { inv } = investigacao("alta");
		const cnpjs = await malhaSocietaria(inv, Promise.resolve([]));
		expect(cnpjs).toHaveLength(10);
		expect(cnpjs[0]).toBe("10000000000113");
	});

	it("sem CPF confirmado (confiança média ou sem documento) a base não é consultada", async () => {
		m.empresasDoPoliticoNaBase.mockClear();
		await malhaSocietaria(investigacao("media").inv, Promise.resolve([]));
		await malhaSocietaria(investigacao("alta", null).inv, Promise.resolve([]));
		expect(m.empresasDoPoliticoNaBase).not.toHaveBeenCalled();
	});
});
