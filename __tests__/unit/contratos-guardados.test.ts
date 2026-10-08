import { afterEach, describe, expect, it, vi } from "vitest";
import { coletarContratosDoEnte, emitirColetaDoEnte } from "@/services/core/contratos-do-ente";
import { contratosComCopia, type DepsGuardados, enxuto } from "@/services/integrations/pncp/contratos-guardados";
import { deConsulta } from "@/services/integrations/pncp/contratos-orgao";

const CNPJ = "03533064000146";
const AGORA = new Date("2026-10-08T15:00:00Z");
const contrato = (valor: number) =>
	deConsulta({
		numeroControlePNCP: `${CNPJ}-2-0000${valor}/2026`, anoContrato: 2026, sequencialContrato: valor,
		orgaoEntidade: { cnpj: CNPJ, razaoSocial: "MUNICIPIO X" }, unidadeOrgao: { nomeUnidade: "SECRETARIA" },
		niFornecedor: "11222333000181", nomeRazaoSocialFornecedor: "FORNECEDOR", objetoContrato: "x".repeat(500), valorGlobal: valor, dataAssinatura: "2026-03-01",
	});
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3600_000).toISOString();

function deps(extra: Partial<DepsGuardados> = {}): DepsGuardados & { ler: any; gravar: any; buscar: any } {
	return {
		ler: vi.fn(async () => null),
		gravar: vi.fn(async () => {}),
		buscar: vi.fn(async () => [contrato(10)]),
		agora: () => AGORA,
		...extra,
	} as never;
}

afterEach(() => vi.restoreAllMocks());

describe("contratos do PNCP com cópia guardada no Banco de Perfil", () => {
	it("cópia de menos de 24 h: usa direto, sem chamar o PNCP", async () => {
		const d = deps({ ler: vi.fn(async () => ({ consultado_em: horasAtras(5), contratos: [contrato(1)] })) });
		expect(await contratosComCopia(CNPJ, {}, d)).toMatchObject({ origem: "guardado", guardadoEm: horasAtras(5), contratos: [{ valorGlobal: 1 }] });
		expect(d.buscar).not.toHaveBeenCalled();
	});

	it("sem cópia: consulta o PNCP e guarda o resultado (inclusive 'nenhum contrato')", async () => {
		const d = deps({ buscar: vi.fn(async () => []) });
		expect(await contratosComCopia(CNPJ, { paginas: 1 }, d)).toEqual({ contratos: [], origem: "ao_vivo", guardadoEm: null });
		expect(d.buscar).toHaveBeenCalledWith(CNPJ, { paginas: 1 });
		expect(d.gravar).toHaveBeenCalledWith(CNPJ, [], AGORA);
	});

	it("cópia velha + PNCP fora: usa a cópia (até 30 dias) e a falha vira 'tentando de novo' na tela", async () => {
		const d = deps({
			ler: vi.fn(async () => ({ consultado_em: horasAtras(72), contratos: [contrato(2)] })),
			buscar: vi.fn(async () => Promise.reject(new Error("PNCP não respondeu"))),
		});
		expect(await contratosComCopia(CNPJ, {}, d)).toMatchObject({ origem: "guardado_antigo", guardadoEm: horasAtras(72) });
		expect(d.buscar).toHaveBeenCalledWith(CNPJ, { avisoDeFalha: "lenta" });
		expect(d.gravar).not.toHaveBeenCalled();
	});

	it("cópia velha + PNCP respondeu: troca pela nova; cópia de mais de 30 dias não serve de reserva", async () => {
		const renova = deps({ ler: vi.fn(async () => ({ consultado_em: horasAtras(72), contratos: [] })) });
		expect((await contratosComCopia(CNPJ, {}, renova)).origem).toBe("ao_vivo");
		expect(renova.gravar).toHaveBeenCalled();
		const vencida = deps({
			ler: vi.fn(async () => ({ consultado_em: horasAtras(24 * 40), contratos: [contrato(3)] })),
			buscar: vi.fn(async () => Promise.reject(new Error("PNCP não respondeu"))),
		});
		await expect(contratosComCopia(CNPJ, {}, vencida)).rejects.toThrow("PNCP não respondeu");
		expect(vencida.buscar).toHaveBeenCalledWith(CNPJ, {});
	});

	it("banco fora do ar não atrapalha: segue no PNCP e avisa no log (ler e gravar)", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const d = deps({ ler: vi.fn(async () => Promise.reject(new Error("timeout"))), gravar: vi.fn(async () => Promise.reject(new Error("disco cheio"))) });
		expect((await contratosComCopia(CNPJ, {}, d)).origem).toBe("ao_vivo");
		expect(aviso).toHaveBeenCalledWith("[PNCP] Cópia guardada indisponível (timeout); consultando o PNCP direto.");
		expect(aviso).toHaveBeenCalledWith("[PNCP] Não foi possível guardar a cópia dos contratos (disco cheio).");
	});

	it("guarda só o essencial (objeto cortado em 200 caracteres)", () => {
		expect(enxuto(contrato(1)).objeto).toHaveLength(200);
	});
});

describe("log e lista de fontes dizem quando os contratos vieram da cópia", () => {
	const CUIABA = { cod_ibge: 5103403, ente: "Cuiabá", uf: "MT", esfera: "M", populacao: 1, cnpj: CNPJ };
	const depsEnte = (r: unknown) => ({
		porIbge: vi.fn(async () => CUIABA), porNome: vi.fn(async () => CUIABA), estadual: vi.fn(async () => CUIABA),
		contratos: vi.fn(async () => r as never),
	});

	it("cópia antiga (PNCP fora): a linha e a etapa dizem de quando é", async () => {
		const coleta = await coletarContratosDoEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403" }, depsEnte({ contratos: [contrato(5)], origem: "guardado_antigo", guardadoEm: "2026-10-01T10:00:00Z" }));
		const eventos: { tipo: string; payload: any }[] = [];
		emitirColetaDoEnte(coleta, "p", (tipo, payload) => eventos.push({ tipo, payload }));
		expect(eventos.find((e) => e.tipo === "STATUS")?.payload.msg).toBe(
			"[PNCP] Prefeitura (Cuiabá): 1 contrato(s) nos últimos 12 meses (R$ 5). Todos aparecem no dossiê e entram nos cruzamentos. O PNCP não respondeu agora: são os contratos guardados em 01/10/2026 às 07:00.",
		);
		expect(eventos.find((e) => e.tipo === "ETAPA")?.payload.detalhe).toBe("1 contrato: Prefeitura (Cuiabá) (cópia de 01/10/2026; o PNCP não respondeu agora)");
	});

	it("cópia recente: diz que é consulta guardada; ao vivo: nada a mais", async () => {
		const recente = await coletarContratosDoEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403" }, depsEnte({ contratos: [], origem: "guardado", guardadoEm: "2026-10-08T13:30:00Z" }));
		const msgs: string[] = [];
		emitirColetaDoEnte(recente, "p", (t, p) => (t === "STATUS" ? msgs.push(p.msg) : null));
		expect(msgs[0]).toBe("[PNCP] Prefeitura (Cuiabá): nenhum contrato publicado no PNCP nos últimos 12 meses (o órgão pode publicar em portal próprio). Consulta guardada de 08/10/2026 às 10:30.");
		const vivo = await coletarContratosDoEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403" }, depsEnte([contrato(7)]));
		expect(vivo).toMatchObject({ situacao: "OK", copia: null });
	});
});
