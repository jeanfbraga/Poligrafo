import { describe, expect, it, vi } from "vitest";
import {
	type BancoGravacao,
	deduplicar,
	gravarLinhas,
	type LinhaEleito,
	linhaParaEleito,
	montarMapaIbge,
	nomesBusca,
	situacaoInteressa,
} from "../../scripts/etl/tse-eleitos";
import { interpretarRef } from "../../src/services/core/alvo-ref";
import {
	buscarEleitoDaRef,
	buscarEleitosPorNome,
	type Eleito,
	eleitoParaCandidato,
	nomeLocal,
	palavrasBusca,
	reiniciarAvisoEleitos,
	sqDaRef,
	ufValida,
} from "../../src/services/integrations/tse/eleitos";

const CPF = "52998224725";

describe("ETL tse_eleitos (regras puras)", () => {
	const mapa = montarMapaIbge({ abr: [{ mu: [{ cd: "93734", cdi: "5208707" }, { cd: "01120", cdi: "1100015" }] }] });
	const linha = {
		CD_CARGO: "13", DS_CARGO: "VEREADOR", DS_SIT_TOT_TURNO: "ELEITO POR QP", NM_CANDIDATO: "JOSÉ DA SILVA",
		NM_URNA_CANDIDATO: "ZÉ DA FARMÁCIA", SQ_CANDIDATO: "90001", SG_UE: "93734", NM_UE: "GOIÂNIA", SG_UF: "go",
		SG_PARTIDO: "PSD", NR_CPF_CANDIDATO: "-4",
	};

	it("mapa TSE→IBGE ignora zeros à esquerda do código TSE", () => {
		expect(mapa.get("93734")).toBe("5208707");
		expect(mapa.get("1120")).toBe("1100015");
	});

	it("vereador eleito: slug e código IBGE do município, CPF mascarado vira null", () => {
		expect(linhaParaEleito(linha, 2024, mapa)).toMatchObject({
			sq_candidato: "90001", ano_eleicao: 2024, cd_cargo: "13", sg_uf: "GO", municipio_slug: "goiania",
			cd_municipio_ibge: "5208707", nr_cpf_candidato: null, nomes_busca: "jose da silva | ze da farmacia",
		});
	});

	it("CPF só com dígito verificador válido; cargo estadual sem município", () => {
		const r = linhaParaEleito({ ...linha, CD_CARGO: "7", NR_CPF_CANDIDATO: CPF, SG_UE: "GO", NM_UE: "GOIÁS" }, 2022, mapa);
		expect(r).toMatchObject({ nr_cpf_candidato: CPF, municipio_slug: null, cd_municipio_ibge: null });
		expect(linhaParaEleito({ ...linha, NR_CPF_CANDIDATO: "52998224700" }, 2024, mapa)?.nr_cpf_candidato).toBeNull();
	});

	it("fica só eleito e suplente de casa legislativa estadual/federal", () => {
		expect(situacaoInteressa("7", "SUPLENTE")).toBe(true);
		expect(situacaoInteressa("13", "SUPLENTE")).toBe(false);
		expect(situacaoInteressa("11", "ELEITO")).toBe(true);
		expect(situacaoInteressa("6", "NÃO ELEITO")).toBe(false);
		expect(situacaoInteressa("11", "2º TURNO")).toBe(false);
		expect(linhaParaEleito({ ...linha, DS_SIT_TOT_TURNO: "NÃO ELEITO" }, 2024, mapa)).toBeNull();
		expect(linhaParaEleito({ ...linha, SQ_CANDIDATO: "#NULO#" }, 2024, mapa)).toBeNull();
	});

	it("nome de urna igual ao civil não se repete na busca", () => {
		expect(nomesBusca("ANDRÉ DO PRADO", "André do Prado")).toBe("andre do prado");
		expect(nomesBusca("FULANO", null)).toBe("fulano");
	});

	it("gravação em lotes com chave sq_candidato+ano; tabela ausente traz a dica da migração", async () => {
		const base = linhaParaEleito(linha, 2024, mapa) as LinhaEleito;
		const linhas = Array.from({ length: 5 }, (_v, i) => ({ ...base, sq_candidato: String(i) }));
		const upsert = vi.fn(async () => ({ error: null }));
		await gravarLinhas({ from: () => ({ upsert }) } as BancoGravacao, linhas, 2);
		expect(upsert).toHaveBeenCalledTimes(3);
		expect(upsert.mock.calls[0]).toEqual([linhas.slice(0, 2), { onConflict: "sq_candidato,ano_eleicao" }]);

		const semTabela = { from: () => ({ upsert: async () => ({ error: { message: "Could not find the table 'public.tse_eleitos' in the schema cache" } }) }) };
		await expect(gravarLinhas(semTabela, linhas)).rejects.toThrow(
			"[TSE ELEITOS] upsert falhou: Could not find the table 'public.tse_eleitos' in the schema cache — rode scripts/sql/migracao_perfil_tse_eleitos.sql no Banco de Perfil antes.",
		);
		const outroErro = { from: () => ({ upsert: async () => ({ error: { message: "JWT expired" } }) }) };
		await expect(gravarLinhas(outroErro, linhas)).rejects.toThrow(/^\[TSE ELEITOS\] upsert falhou: JWT expired$/);
	});

	it("2º turno: fica a situação final do candidato", () => {
		const base = linhaParaEleito(linha, 2024, mapa) as LinhaEleito;
		const r = deduplicar([
			{ linha: { ...base, ds_sit_tot_turno: "1º turno" }, turno: 1 },
			{ linha: { ...base, ds_sit_tot_turno: "ELEITO" }, turno: 2 },
		]);
		expect(r).toHaveLength(1);
		expect(r[0].ds_sit_tot_turno).toBe("ELEITO");
	});
});

