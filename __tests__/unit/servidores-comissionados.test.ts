import { beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarEstadoFonteHttp } from "../../src/lib/fonte-http";
import { executarCruzamentos } from "../../src/services/cruzamentos/motor";
import { nomeadoDepoisDaEleicao } from "../../src/services/cruzamentos/regras";
import { doadoresParaConferir, fatosDeServidores, funcaoParaFato } from "../../src/services/cruzamentos/servidores";
import type { Fato } from "../../src/services/cruzamentos/tipos";
import { buscarFuncoesPorCpf, lerFuncoes, reiniciarAvisoServidores } from "../../src/services/integrations/transparencia/servidores";

const CPF_A = "52998224725";
const CPF_B = "11144477735";
const AGORA = "2026-10-07T12:00:00.000Z";

const registro = (funcoes: Record<string, string>[]) => ({
	servidor: { situacao: "Ativo", orgaoServidorExercicio: { nome: "MINISTERIO X" } },
	fichasFuncao: funcoes,
});

const FEX = {
	funcao: "FEX 021.0 - FUNCÃO COMISSIONADA EXECUTIVA", atividade: "ASSESSOR(A) TECNICO",
	orgaoServidorExercicio: "Presidência da República", ufExercicio: "DISTRITO FEDERAL",
	dataIngressoFuncao: "19/03/2026", situacaoServidor: "CEDIDO/REQUISITADO",
};

const doador = (cpf: string, valor: number, ano = "2022"): Fato => ({
	id: `fato-doador-${cpf}`, papel: "DOADOR", documento: cpf, nome: `DOADOR ${cpf.slice(0, 3)}`, valor, data: ano,
	procedencia: { fonte: "TSE", chave: "sq", coletadoEm: AGORA },
});

describe("servidores do Executivo federal (Portal da Transparência)", () => {
	beforeEach(() => {
		reiniciarEstadoFonteHttp();
		reiniciarAvisoServidores();
	});

	it("lê só funções/cargos de confiança (servidor de carreira sem função não conta)", () => {
		expect(lerFuncoes([registro([FEX]), registro([]), registro([{ funcao: "Sem informação" }])])).toEqual([
			{ funcao: FEX.funcao, atividade: FEX.atividade, orgao: "Presidência da República", uf: "DISTRITO FEDERAL", dataIngressoFuncao: "19/03/2026", situacao: "CEDIDO/REQUISITADO" },
		]);
	});

	it("consulta por CPF com a chave no cabeçalho; sem chave nem consulta", async () => {
		const fetchFn = vi.fn(async () => new Response(JSON.stringify([registro([FEX])]), { status: 200 }));
		const r = await buscarFuncoesPorCpf("529.982.247-25", "chave-teste", fetchFn as never);
		expect(r).toHaveLength(1);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(`https://api.portaldatransparencia.gov.br/api-de-dados/servidores?cpf=${CPF_A}&pagina=1`);
		expect(new Headers(init.headers).get("chave-api-dados")).toBe("chave-teste");
		const nunca = vi.fn();
		expect(await buscarFuncoesPorCpf(CPF_A, "", nunca as never)).toEqual([]);
		expect(nunca).not.toHaveBeenCalled();
	});

	it("falha do Portal: lista vazia e aviso no log uma vez só", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const fetchFn = vi.fn(async () => new Response("proibido", { status: 403 }));
		expect(await buscarFuncoesPorCpf(CPF_A, "k", fetchFn as never)).toEqual([]);
		expect(await buscarFuncoesPorCpf(CPF_B, "k", fetchFn as never)).toEqual([]);
		expect(aviso).toHaveBeenCalledTimes(1);
		expect(aviso).toHaveBeenCalledWith("[CGU SERVIDORES] Consulta de servidores falhou (HTTP_4XX); cargos de confiança dos doadores não conferidos.");
		aviso.mockRestore();
	});
});

describe("doador com cargo de confiança (cruzamento)", () => {
	it("confere os maiores doadores pessoa física, com limite", () => {
		const fatos = [doador(CPF_A, 100), doador(CPF_B, 5000), { ...doador("11222333000181", 9e6), documento: "11222333000181" }];
		expect(doadoresParaConferir(fatos)).toEqual([CPF_B, CPF_A]);
		expect(doadoresParaConferir(fatos, 1)).toEqual([CPF_B]);
	});

	it("vira fato no CPF do doador, com função, órgão e data de início", async () => {
		const buscar = vi.fn(async (cpf: string) => (cpf === CPF_A ? lerFuncoes([registro([FEX])]) : []));
		const fatos = await fatosDeServidores([doador(CPF_A, 3000)], AGORA, buscar);
		expect(fatos).toEqual([expect.objectContaining({
			papel: "SERVIDOR_COMISSIONADO", documento: CPF_A, nome: "DOADOR 529", data: "2026-03-19",
			detalhe: "FEX 021.0 - FUNCÃO COMISSIONADA EXECUTIVA — ASSESSOR(A) TECNICO — Presidência da República — desde 19/03/2026",
		})]);
	});

	it("MÉDIA; ALTA se a nomeação veio depois da eleição em que doou", () => {
		const funcao = (data: string) => funcaoParaFato(CPF_A, "X", { ...lerFuncoes([registro([{ ...FEX, dataIngressoFuncao: data }])])[0] }, 0, AGORA);
		const depois = executarCruzamentos([doador(CPF_A, 3000, "2022"), funcao("19/03/2023")]);
		expect(depois[0]).toMatchObject({ regra: "doador-cargo-confianca", severidade: "ALTA" });
		expect(depois[0].resumo).toContain("Nomeação depois da eleição em que doou");
		expect(depois[0].resumo).toContain("***.982.247-**");

		const antes = executarCruzamentos([doador(CPF_A, 3000, "2022"), funcao("10/01/2020")]);
		expect(antes[0]).toMatchObject({ severidade: "MEDIA" });
		expect(antes[0].resumo).toContain("A função começou antes da eleição");

		// Doador da lista antiga (sem ano): fica MÉDIA, sem nota.
		expect(nomeadoDepoisDaEleicao([{ ...doador(CPF_A, 1), data: undefined }], [funcao("19/03/2023")])).toBeNull();
	});
});
