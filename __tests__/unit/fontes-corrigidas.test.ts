import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarEstadoFonteHttp } from "../../src/lib/fonte-http";
import { primeiroNumero, primeiroValor } from "../../src/lib/valores";
import {
	cruzarDoadoresComContratosPublicos,
	montarNoDoadorComContrato,
} from "../../src/services/core/doadores-contratos";
import { buscarSancoesEmpresa } from "../../src/services/integrations/transparencia/sancoes-empresa";

vi.mock("../../src/app/api/investigar/tse", async (original) => ({
	...(await original<typeof import("../../src/app/api/investigar/tse")>()),
	fetchWithTimeout: vi.fn(),
}));
import { fetchWithTimeout } from "../../src/app/api/investigar/tse";
import { buscarInabilitadosTCU } from "../../src/services/integrations/tcu/client";

const CNPJ = "33000167000101";

describe("sanções de empresa (CEIS/CNEP/CEPIM)", () => {
	beforeEach(() => reiniciarEstadoFonteHttp());

	it("usa os parâmetros certos de cada base (o /sancoes não existe)", async () => {
		const urls: string[] = [];
		const fetchFn = vi.fn(async (url: string) => {
			urls.push(url);
			const dados = url.includes("/cnep?") ? [{ id: 1, tipoSancao: "Multa" }] : [];
			return new Response(JSON.stringify(dados), { status: 200 });
		});
		const r = await buscarSancoesEmpresa(CNPJ, "chave", fetchFn as unknown as typeof fetch);
		expect(urls.some((u) => u.includes(`/ceis?codigoSancionado=${CNPJ}`))).toBe(true);
		expect(urls.some((u) => u.includes(`/cnep?codigoSancionado=${CNPJ}`))).toBe(true);
		expect(urls.some((u) => u.includes(`/cepim?cnpjSancionado=${CNPJ}`))).toBe(true);
		expect(urls.some((u) => u.includes("/sancoes"))).toBe(false);
		expect(r).toEqual([{ base: "cnep", nomeBase: "CNEP (Empresas Punidas)", registro: { id: 1, tipoSancao: "Multa" } }]);
	});

	it("sem chave ou CNPJ inválido não consulta", async () => {
		const fetchFn = vi.fn();
		expect(await buscarSancoesEmpresa(CNPJ, "", fetchFn as unknown as typeof fetch)).toEqual([]);
		expect(await buscarSancoesEmpresa("123", "chave", fetchFn as unknown as typeof fetch)).toEqual([]);
		expect(fetchFn).not.toHaveBeenCalled();
	});
});

describe("doador com contrato público", () => {
	const contrato = (id: string, valor: number) => ({
		id, fonte: "CGU" as const, niFornecedor: CNPJ, nomeFornecedor: "X",
		orgaoEntidade: { cnpj: "1", razaoSocial: "MINISTÉRIO" }, objetoContrato: "SERVIÇO", valorGlobal: valor, url: `https://x/${id}`,
	});

	it("nó traz os contratos que provam o alerta (procedência)", () => {
		const no = montarNoDoadorComContrato(CNPJ, [contrato("cgu:1", 100), contrato("cgu:2", 50)], "pessoa-1");
		expect(no.data.valor).toBe(150);
		expect(no.data.contratos.map((c) => c.url)).toEqual(["https://x/cgu:1", "https://x/cgu:2"]);
		expect(no.id).toBe(`doador-contrato-${CNPJ}`);
		// Só o fato: a gravidade vem do motor de cruzamentos (sem nota 100 fixa).
		expect(no.data).not.toHaveProperty("score_letalidade");
	});

	it("só gera nó para doador com contrato, em grupos de 3", async () => {
		const buscar = vi.fn(async (cnpj: string) => (cnpj === CNPJ ? [contrato("cgu:1", 10)] : []));
		const avisos: string[] = [];
		const nos = await cruzarDoadoresComContratosPublicos(["11111111000191", CNPJ, "22222222000191", "33333333000191"], "p", (m) => avisos.push(m), buscar);
		expect(nos).toHaveLength(1);
		expect(buscar).toHaveBeenCalledTimes(4);
		expect(avisos[0]).toContain(CNPJ);
	});
});

describe("TCU inabilitados no ORDS", () => {
	afterEach(() => vi.mocked(fetchWithTimeout).mockReset());

	it("lê { items } e descarta outro CPF (filtro ignorado não contamina)", async () => {
		vi.mocked(fetchWithTimeout).mockResolvedValueOnce(new Response(JSON.stringify({
			items: [
				{ nome: "FULANO", cpf: "529.982.247-25", processo: "026.615/2020-7", deliberacao: "AC-1/2022", data_final: "2027" },
				{ nome: "OUTRO", cpf: "111.444.777-35" },
			],
		}), { status: 200 }));
		const r = await buscarInabilitadosTCU("52998224725");
		expect(vi.mocked(fetchWithTimeout).mock.calls[0][0]).toContain("contas.tcu.gov.br/ords/condenacao/consulta/inabilitados/52998224725");
		expect(r).toEqual([expect.objectContaining({ nome: "FULANO", motivo: "Processo TCU 026.615/2020-7", deliberacao: "AC-1/2022" })]);
	});
});

describe("valores", () => {
	it("primeiro valor preenchido e primeiro número", () => {
		expect(primeiroValor(undefined, "", null, "a", "b")).toBe("a");
		expect(primeiroValor()).toBe("");
		expect(primeiroNumero(undefined, "x", "12.5", 3)).toBe(12.5);
		expect(primeiroNumero(null)).toBe(0);
	});
});