const ELEITO: Eleito = {
	sq_candidato: "190001", ano_eleicao: 2024, cd_cargo: "13", ds_cargo: "VEREADOR", sg_uf: "RJ", nm_ue: "RIO DE JANEIRO",
	municipio_slug: "rio-de-janeiro", cd_municipio_ibge: "3304557", nm_candidato: "RAFAEL ALOISIO FREITAS",
	nm_urna_candidato: "RAFAEL ALOISIO FREITAS", nr_cpf_candidato: null, sg_partido: "PSD", ds_sit_tot_turno: "ELEITO POR QP",
};

describe("base de eleitos → candidatos da busca", () => {
	it("vereador do Rio: ref municipal com o número do candidato (nunca confundido com CPF)", () => {
		const c = eleitoParaCandidato(ELEITO);
		expect(c).toMatchObject({ ref: "RJ:VEREADOR:rio-de-janeiro:SQ-190001", casa: "CAMARA_MUNICIPAL_RJ", cargo: "Vereador em Rio de Janeiro", nome: "RAFAEL ALOISIO FREITAS", suplente: false });
		expect(interpretarRef(c?.ref)).toEqual({ tipo: "MUNICIPAL", uf: "RJ", cargo: "VEREADOR", municipio: "rio-de-janeiro", doc: "SQ-190001" });
	});

	it("deputado estadual fora de SP/RJ usa ESTADUAL:{UF}:{CPF}; distrital é cargo 8", () => {
		const c = eleitoParaCandidato({ ...ELEITO, cd_cargo: "7", sg_uf: "GO", nr_cpf_candidato: CPF, municipio_slug: null });
		expect(c).toMatchObject({ ref: `ESTADUAL:GO:${CPF}`, casa: "ASSEMBLEIA_LEGISLATIVA", cargo: "Deputado Estadual" });
		expect(eleitoParaCandidato({ ...ELEITO, cd_cargo: "8", sg_uf: "DF" })?.cargo).toBe("Deputado Distrital");
	});

	it("deputado estadual de SP/RJ sai no formato da ALESP/ALERJ (caminho próprio de despesas)", () => {
		const c = eleitoParaCandidato({ ...ELEITO, cd_cargo: "7", sg_uf: "SP", nm_candidato: "ANDRE LUIS DO PRADO", nm_urna_candidato: "ANDRÉ DO PRADO", nr_cpf_candidato: CPF });
		expect(c).toMatchObject({ casa: "ALESP", nome: "ANDRE LUIS DO PRADO (ANDRÉ DO PRADO)" });
		expect(interpretarRef(c?.ref)).toMatchObject({ tipo: "ASSEMBLEIA", casa: "ALESP", nome: "ANDRE LUIS DO PRADO", doc: CPF });
	});

	it("prefeito e governador; cargos fora da busca ficam de fora", () => {
		expect(eleitoParaCandidato({ ...ELEITO, cd_cargo: "11", nm_ue: "SÃO JOÃO DE MERITI", municipio_slug: "sao-joao-de-meriti" }))
			.toMatchObject({ ref: "RJ:PREFEITO:sao-joao-de-meriti:SQ-190001", casa: "PREFEITURA", cargo: "Prefeito de São João de Meriti" });
		expect(eleitoParaCandidato({ ...ELEITO, cd_cargo: "3" })?.ref).toBe("GOVERNADOR:RJ:RAFAEL ALOISIO FREITAS");
		expect(eleitoParaCandidato({ ...ELEITO, cd_cargo: "6" })).toBeNull();
	});

	it("suplente é marcado", () => {
		expect(eleitoParaCandidato({ ...ELEITO, cd_cargo: "7", ds_sit_tot_turno: "SUPLENTE" })?.suplente).toBe(true);
	});

	it("auxiliares: palavras, número do candidato, UF e nome do município", () => {
		expect(palavrasBusca("André do Prado")).toEqual(["andre", "prado"]);
		expect(sqDaRef("SQ-250002034955")).toBe("250002034955");
		expect(sqDaRef("250002034955")).toBeNull();
		expect(sqDaRef("SQ-abc")).toBeNull();
		expect([ufValida("GO"), ufValida("BR"), ufValida("FEDERAL"), ufValida(null)]).toEqual([true, false, false, false]);
		expect(nomeLocal("RIO DE JANEIRO")).toBe("Rio de Janeiro");
	});
});

