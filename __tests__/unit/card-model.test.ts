import { describe, expect, it } from "vitest";
import { construirCard, ehCampanha, primeiro } from "@/components/nodes/card-model";
import { COR_FAMILIA, tipoDoNo, TIPOS_NO } from "@/components/nodes/node-types";
import { ICONS_10 } from "@/components/pixel/pixel-icons";

describe("node-types", () => {
	it("todo tipo aponta para um ícone existente e uma família conhecida", () => {
		for (const [nome, t] of Object.entries(TIPOS_NO)) {
			expect(t.icon in ICONS_10, `${nome}: ícone ${t.icon}`).toBe(true);
			expect(COR_FAMILIA[t.familia], nome).toBeTruthy();
		}
	});

	it("tipo desconhecido cai no padrão", () => {
		expect(tipoDoNo("XYZ").tag).toBe("Registro");
		expect(tipoDoNo(undefined).familia).toBe("pessoa");
	});

	it("famílias seguem a regra: pessoa/org/fin/doc", () => {
		expect(tipoDoNo("PESSOA").familia).toBe("pessoa");
		expect(tipoDoNo("EMPRESA").familia).toBe("org");
		expect(tipoDoNo("DESPESA").familia).toBe("fin");
		expect(tipoDoNo("PROCESSO_JUDICIAL").familia).toBe("doc");
	});
});

