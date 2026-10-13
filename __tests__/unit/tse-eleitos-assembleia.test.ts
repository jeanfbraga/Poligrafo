import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));

import { CICLOS, chapaEleita, exercicioPelaAssembleia, type LinhaEleito, linhasQueMudaram, nomeCivilDaLista } from "../../scripts/etl/tse-eleitos";
import { type Eleito, eleitoNaJanela, eleitoParaCandidato } from "../../src/services/integrations/tse/eleitos";

const candidato = (sq: string, nome: string, situacao: string, cpf: string | null = "08661032792"): LinhaEleito => ({
	sq_candidato: sq, ano_eleicao: 2022, cd_cargo: "7", ds_cargo: "DEPUTADO ESTADUAL", sg_uf: "RJ", sg_ue: "RJ", nm_ue: "RIO DE JANEIRO",
	municipio_slug: null, cd_municipio_ibge: null, nm_candidato: nome, nm_urna_candidato: null, nr_cpf_candidato: cpf, sg_partido: "PL",
	ds_sit_tot_turno: situacao, nomes_busca: nome.toLowerCase(), cpf_fonte: null,
});

describe("exerceu mandato pela lista da assembleia (cassado ou suplente que assumiu)", () => {
	// Arquivo de 2022 em 12/10/2026: Bacellar "NÃO ELEITO" (votos anulados), com CPF; na ALERJ até 03/2026.
	const bacellar = candidato("190001596728", "RODRIGO DA SILVA BACELLAR", "NÃO ELEITO");

	it("nome civil completo idêntico a UM candidato: entra com o CPF e a situação dizendo de onde veio", () => {
		const r = exercicioPelaAssembleia([bacellar], ["Rodrigo Da Silva Bacellar (Rodrigo Bacellar)"], "ALERJ");
		expect(r).toEqual([{ ...bacellar, ds_sit_tot_turno: "EXERCEU MANDATO (lista da ALERJ; TSE: NÃO ELEITO)" }]);
	});

	it("suplente que assumiu também entra; eleito já na base fica como está", () => {
		const suplente = candidato("2", "FULANA DE TAL", "SUPLENTE");
		const eleito = candidato("3", "CICLANO DE TAL", "ELEITO POR QP");
		const r = exercicioPelaAssembleia([suplente, eleito], ["Fulana De Tal", "Ciclano De Tal"], "ALERJ");
		expect(r.map((x) => [x.sq_candidato, x.ds_sit_tot_turno])).toEqual([["2", "EXERCEU MANDATO (lista da ALERJ; TSE: SUPLENTE)"]]);
	});

	it("dois candidatos com o mesmo nome civil (homônimos) ou nome só parecido: nada entra", () => {
		const dois = [candidato("4", "JOSE DA SILVA", "NÃO ELEITO"), candidato("5", "JOSÉ DA SILVA", "NÃO ELEITO", "52998224725")];
		expect(exercicioPelaAssembleia(dois, ["José da Silva"], "ALERJ")).toEqual([]);
		expect(exercicioPelaAssembleia([bacellar], ["Rodrigo Bacellar"], "ALERJ")).toEqual([]);
	});

	it("nome da lista sem o nome de urna entre parênteses", () => {
		expect(nomeCivilDaLista("Rodrigo Da Silva Bacellar (Rodrigo Bacellar)")).toBe("rodrigo da silva bacellar");
	});

	it("ciclos: chapas presidenciais 2002–2018, conferência da assembleia em 2022 e CPF pelo título até 2010", () => {
		expect(CICLOS.filter((c) => c.cargos?.includes("1")).map((c) => c.ano)).toEqual([2002, 2006, 2010, 2014, 2018]);
		expect(CICLOS.find((c) => c.ano === 2022)?.assembleias).toBe(true);
		expect(CICLOS.find((c) => c.ano === 2024)?.cpfPeloTituloDe).toEqual([2022, 2020, 2018, 2016, 2014, 2012, 2010]);
		expect(CICLOS.find((c) => c.ano === 2014)?.cpfPeloTituloDe).toEqual([2010]);
	});
});

describe("chapas presidenciais (arquivos de 2002–2014 com a situação '#NULO#')", () => {
	const linhaTse = (cargo: string, nome: string) => ({ CD_CARGO: cargo, NM_CANDIDATO: nome, SQ_CANDIDATO: "23", DS_SIT_TOT_TURNO: "#NULO#", SG_UF: "BR", NR_CPF_CANDIDATO: "07068093868", DS_CARGO: "PRESIDENTE" });

	it("presidente e vice da chapa vencedora entram como eleitos; o perdedor e outros cargos, não", () => {
		expect(chapaEleita(linhaTse("1", "LUIZ INACIO LULA DA SILVA"), 2006, new Map())).toMatchObject({ cd_cargo: "1", ds_sit_tot_turno: "ELEITO (chapa presidencial vencedora)", nr_cpf_candidato: "07068093868" });
		expect(chapaEleita(linhaTse("2", "MICHEL MIGUEL ELIAS TEMER LULIA"), 2014, new Map())?.cd_cargo).toBe("2");
		expect(chapaEleita(linhaTse("1", "GERALDO JOSÉ RODRIGUES ALCKMIN FILHO"), 2006, new Map())).toBeNull();
		expect(chapaEleita(linhaTse("6", "LUIZ INACIO LULA DA SILVA"), 2006, new Map())).toBeNull();
	});
});

describe("carga grava só o que é novo ou mudou (sem linhas mortas no Banco de Perfil)", () => {
	it("igual à base: nada; CPF completado, situação nova ou eleito novo: grava", () => {
		const base = candidato("1", "A B", "ELEITO", null);
		const naBase = [{ ...base, cpf_fonte: null }];
		expect(linhasQueMudaram([base], naBase)).toEqual([]);
		const comCpf = { ...base, nr_cpf_candidato: "52998224725", cpf_fonte: "consulta_cand_2014 (título e nascimento)" };
		const cassado = { ...base, ds_sit_tot_turno: "EXERCEU MANDATO (lista da ALERJ; TSE: NÃO ELEITO)" };
		const novo = candidato("2", "C D", "ELEITO");
		expect(linhasQueMudaram([comCpf, novo], naBase).map((l) => l.sq_candidato)).toEqual(["1", "2"]);
		expect(linhasQueMudaram([cassado], naBase)).toHaveLength(1);
	});
});

describe("na busca: suplente que não assumiu fica fora; quem exerceu mandato entra", () => {
	const HOJE = new Date("2026-10-12T12:00:00Z");
	const eleito = (ds_sit_tot_turno: string) => ({ ...candidato("1", "X Y", ds_sit_tot_turno), cd_cargo: "7" }) as unknown as Eleito;

	it("situação exatamente SUPLENTE: fora; EXERCEU MANDATO (…; TSE: SUPLENTE): dentro e não é suplente na lista", () => {
		expect(eleitoNaJanela(eleito("SUPLENTE"), HOJE)).toBe(false);
		const assumiu = eleito("EXERCEU MANDATO (lista da ALERJ; TSE: SUPLENTE)");
		expect(eleitoNaJanela(assumiu, HOJE)).toBe(true);
		expect(eleitoParaCandidato(assumiu)?.suplente).toBe(false);
	});
});
