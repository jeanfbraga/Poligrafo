import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	resolverCnpjDaEmpresa: vi.fn(),
	buscarDadosCnpj: vi.fn(),
}));

vi.mock("@/services/core/empresas-declaradas", () => ({ resolverCnpjDaEmpresa: mocks.resolverCnpjDaEmpresa }));
vi.mock("@/services/integrations/receita/cnpj", () => ({ buscarDadosCnpj: mocks.buscarDadosCnpj }));

import { GET } from "../../src/app/api/investigar/cnpj/route";

async function eventos(url: string): Promise<{ tipo: string; payload: any }[]> {
	const res = await GET(new Request(url));
	const texto = await res.text();
	return texto
		.split("\n")
		.filter((l) => l.startsWith("data: "))
		.map((l) => JSON.parse(l.slice(6)));
}

const BOLSOTINI = {
	razao_social: "BOLSOTINI CHOCOLATES E CAFE LTDA",
	descricao_situacao_cadastral: "BAIXADA",
	qsa: [{ nome_socio: "FLAVIO NANTES BOLSONARO", qualificacao_socio: "22-Sócio" }],
};

describe("drilldown de empresa (/api/investigar/cnpj)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("TRANSPARENCIA_API_KEY", "");
	});

	it("empresa declarada sem CNPJ: acha o CNPJ conferindo o político no QSA e atualiza o próprio nó", async () => {
		mocks.resolverCnpjDaEmpresa.mockResolvedValue({ cnpj: "21636316000144", dados: BOLSOTINI, veredito: { confirmado: true, forca: "NOME", motivo: "x" } });
		mocks.buscarDadosCnpj.mockResolvedValue({ ok: true, via: "ReceitaWS", dados: BOLSOTINI });
		const ev = await eventos("http://x/api/investigar/cnpj?nome=Bolsotini%20Chocolates%20e%20Caf%C3%A9%20LTDA&socio=FLAVIO%20NANTES%20BOLSONARO&socio=Fl%C3%A1vio%20Bolsonaro&origemId=empresa-tse-pessoa-1-2018-0");
		expect(mocks.resolverCnpjDaEmpresa).toHaveBeenCalledWith("Bolsotini Chocolates e Café LTDA", { nomes: ["FLAVIO NANTES BOLSONARO", "FLAVIO BOLSONARO"], cpf: null });
		const empresa = ev.find((e) => e.tipo === "NODE_NOVO" && e.payload.type === "EMPRESA")!.payload;
		expect(empresa).toMatchObject({ id: "empresa-tse-pessoa-1-2018-0", data: { cnpj: "21.636.316/0001-44", label: "BOLSOTINI CHOCOLATES E CAFE LTDA", situacao: "BAIXADA" } });
		// Mesmo nó: o motivo "declarado ao TSE" não é trocado.
		expect(empresa.data.motivo_ia).toBeUndefined();
		expect(ev.filter((e) => e.tipo === "NODE_NOVO" && e.payload.type === "SOCIO").map((e) => e.payload.data.label)).toEqual(["FLAVIO NANTES BOLSONARO"]);
		expect(ev.at(-1)?.tipo).toBe("DONE");
	});

	it("nome sem confirmação no QSA: erro explicado, nenhum nó (nunca um CNPJ qualquer)", async () => {
		mocks.resolverCnpjDaEmpresa.mockResolvedValue(null);
		const ev = await eventos("http://x/api/investigar/cnpj?nome=Bolsotini&socio=FLAVIO%20NANTES%20BOLSONARO&origemId=empresa-tse-1");
		expect(ev.some((e) => e.tipo === "NODE_NOVO")).toBe(false);
		expect(ev.at(-1)).toMatchObject({ tipo: "ERROR", payload: { mensagem: expect.stringContaining("Não foi possível confirmar o CNPJ de \"Bolsotini\"") } });
		expect(mocks.buscarDadosCnpj).not.toHaveBeenCalled();
	});

	it("nome sem o político (cliente antigo, nome no ?cnpj=): não procura às cegas", async () => {
		const ev = await eventos("http://x/api/investigar/cnpj?cnpj=Bolsotini%20Chocolates&origemId=empresa-tse-1");
		expect(mocks.resolverCnpjDaEmpresa).not.toHaveBeenCalled();
		expect(ev).toEqual([{ tipo: "ERROR", payload: { mensagem: expect.stringContaining("é preciso saber quem é o sócio") } }]);
	});

	it("fornecedor com CNPJ: nó novo ligado à despesa, com o motivo da situação cadastral", async () => {
		mocks.buscarDadosCnpj.mockResolvedValue({ ok: true, via: "BrasilAPI", dados: { ...BOLSOTINI, descricao_situacao_cadastral: "ATIVA" } });
		const ev = await eventos("http://x/api/investigar/cnpj?cnpj=21.636.316/0001-44&origemId=despesa-9");
		const empresa = ev.find((e) => e.tipo === "NODE_NOVO" && e.payload.type === "EMPRESA")!.payload;
		expect(empresa.id).toMatch(/^empresa-21636316000144-/);
		expect(empresa._origemId).toBe("despesa-9");
		expect(empresa.data.motivo_ia).toBe("Empresa com situação cadastral ATIVA na Receita Federal.");
		expect(mocks.resolverCnpjDaEmpresa).not.toHaveBeenCalled();
	});

	it("Receita fora do ar: erro com as três fontes tentadas", async () => {
		mocks.buscarDadosCnpj.mockResolvedValue({ ok: false, motivo: "HTTP_5XX" });
		const ev = await eventos("http://x/api/investigar/cnpj?cnpj=21636316000144&origemId=despesa-9");
		expect(ev.at(-1)?.payload.mensagem).toContain("(BrasilAPI / Minha Receita / ReceitaWS)");
	});

	it("parâmetros inválidos: 400", async () => {
		for (const q of ["cnpj=123&origemId=x", "nome=ab&origemId=x", "cnpj=21636316000144"]) {
			const res = await GET(new Request(`http://x/api/investigar/cnpj?${q}`));
			expect(res.status).toBe(400);
		}
	});
});

describe("playwright fora do carregamento das rotas", () => {
	// 08/10/2026: com o playwright 1.63 (Dependabot), o import estático em alerj.ts derrubava
	// /api/investigar inteira na Vercel ("Cannot find module playwright-core/browsers.json").
	it("nenhum arquivo de src/ importa o playwright no topo (só import() dentro da função)", () => {
		const estaticos: string[] = [];
		const varrer = (dir: string) => {
			for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
				const p = path.join(dir, nome.name);
				if (nome.isDirectory()) varrer(p);
				else if (/\.tsx?$/.test(nome.name) && !/\.test\.tsx?$/.test(nome.name) && /^\s*import\s[^(]*from\s+["']playwright/m.test(fs.readFileSync(p, "utf8"))) estaticos.push(p);
			}
		};
		varrer(path.join(process.cwd(), "src"));
		expect(estaticos).toEqual([]);
	});
});