/** Cliente Supabase falso: registra a cadeia de chamadas e devolve a resposta dada. */
function clienteFalso(resposta: { data?: unknown[]; error?: { message: string } }) {
	const chamadas: unknown[][] = [];
	const consulta: Record<string, unknown> = {};
	for (const m of ["select", "in", "filter", "eq", "order", "limit"]) {
		consulta[m] = (...args: unknown[]) => {
			chamadas.push([m, ...args]);
			return consulta;
		};
	}
	consulta.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
		Promise.resolve({ data: resposta.data ?? null, error: resposta.error ?? null }).then(ok, erro);
	const cliente = {
		from: (tabela: string) => {
			chamadas.push(["from", tabela]);
			return consulta;
		},
	};
	return { cliente: cliente as never, chamadas };
}

describe("consulta à base tse_eleitos", () => {
	it("todas as palavras como palavra inteira, em qualquer ordem, e UF quando válida", async () => {
		const { cliente, chamadas } = clienteFalso({ data: [ELEITO] });
		const r = await buscarEleitosPorNome("André do Prado", { uf: "SP" }, cliente);
		expect(r).toEqual([ELEITO]);
		expect(chamadas).toContainEqual(["from", "tse_eleitos"]);
		expect(chamadas).toContainEqual(["filter", "nomes_busca", "imatch", "\\mandre\\M"]);
		expect(chamadas).toContainEqual(["filter", "nomes_busca", "imatch", "\\mprado\\M"]);
		expect(chamadas).toContainEqual(["eq", "sg_uf", "SP"]);
	});

	it("UF genérica (BR) não filtra; nome vazio nem consulta", async () => {
		const { cliente, chamadas } = clienteFalso({ data: [] });
		await buscarEleitosPorNome("Fulano", { uf: "BR" }, cliente);
		expect(chamadas.some((c) => c[0] === "eq")).toBe(false);
		const vazio = clienteFalso({ data: [] });
		expect(await buscarEleitosPorNome("de da", {}, vazio.cliente)).toEqual([]);
		expect(vazio.chamadas).toHaveLength(0);
	});

	it("tabela ausente ou base fora do ar: null (o pipe segue sem a base) e avisa no log uma vez só", async () => {
		reiniciarAvisoEleitos();
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { cliente } = clienteFalso({ error: { message: "Could not find the table 'public.tse_eleitos'" } });
		expect(await buscarEleitosPorNome("Fulano", {}, cliente)).toBeNull();
		expect(await buscarEleitoDaRef("SQ-1", cliente)).toBeNull();
		expect(aviso).toHaveBeenCalledTimes(1);
		expect(aviso.mock.calls[0][0]).toBe("[TSE ELEITOS] Base indisponível (Could not find the table 'public.tse_eleitos'); seguindo sem ela.");
		aviso.mockRestore();
	});

	it("eleito da ref: pelo número do candidato ou pelo CPF; id da Câmara não consulta", async () => {
		const porSq = clienteFalso({ data: [ELEITO] });
		expect(await buscarEleitoDaRef("SQ-190001", porSq.cliente)).toEqual(ELEITO);
		expect(porSq.chamadas).toContainEqual(["eq", "sq_candidato", "190001"]);
		const porCpf = clienteFalso({ data: [] });
		expect(await buscarEleitoDaRef(CPF, porCpf.cliente)).toBeNull();
		expect(porCpf.chamadas).toContainEqual(["eq", "nr_cpf_candidato", CPF]);
		const camara = clienteFalso({ data: [ELEITO] });
		expect(await buscarEleitoDaRef("204554", camara.cliente)).toBeNull();
		expect(camara.chamadas).toHaveLength(0);
	});
});