describe("construirCard", () => {
	it("PESSOA com patrimônio mostra valor, variação e bens", () => {
		const c = construirCard("PESSOA", {
			label: "ALICE",
			cargo: "DEPUTADO FEDERAL",
			uf: "RJ",
			nomeCivil: "Alice Ribeiro Monteiro",
			cpf: "12345678901",
			patrimonio: 1482300,
			anoPatrimonio: 2022,
			variacaoPatrimonioPercentual: 38.2,
			anoPatrimonioAnterior: 2018,
			bensDeclarados: [1, 2, 3],
		});
		expect(c.sub).toBe("DEPUTADO FEDERAL · RJ");
		expect(c.chave.label).toBe("Patrimônio declarado (2022)");
		expect(c.chave.valor).toBe("R$ 1.482.300,00");
		expect(c.chave.dica).toBe("▲ +38,2% vs 2018");
		expect(c.chave.curto).toBe("R$ 1,48 mi");
		expect(c.campos.map((f) => f.label)).toEqual(["Nome civil", "CPF", "Bens declarados"]);
		expect(c.campos[1]).toMatchObject({ value: "123.456.789-01", chip: true });
	});

	it("PESSOA sem patrimônio mostra o documento raiz ou sigilo", () => {
		expect(construirCard("PESSOA", { label: "A", cpf: "12345678901" }).chave.label).toBe("Documento raiz");
		expect(construirCard("PESSOA", { label: "A" }).chave.valor).toBe("Sigiloso / não encontrado");
	});

	it("PESSOA com patrimônio zero informa 'Não localizado'; afastamento vira motivo", () => {
		const c = construirCard("PESSOA", { label: "A", patrimonio: 0, afastamento: { motivo: "Licença médica" } });
		expect(c.chave.valor).toBe("Não localizado");
		expect(c.motivo).toBe("Licença médica");
	});

	it("DESPESA usa o fornecedor como título e calcula o risco pelo score", () => {
		const c = construirCard("DESPESA", {
			label: "x",
			nomeFornecedor: "Gráfica Horizonte",
			tipo: "Divulgação",
			valor: 48900,
			dataDocumento: "2025-03-12",
			documento: "12345678000190",
			motivo_ia: "Fornecedor recente.",
			score_letalidade: 91,
		});
		expect(c.titulo).toBe("Gráfica Horizonte");
		expect(c.risco).toBe("crit");
		expect(c.score).toBe(91);
		expect(c.chave).toMatchObject({ valor: "R$ 48.900,00", dica: "12/03/2025", curto: "R$ 49 mil" });
		expect(c.campos.find((f) => f.label === "CNPJ/CPF")?.value).toBe("12.345.678/0001-90");
		expect(c.motivo).toBe("Fornecedor recente.");
		expect(c.fonte).toBe("Câmara · CEAP");
	});

	it("DESPESA do Senado indica a fonte CEAPS", () => {
		expect(construirCard("DESPESA", { label: "x", casa: "SENADO" }).fonte).toBe("Senado · CEAPS");
	});

	it("resumo do Transferegov é só totais: sem 'ocultas no canvas' e sem medidor de execução", () => {
		const pix = construirCard("EMENDA_RESUMO", { label: "TRANSFEREGOV: EMENDAS PIX (75)", totalEmendas: 75, totalEmpenhado: 45964468 });
		expect(pix.sub).toMatch(/sem detalhe por emenda/i);
		expect(pix.medidor).toBeNull();
		expect(pix.fonte).toBe("Transferegov");
		const hub = construirCard("EMENDA_RESUMO", { label: "EMENDAS PARLAMENTARES (57)", totalEmendas: 57, totalEmpenhado: 190874588, percentualExecucao: 84 });
		expect(hub.sub).toBe("Hub · 57 emendas ocultas no canvas");
		expect(hub.medidor).toEqual({ label: "Execução global", valor: 84 });
		expect(hub.fonte).toMatch(/CGU/);
	});

	it("EMENDA fantasma tem medidor, dica e risco crítico", () => {
		const c = construirCard("EMENDA", { label: "E1", _empenhado: 2000000, percentualExecucao: 12, isFantasma: true });
		expect(c.medidor).toEqual({ label: "Execução", valor: 12 });
		expect(c.chave.dica).toBe("Fantasma: 12% executado");
		expect(c.risco).toBe("crit");
	});

	it("EMENDA_RESUMO resume o hub e muda o subtítulo ao expandir", () => {
		const base = { label: "R", totalEmendas: 41, totalEmpenhado: 14210000, percentualExecucao: 38, fantasmas: 3, alertas: ["3 sem pagamento"] };
		const c = construirCard("EMENDA_RESUMO", base);
		expect(c.titulo).toBe("41 emendas · R$ 14,21 mi");
		expect(c.sub).toBe("Hub · 41 emendas ocultas no canvas");
		expect(c.chave.dica).toBe("3 fantasma(s)");
		expect(c.motivo).toBe("3 sem pagamento");
		expect(construirCard("EMENDA_RESUMO", { ...base, isExpanded: true }).sub).toBe("Emendas exibidas no canvas");
	});

	it("EMPRESA mostra capital social quando existe, senão o CNPJ", () => {
		expect(construirCard("EMPRESA", { label: "A", cnpj: "12345678000190", capitalSocial: 5000 }).chave.label).toBe("Capital social");
		expect(construirCard("EMPRESA", { label: "A", cnpj: "12345678000190" }).chave.label).toBe("CNPJ");
	});

	it("EMPRESA de campanha não exibe motivo de IA", () => {
		expect(ehCampanha({ label: "COMITE DE CAMPANHA X" })).toBe(true);
		expect(ehCampanha({ label: "ACME", cnae: "Eleicao" })).toBe(true);
		expect(construirCard("EMPRESA", { label: "COMITE CAMPANHA", motivo_ia: "x" }).motivo).toBe("");
		expect(construirCard("EMPRESA", { label: "ACME", motivo_ia: "x" }).motivo).toBe("x");
	});

	it("CONTRATO de emenda vira 'Emenda parlamentar'; bens do TSE não têm motivo", () => {
		expect(construirCard("CONTRATO", { label: "EMENDA 1" }).tag).toBe("Emenda parlamentar");
		expect(construirCard("CONTRATO", { label: "C" }).tag).toBe("Contrato federal");
		expect(construirCard("CONTRATO", { label: "C", codigo: "TSE-BENS", motivo_ia: "x" }).motivo).toBe("");
	});

	it("PROCESSO_JUDICIAL é sempre crítico; sanção troca o rótulo", () => {
		const c = construirCard("PROCESSO_JUDICIAL", { label: "p", tribunal: "Cadastro de Inidôneos/Sancionados (CGU)", assunto: "Inidoneidade", dataAjuizamento: "2024-09-14" });
		expect(c.risco).toBe("crit");
		expect(c.tag).toBe("Sanção · CGU/TCU");
		expect(c.titulo).toBe("Inidoneidade");
		expect(c.chave.valor).toBe("14/09/2024");
	});

	it("SOCIO e SERVIDOR usam a qualificação", () => {
		expect(construirCard("SOCIO", { label: "R", cargo: "Sócio-administrador" }).chave.valor).toBe("Sócio-administrador");
		expect(construirCard("SERVIDOR", { label: "R" }).chave.valor).toBe("—");
		// a qualificação não se repete como subtítulo nem como campo
		const s = construirCard("SOCIO", { label: "R", cargo: "30-Sócio ou Acionista Menor (Assistido/Representado)" });
		expect(s.sub).toBe("");
		expect(s.campos).toHaveLength(0);
	});

	it("DIARIO_OFICIAL_NODE junta município/UF e valor", () => {
		const c = construirCard("DIARIO_OFICIAL_NODE", { label: "D", municipio: "Niterói", uf: "RJ", dataPublicacao: "2025-03-14", valor: 1000, resumo: "Extrato" });
		expect(c.chave.dica).toBe("Niterói / RJ");
		expect(c.campos.find((f) => f.label === "Valor")?.value).toBe("R$ 1.000,00");
		expect(c.motivo).toBe("Extrato");
	});

	it("RESUMO_GASTOS, ATIVIDADE e ORGAO têm modelo próprio", () => {
		expect(construirCard("RESUMO_GASTOS", { label: "R" }).chave.curto).toBe("Raio-X");
		expect(construirCard("ATIVIDADE_PARLAMENTAR", { label: "A" }).chave.curto).toBe("Atividade");
		expect(construirCard("ORGAO", { label: "O", esfera: "Municipal" }).sub).toBe("Municipal");
	});

	it("tipo desconhecido e dados ausentes não quebram", () => {
		const c = construirCard("QUALQUER", undefined);
		expect(c.titulo).toBe("Sem título");
		expect(c.risco).toBe("ok");
		expect(c.score).toBeNull();
		expect(c.campos).toEqual([]);
	});

	it("primeiro() ignora vazios e espaços", () => {
		expect(primeiro(undefined, null, "  ", "x", "y")).toBe("x");
		expect(primeiro()).toBe("");
	});
});
