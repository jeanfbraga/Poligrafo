import { describe, expect, it, vi } from "vitest";
import { construirCard } from "../../src/components/nodes/card-model";
import { cnpjValido } from "../../src/lib/documento";
import { achadoParaNo, cruzarDadosDaInvestigacao, emitirCruzamentos } from "../../src/services/cruzamentos";
import {
	completarNomes,
	fatosDeDespesasMandato,
	fatosDeDoadores,
	fatosDeEmpresasDoPolitico,
	fatosDeNos,
} from "../../src/services/cruzamentos/adaptadores";
import { executarCruzamentos, raizCnpj } from "../../src/services/cruzamentos/motor";
import { cnpjsParaConferir, fatosDeSancoes, sancaoParaFato } from "../../src/services/cruzamentos/sancoes";
import type { Fato, Papel } from "../../src/services/cruzamentos/tipos";

/** CNPJ válido a partir dos 12 primeiros dígitos (calcula os verificadores). */
function cnpj(base12: string): string {
	const dv = (b: string) => {
		const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
		const resto = [...b].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
		return resto < 2 ? "0" : String(11 - resto);
	};
	const d1 = dv(base12);
	return base12 + d1 + dv(base12 + d1);
}

const MATRIZ = cnpj("112223330001");
const FILIAL = cnpj("112223330002");
const OUTRA = cnpj("998887770001");
const CPF = "52998224725";
const AGORA = "2026-10-06T12:00:00.000Z";

function f(papel: Papel, documento: string, extra: Partial<Fato> = {}): Fato {
	return {
		id: `fato-${papel}-${documento}-${extra.detalhe ?? 0}`,
		papel,
		documento,
		nome: "",
		procedencia: { fonte: `Fonte ${papel}`, chave: `doc=${documento}`, coletadoEm: AGORA },
		...extra,
	};
}

describe("adaptadores → fatos", () => {
	it("CNPJs de teste são válidos e a raiz é a mesma", () => {
		expect([MATRIZ, FILIAL, OUTRA].every((c) => cnpjValido(c))).toBe(true);
		expect(raizCnpj(MATRIZ)).toBe(raizCnpj(FILIAL));
		expect(raizCnpj(CPF)).toBeNull();
	});

	it("doadores: documentos válidos, sem repetição", () => {
		const fatos = fatosDeDoadores([MATRIZ, MATRIZ, "123", null, CPF, "00000000000"], AGORA);
		expect(fatos.map((x) => x.documento)).toEqual([MATRIZ, CPF]);
		expect(fatos[0]).toMatchObject({ papel: "DOADOR", procedencia: { fonte: "TSE — doadores de campanha", coletadoEm: AGORA } });
	});

	it("empresas do político levam o link do QSA", () => {
		expect(fatosDeEmpresasDoPolitico([MATRIZ, "x"], AGORA)).toEqual([
			expect.objectContaining({ papel: "EMPRESA_DO_POLITICO", documento: MATRIZ, procedencia: expect.objectContaining({ url: `https://brasilapi.com.br/api/cnpj/v1/${MATRIZ}` }) }),
		]);
	});

	it("despesas do mandato: fornecedor com documento válido, valor, data e link do documento", () => {
		const fatos = fatosDeDespesasMandato([
			{ cnpjCpfFornecedor: MATRIZ, nomeFornecedor: "GRÁFICA X", tipoDespesa: "DIVULGAÇÃO", valorDocumento: 5000, dataDocumento: "2025-03-01", urlDocumento: "https://camara/nf.pdf", fonte: "CAMARA", natureza: "MANDATO" },
			{ cnpjCpfFornecedor: "", nomeFornecedor: "SEM DOC", tipoDespesa: "X", valorDocumento: 1, dataDocumento: "", fonte: "CAMARA", natureza: "MANDATO" },
		], AGORA);
		expect(fatos).toHaveLength(1);
		expect(fatos[0]).toMatchObject({ papel: "FORNECEDOR_COTA", nome: "GRÁFICA X", valor: 5000, procedencia: { url: "https://camara/nf.pdf" } });
	});

	it("nós do grafo: contrato do ente, contratos de doador (id novo e antigo) e beneficiário de emenda", () => {
		const fatos = fatosDeNos([
			{ id: "contrato-ente-1", type: "CONTRATO", data: { natureza: "ENTE", documento: OUTRA, label: "CONSTRUTORA", valor: 100, fonte: "TCE-RJ", url: "https://tce" } },
			{ id: "contrato-federal", type: "CONTRATO", data: { documento: OUTRA } },
			{ id: `doador-contrato-${MATRIZ}`, type: "DESPESA", data: { documento: MATRIZ, contratos: [{ fonte: "CGU", orgao: "MIN. SAÚDE", valor: 10, url: "https://cgu/1" }] } },
			{ id: `toma-la-da-ca-${FILIAL}`, type: "DESPESA", data: { documento: FILIAL, contratos: [{ fonte: "PNCP", valor: 5 }] } },
			{ id: "emenda-1", type: "EMENDA", data: { codigo: "202500001", valor: 300, beneficiario: { cnpj: MATRIZ, nome: "INSTITUTO Y" } } },
		], AGORA);
		expect(fatos.map((x) => `${x.papel}:${x.documento}`)).toEqual([
			`CONTRATADO_ENTE:${OUTRA}`, `CONTRATADO_PUBLICO:${MATRIZ}`, `CONTRATADO_PUBLICO:${FILIAL}`, `BENEFICIARIO_EMENDA:${MATRIZ}`,
		]);
		expect(fatos[1].detalhe).toBe("MIN. SAÚDE");
	});

	it("nome de outro fato completa o doador que chega só com o documento", () => {
		const r = completarNomes([f("DOADOR", MATRIZ), f("FORNECEDOR_COTA", MATRIZ, { nome: "GRÁFICA X" })]);
		expect(r[0].nome).toBe("GRÁFICA X");
	});
});

