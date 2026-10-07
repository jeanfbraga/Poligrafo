import { describe, expect, it, vi } from "vitest";
import {
	AgregadorContas,
	despesaParaRegistro,
	ehEleito,
	estimarMb,
	receitaParaRegistro,
	valorBr,
} from "../../scripts/etl/tse-contas-campanha";
import { buscarContasCampanha, reiniciarAvisoCampanha } from "../../src/services/integrations/tse/campanha";
import { buscarEleitoDoAlvo } from "../../src/services/integrations/tse/eleitos";

const CPF_DOADOR = "52998224725";
const CPF_CANDIDATO = "11144477735";
const CNPJ = "11222333000181";

const receita = (extra: Record<string, string> = {}) => ({
	SQ_CANDIDATO: "100", NR_CPF_CANDIDATO: CPF_CANDIDATO, DS_ORIGEM_RECEITA: "Recursos de pessoas físicas",
	NR_CPF_CNPJ_DOADOR: CPF_DOADOR, NM_DOADOR: "JOSE", NM_DOADOR_RFB: "JOSE DA SILVA", VR_RECEITA: "1.500,50", ...extra,
});
const despesa = (extra: Record<string, string> = {}) => ({
	SQ_CANDIDATO: "100", NR_CPF_CNPJ_FORNECEDOR: CNPJ, NM_FORNECEDOR: "GRAFICA", NM_FORNECEDOR_RFB: "GRAFICA X LTDA",
	VR_DESPESA_CONTRATADA: "2000,00", DS_ORIGEM_DESPESA: "Publicidade por materiais impressos", ...extra,
});

describe("ETL contas de campanha (regras puras)", () => {
	it("valor no formato brasileiro", () => {
		expect([valorBr("1.500,50"), valorBr("2000,00"), valorBr(""), valorBr("abc")]).toEqual([1500.5, 2000, 0, 0]);
	});

	it("doador: só pessoa física/internet, com documento válido e nunca o próprio candidato", () => {
		expect(receitaParaRegistro(receita())).toEqual({ sq: "100", documento: CPF_DOADOR, nome: "JOSE DA SILVA", valor: 1500.5, origem: "Recursos de pessoas físicas" });
		expect(receitaParaRegistro(receita({ DS_ORIGEM_RECEITA: "Doações pela Internet" }))).not.toBeNull();
		expect(receitaParaRegistro(receita({ DS_ORIGEM_RECEITA: "Recursos de partido político" }))).toBeNull();
		expect(receitaParaRegistro(receita({ DS_ORIGEM_RECEITA: "Recursos próprios" }))).toBeNull();
		expect(receitaParaRegistro(receita({ NR_CPF_CNPJ_DOADOR: CPF_CANDIDATO }))).toBeNull();
		expect(receitaParaRegistro(receita({ NR_CPF_CNPJ_DOADOR: "-4" }))).toBeNull();
	});

	it("fornecedor: só CNPJ válido (cabo eleitoral com CPF fica de fora)", () => {
		expect(despesaParaRegistro(despesa())).toMatchObject({ documento: CNPJ, nome: "GRAFICA X LTDA", valor: 2000 });
		expect(despesaParaRegistro(despesa({ NR_CPF_CNPJ_FORNECEDOR: CPF_DOADOR }))).toBeNull();
		expect(despesaParaRegistro(despesa({ NR_CPF_CNPJ_FORNECEDOR: "11222333000100" }))).toBeNull();
	});

	it("contas só de eleito (suplente fica de fora)", () => {
		expect([ehEleito("ELEITO POR QP"), ehEleito("ELEITO POR MÉDIA"), ehEleito("SUPLENTE"), ehEleito(null)]).toEqual([true, true, false, false]);
	});

	it("agrega por candidato + papel + documento: soma, quantidade e origem mais frequente; conta descartes", () => {
		const ag = new AgregadorContas(2022, new Set(["100"]));
		ag.adicionar("DOADOR", receitaParaRegistro(receita()));
		ag.adicionar("DOADOR", receitaParaRegistro(receita({ VR_RECEITA: "499,50", DS_ORIGEM_RECEITA: "Doações pela Internet" })));
		ag.adicionar("DOADOR", receitaParaRegistro(receita({ DS_ORIGEM_RECEITA: "Recursos de pessoas físicas" })));
		ag.adicionar("FORNECEDOR", despesaParaRegistro(despesa()));
		ag.adicionar("FORNECEDOR", despesaParaRegistro(despesa({ SQ_CANDIDATO: "999" })));
		ag.adicionar("DOADOR", null);
		const linhas = ag.linhas();
		expect(linhas).toHaveLength(2);
		expect(linhas[0]).toEqual({ sq_candidato: "100", ano_eleicao: 2022, tipo: "DOADOR", documento: CPF_DOADOR, nome: "JOSE DA SILVA", valor_total: 3500.5, quantidade: 3, origem: "Recursos de pessoas físicas" });
		expect(ag.descartadosNaoEleitos).toBe(1);
		expect(estimarMb(linhas)).toBeGreaterThanOrEqual(0);
	});
});

