import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: {} }));

import { idEleicaoDoAno, tseDaBase } from "@/services/integrations/tse/tse-da-base";
import { dadosTseDoAlvo, type DependenciasTse } from "@/services/core/tse-base-primeiro";
import type { EleitoDoAlvo } from "@/services/integrations/tse/eleitos";

// CPF fictício com dígitos verificadores válidos
const CPF = "52998224725";

const eleito: EleitoDoAlvo = {
	sq_candidato: "250001612095",
	ano_eleicao: 2022,
	cd_cargo: "6",
	ds_cargo: "DEPUTADO FEDERAL",
	sg_uf: "SP",
	nm_ue: "SÃO PAULO",
	municipio_slug: null,
	cd_municipio_ibge: null,
	nm_candidato: "FULANO DE TAL",
	nm_urna_candidato: "FULANO",
	nr_cpf_candidato: CPF,
	sg_partido: "PSDB",
	ds_sit_tot_turno: "ELEITO POR QP",
};

const bens = [
	{ cpf_candidato: CPF, ano_eleicao: 2022, valor_total: 1_000_000, descricao_bens: [{ valor: 1_000_000, tipoBem: "Casa", descricao: "CASA" }] },
	{ cpf_candidato: CPF, ano_eleicao: 2026, valor_total: 1_500_000, descricao_bens: [{ valor: 1_500_000, tipoBem: "Casa", descricao: "CASA" }] },
];

describe("TSE pela nossa base (eleitos + bens declarados)", () => {
	it("monta o resultado no formato do TSE ao vivo, com o patrimônio mais recente e a variação", async () => {
		const r = await tseDaBase(eleito, async () => bens);
		expect(r).toMatchObject({
			cpf: CPF,
			documentoPrincipal: CPF,
			isCnpj: false,
			nome: "FULANO DE TAL",
			idTse: 250001612095,
			partido: "PSDB",
			anoEleicao: 2026,
			idEleicao: "20322002026",
			patrimonioTotal: 1_500_000,
			patrimonioAnterior: 1_000_000,
			anoPatrimonioAnterior: 2022,
			variacaoPatrimonio: 500_000,
			variacaoPatrimonioPercentual: 50,
			municipio: "sao-paulo",
		});
		expect(r?.historicoPatrimonio?.map((h) => h.ano)).toEqual([2026, 2022]);
		expect(r?.bensDeclarados).toHaveLength(1);
	});

	it("sem declaração de bens: eleito confirmado, patrimônio zero (o passo de patrimônio tenta de novo)", async () => {
		const r = await tseDaBase(eleito, async () => []);
		expect(r).toMatchObject({ cpf: CPF, anoEleicao: 2022, idEleicao: "2040602022", patrimonioTotal: 0 });
	});

	it("não serve: sem eleito, achado só por nome (CPF não adotado) ou CPF inválido/mascarado", async () => {
		const bensNunca = vi.fn(async () => bens);
		expect(await tseDaBase(null, bensNunca)).toBeNull();
		expect(await tseDaBase({ ...eleito, porNome: true }, bensNunca)).toBeNull();
		expect(await tseDaBase({ ...eleito, nr_cpf_candidato: "-4" }, bensNunca)).toBeNull();
		expect(bensNunca).not.toHaveBeenCalled();
	});

	it("código da eleição pelo ano e tipo de cargo", () => {
		expect(idEleicaoDoAno(2022, "6")).toBe("2040602022");
		expect(idEleicaoDoAno(2024, "13")).toBe("2045202024");
		expect(idEleicaoDoAno(1990, "6")).toBe("");
	});
});

describe("investigação lê a base antes do TSE ao vivo", () => {
	const consulta = { alvo: { id: "178992", cpfOficial: CPF, nome: "FULANO", uf: "SP", cargoTse: "6" } };

	function deps(daBase: DependenciasTse["daBase"]) {
		return { buscarEleito: vi.fn(async () => eleito), daBase, aoVivo: vi.fn(async () => null) };
	}

	it("base com o eleito: não chama o TSE ao vivo e avisa na tela que veio da base", async () => {
		const eventos: [string, any][] = [];
		const d = deps((e) => tseDaBase(e, async () => bens));
		const r = await dadosTseDoAlvo(consulta, (t, p) => eventos.push([t, p]), d);
		expect(r.tseResult?.cpf).toBe(CPF);
		expect(r.eleito).toBe(eleito);
		expect(d.aoVivo).not.toHaveBeenCalled();
		const etapa = eventos.find(([t]) => t === "ETAPA")?.[1];
		expect(etapa).toMatchObject({ fonte: "tse", estado: "concluida", detalhe: "Eleito e patrimônio declarado (2026 e 2022)" });
	});

	it("base sem o eleito (ou fora do ar): cai no TSE ao vivo com os mesmos parâmetros de antes", async () => {
		const d = deps(async () => { throw new Error("base fora"); });
		await dadosTseDoAlvo({ ...consulta, nomeCivil: "FULANO DE TAL", municipio: "x" }, () => {}, d);
		expect(d.aoVivo).toHaveBeenCalledWith("FULANO", "SP", "6", "FULANO DE TAL", "x");
	});
});