describe("motor de cruzamentos", () => {
	it("doador pago com a cota: achado ALTA com os dois fatos e resumo com fonte e valor", () => {
		const fatos = [f("DOADOR", MATRIZ), f("FORNECEDOR_COTA", MATRIZ, { nome: "GRÁFICA X", valor: 5000, detalhe: "DIVULGAÇÃO" })];
		const [achado] = executarCruzamentos(fatos);
		expect(achado).toMatchObject({ id: `achado-doador-fornecedor-cota-${MATRIZ}`, severidade: "ALTA", somenteRaiz: false, nome: "GRÁFICA X" });
		expect(achado.fatos).toEqual(fatos.map((x) => x.id));
		expect(achado.resumo).toContain("verba do gabinete");
		expect(achado.resumo).toContain("Fonte FORNECEDOR_COTA — DIVULGAÇÃO (R$ 5.000,00)");
	});

	it("só a raiz do CNPJ coincide (matriz × filial): um nível abaixo e avisado", () => {
		const [achado] = executarCruzamentos([f("DOADOR", MATRIZ), f("FORNECEDOR_COTA", FILIAL)]);
		expect(achado).toMatchObject({ severidade: "MEDIA", somenteRaiz: true });
		expect(achado.resumo).toMatch(/raiz do CNPJ/);
	});

	it("achado completo não se repete pela raiz", () => {
		const achados = executarCruzamentos([f("DOADOR", MATRIZ), f("FORNECEDOR_COTA", MATRIZ), f("FORNECEDOR_COTA", FILIAL, { detalhe: "filial" })]);
		expect(achados).toHaveLength(1);
		expect(achados[0].somenteRaiz).toBe(false);
	});

	it("CPF de pessoa física: cruza pelo número inteiro e sai mascarado no resumo", () => {
		const [achado] = executarCruzamentos([f("DOADOR", CPF), f("FORNECEDOR_COTA", CPF, { nome: "JOÃO" })]);
		expect(achado.resumo).toContain("***.982.247-**");
		expect(achado.resumo).not.toContain(CPF);
	});

	it("sem dois papéis no mesmo documento não há achado; mais graves primeiro", () => {
		expect(executarCruzamentos([f("DOADOR", MATRIZ), f("FORNECEDOR_COTA", OUTRA)])).toEqual([]);
		const achados = executarCruzamentos([f("DOADOR", MATRIZ), f("CONTRATADO_PUBLICO", MATRIZ), f("FORNECEDOR_COTA", MATRIZ)]);
		expect(achados.map((a) => a.severidade)).toEqual(["ALTA", "MEDIA"]);
	});
});