/** Cliente Supabase falso por tabela/tipo, registrando os filtros. */
function clienteFalso(respostas: Record<string, { data?: unknown[]; error?: { message: string } }>) {
	const chamadas: unknown[][] = [];
	const cliente = {
		from(tabela: string) {
			const filtros: Record<string, unknown> = {};
			const q: Record<string, unknown> = {};
			for (const m of ["select", "order", "limit", "in", "filter"]) q[m] = (...a: unknown[]) => (chamadas.push([m, ...a]), q);
			q.eq = (col: string, val: unknown) => {
				filtros[col] = val;
				chamadas.push(["eq", col, val]);
				return q;
			};
			q.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => {
				const r = respostas[`${tabela}:${filtros.tipo ?? ""}`] ?? respostas[tabela] ?? { data: [] };
				return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(ok, erro);
			};
			chamadas.push(["from", tabela]);
			return q;
		},
	};
	return { cliente: cliente as never, chamadas };
}

describe("consulta das contas de campanha (Banco de Perfil)", () => {
	it("doadores e fornecedores pelo número do candidato, maiores primeiro", async () => {
		const { cliente, chamadas } = clienteFalso({
			"tse_campanha_contas:DOADOR": { data: [{ documento: CPF_DOADOR, tipo: "DOADOR" }] },
			"tse_campanha_contas:FORNECEDOR": { data: [{ documento: CNPJ, tipo: "FORNECEDOR" }] },
		});
		const r = await buscarContasCampanha("100", cliente);
		expect(r?.doadores).toHaveLength(1);
		expect(r?.fornecedores).toHaveLength(1);
		expect(chamadas).toContainEqual(["eq", "sq_candidato", "100"]);
		expect(chamadas).toContainEqual(["order", "valor_total", { ascending: false }]);
	});

	it("sem número do candidato nem consulta; tabela ausente = null com aviso no log uma vez", async () => {
		const vazio = clienteFalso({});
		expect(await buscarContasCampanha(null, vazio.cliente)).toBeNull();
		expect(vazio.chamadas).toHaveLength(0);

		reiniciarAvisoCampanha();
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { cliente } = clienteFalso({ tse_campanha_contas: { error: { message: "Could not find the table 'public.tse_campanha_contas'" } } });
		expect(await buscarContasCampanha("100", cliente)).toBeNull();
		expect(await buscarContasCampanha("100", cliente)).toBeNull();
		expect(aviso).toHaveBeenCalledTimes(1);
		expect(aviso.mock.calls[0][0]).toBe("[TSE CAMPANHA] Base indisponível (Could not find the table 'public.tse_campanha_contas'); seguindo sem ela.");
		aviso.mockRestore();
	});
});

describe("eleito do alvo", () => {
	it("deputado federal: a ref tem o id da Câmara, então procura pelo CPF oficial", async () => {
		const { cliente, chamadas } = clienteFalso({ tse_eleitos: { data: [{ sq_candidato: "130001", nm_candidato: "FULANO" }] } });
		const e = await buscarEleitoDoAlvo({ id: "204554", cpfOficial: CPF_CANDIDATO }, cliente);
		expect(e?.sq_candidato).toBe("130001");
		expect(chamadas).toContainEqual(["eq", "nr_cpf_candidato", CPF_CANDIDATO]);
		expect(await buscarEleitoDoAlvo({ id: "204554" }, clienteFalso({}).cliente)).toBeNull();
	});

	it("senador (sem CPF na API do Senado): nome exato + cargo + UF, só com resultado único, marcado porNome", async () => {
		const moro = { sq_candidato: "160001", nm_candidato: "SERGIO FERNANDO MORO", nm_urna_candidato: "SERGIO MORO", cd_cargo: "5", sg_uf: "PR" };
		const unico = clienteFalso({ tse_eleitos: { data: [moro] } });
		const e = await buscarEleitoDoAlvo({ id: "5502", nome: "Sergio Moro", uf: "PR", cargoTse: "5" }, unico.cliente);
		expect(e).toMatchObject({ sq_candidato: "160001", porNome: true });
		expect(unico.chamadas).toContainEqual(["in", "cd_cargo", ["5"]]);
		expect(unico.chamadas).toContainEqual(["eq", "sg_uf", "PR"]);

		const dois = clienteFalso({ tse_eleitos: { data: [moro, { ...moro, sq_candidato: "160002" }] } });
		expect(await buscarEleitoDoAlvo({ id: "5502", nome: "Sergio Moro", uf: "PR", cargoTse: "5" }, dois.cliente)).toBeNull();
		const parcial = clienteFalso({ tse_eleitos: { data: [{ ...moro, nm_urna_candidato: "SERGIO MORO FILHO", nm_candidato: "SERGIO MORO FILHO" }] } });
		expect(await buscarEleitoDoAlvo({ id: "5502", nome: "Sergio Moro", uf: "PR", cargoTse: "5" }, parcial.cliente)).toBeNull();
		const semUf = clienteFalso({ tse_eleitos: { data: [moro] } });
		expect(await buscarEleitoDoAlvo({ id: "5502", nome: "Sergio Moro", uf: "BR", cargoTse: "5" }, semUf.cliente)).toBeNull();
	});
});