describe("sanções dos CNPJs que importam", () => {
	it("prioriza empresa do político e doador; dentro do papel, maior valor; com limite", () => {
		const fatos = [
			f("FORNECEDOR_COTA", OUTRA, { valor: 10 }),
			f("FORNECEDOR_COTA", FILIAL, { valor: 999 }),
			f("DOADOR", MATRIZ),
			f("DOADOR", CPF),
		];
		expect(cnpjsParaConferir(fatos)).toEqual([MATRIZ, FILIAL, OUTRA]);
		expect(cnpjsParaConferir(fatos, 2)).toEqual([MATRIZ, FILIAL]);
	});

	it("registro do CEIS vira fato com base, tipo, órgão e período", () => {
		const fato = sancaoParaFato(MATRIZ, {
			base: "ceis", nomeBase: "CEIS (Inidôneas e Suspensas)",
			registro: { tipoSancao: { descricaoResumida: "Impedimento" }, orgaoSancionador: { nome: "MIN. X" }, dataInicioSancao: "01/01/2024", dataFimSancao: "01/01/2027", sancionado: { nome: "EMPRESA Z" } },
		}, 0, AGORA);
		expect(fato).toMatchObject({ papel: "SANCIONADO", nome: "EMPRESA Z", procedencia: { fonte: "Portal da Transparência — CEIS" } });
		expect(fato.detalhe).toBe("CEIS (Inidôneas e Suspensas) — Impedimento — órgão: MIN. X — desde 01/01/2024 até 01/01/2027");
	});

	it("consulta com falha não derruba as outras", async () => {
		const buscar = vi.fn(async (c: string) => {
			if (c === MATRIZ) throw new Error("timeout");
			return [{ base: "cnep", nomeBase: "CNEP", registro: {} }];
		});
		const fatos = await fatosDeSancoes([f("DOADOR", MATRIZ), f("DOADOR", OUTRA)], AGORA, buscar);
		expect(fatos.map((x) => x.documento)).toEqual([OUTRA]);
	});
});

describe("entrada do pipe", () => {
	const entrada = {
		pessoaId: "pessoa-1",
		casa: "CAMARA",
		doadores: [MATRIZ, CPF],
		empresasDoPolitico: [],
		despesasMandato: [
			{ cnpjCpfFornecedor: MATRIZ, nomeFornecedor: "GRÁFICA X", tipoDespesa: "DIVULGAÇÃO", valorDocumento: 5000, dataDocumento: "2025-03-01" },
			{ cnpjCpfFornecedor: CPF, nomeFornecedor: "JOÃO", tipoDespesa: "LOCAÇÃO", valorDocumento: 800 },
		],
		nos: [],
		agora: () => new Date(AGORA),
		buscarSancoes: async (c: string) => (c === MATRIZ ? [{ base: "ceis", nomeBase: "CEIS", registro: {} }] : []),
		// IA falsa: nenhum teste sai para a rede.
		explicar: async () => [],
	};

	it("cruza doador × cota × sanção de ponta a ponta", async () => {
		const { achados } = await cruzarDadosDaInvestigacao(entrada);
		expect(achados.map((a) => `${a.regra}:${a.documento}`).sort()).toEqual([
			`doador-fornecedor-cota:${MATRIZ}`,
			`doador-fornecedor-cota:${CPF}`,
			`sancionado-cota:${MATRIZ}`,
			`sancionado-doador:${MATRIZ}`,
		]);
	});

	it("nó ACHADO: nota pela severidade, CPF mascarado e fatos com fonte", async () => {
		const { fatos, achados } = await cruzarDadosDaInvestigacao(entrada);
		const doCpf = achados.find((a) => a.documento === CPF);
		const no = achadoParaNo(doCpf!, fatos, "pessoa-1");
		expect(no).toMatchObject({ type: "ACHADO", _origemId: "pessoa-1", data: { severidade: "ALTA", score_letalidade: 90, documento: "***.982.247-**", gerado_por: "regra (sem IA)" } });
		expect(JSON.stringify(no)).not.toContain(CPF);
		expect(no.data.fatos.map((x) => x.papel)).toEqual(["DOADOR", "FORNECEDOR_COTA"]);
		const card = construirCard("ACHADO", no.data);
		expect(card).toMatchObject({ tag: "Cruzamento de dados", risco: "crit", chave: { label: "Gravidade", valor: "Alta" } });
	});

	it("emite um NODE_NOVO por achado e registra o andamento no log da tela", async () => {
		const eventos: { tipo: string; payload: any }[] = [];
		await emitirCruzamentos(entrada, (tipo, payload) => eventos.push({ tipo, payload }));
		expect(eventos.filter((e) => e.tipo === "NODE_NOVO")).toHaveLength(4);
		expect(eventos.filter((e) => e.tipo === "STATUS").map((e) => e.payload.msg)).toEqual([
			"Cruzando doadores, empresas, cota, contratos e sanções (regras fixas, sem IA)...",
			"[CRUZAMENTO] 4 cruzamento(s) entre 5 fatos verificados.",
		]);
	});

	it("sem cruzamento, o log diz quantos fatos foram olhados", async () => {
		const msgs: string[] = [];
		await emitirCruzamentos({ ...entrada, doadores: [], buscarSancoes: async () => [] }, (tipo, p) => tipo === "STATUS" && msgs.push(p.msg));
		expect(msgs.at(-1)).toBe("[CRUZAMENTO] Nenhum cruzamento entre os 2 fatos coletados.");
	});

	it("falha no motor vira aviso no console e nunca derruba o dossiê", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const quebrado = await emitirCruzamentos(entrada, () => {
			throw new Error("tela fechada");
		});
		expect(quebrado).toEqual([]);
		expect(aviso).toHaveBeenCalledWith("[CRUZAMENTOS] Falha no motor:", expect.objectContaining({ message: "tela fechada" }));
		aviso.mockRestore();
	});

	it("explicação da IA reemite o nó (mesmo id) sem mudar a gravidade; IA com erro não quebra", async () => {
		const nos: any[] = [];
		const explicar = vi.fn(async (lista: any[]) => [{ achado_id: lista[0].id, prioridade: 1, texto: "Vale conferir as notas F1 e F2.", fatos_citados: ["F1", "F2"] }]);
		await emitirCruzamentos({ ...entrada, explicar }, (tipo, p) => tipo === "NODE_NOVO" && nos.push(p));
		const ultimo = nos.at(-1);
		expect(nos).toHaveLength(5);
		expect(ultimo.id).toBe(nos[0].id);
		expect(ultimo.data).toMatchObject({ explicacao_ia: "Vale conferir as notas F1 e F2.", prioridade_ia: 1, severidade: nos[0].data.severidade, score_letalidade: nos[0].data.score_letalidade });
		const card = construirCard("ACHADO", ultimo.data);
		expect(card.motivo).toBe("Vale conferir as notas F1 e F2.");

		const comErro = await emitirCruzamentos({ ...entrada, explicar: async () => Promise.reject(new Error("429")) }, () => {});
		expect(comErro).toHaveLength(4);
	});
});
