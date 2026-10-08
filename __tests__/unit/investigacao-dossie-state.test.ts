import { describe, expect, it } from "vitest";
import {
	adicionarContratosPncp,
	alternarEmendas,
	aplicarEvento,
	aplicarEventos,
	aplicarNoDaBuscaReversa,
	aplicarNoDoPivoCnpj,
	contarDossie,
	descartarAviso,
	DOSSIE_VAZIO,
	type DossieNode,
	evidenciaParaCanvas,
	falhar,
	fimDoStream,
	iniciarDossie,
	interromper,
	marcarNoBuscando,
	PESSOA_PLACEHOLDER_ID,
	possivelParentesco,
} from "@/lib/investigacao/dossie-state";
import { GLIFO_RISCO, regraCritica, riscoDoNo, scoreDoNo } from "@/lib/investigacao/risco";

const ev = (tipo: string, payload: unknown) => ({ tipo, payload });
const pessoa = (id = "pessoa-1") => ({
	id,
	type: "PESSOA",
	data: { label: "ALICE", cargo: "DEPUTADO FEDERAL", nomeCivil: "Alice Ribeiro Monteiro" },
	position: { x: 0, y: 0 },
});
const despesa = (id: string, score: number) => ({
	id,
	type: "DESPESA",
	data: { label: id, valor: 100, score_letalidade: score },
	position: { x: 0, y: 0 },
});

const rodando = () => iniciarDossie({ label: "Alice", uf: "FEDERAL" });

describe("regraCritica — por que é crítico quando a nota não chega a 85", () => {
	it("emenda fantasma com nota baixa é crítica por regra", () => {
		expect(regraCritica("EMENDA", { isFantasma: true, score_letalidade: 20 })).toBe("emenda fantasma");
		expect(riscoDoNo("EMENDA", { isFantasma: true, score_letalidade: 20 })).toBe("crit");
	});

	it("outras regras têm motivo próprio", () => {
		expect(regraCritica("PROCESSO_JUDICIAL", { score_letalidade: 10 })).toMatch(/processo/);
		expect(regraCritica("DESPESA", { riscoNivel: "CRÍTICO" })).toMatch(/fonte/);
		expect(regraCritica("DESPESA", { metrics: { suspicious: true } })).toMatch(/rede/);
	});

	it("nota ≥ 85 já justifica o crítico: sem regra; nó normal também sem regra", () => {
		expect(regraCritica("EMENDA", { isFantasma: true, score_letalidade: 90 })).toBeNull();
		expect(regraCritica("DESPESA", { score_letalidade: 30 })).toBeNull();
		expect(regraCritica("DESPESA", undefined)).toBeNull();
	});
});

describe("riscoDoNo", () => {
	it("faixas por score", () => {
		expect(riscoDoNo("DESPESA", { score_letalidade: 59 })).toBe("ok");
		expect(riscoDoNo("DESPESA", { score_letalidade: 60 })).toBe("warn");
		expect(riscoDoNo("DESPESA", { score_letalidade: 84 })).toBe("warn");
		expect(riscoDoNo("DESPESA", { score_letalidade: 85 })).toBe("crit");
	});

	it("flags críticas: fantasma, processo judicial, nível da API e suspeito de grafo", () => {
		expect(riscoDoNo("EMENDA", { isFantasma: true })).toBe("crit");
		expect(riscoDoNo("EMENDA", { _isFantasma: true })).toBe("crit");
		expect(riscoDoNo("PROCESSO_JUDICIAL", {})).toBe("crit");
		expect(riscoDoNo("EMENDA", { _riscoTipo: { nivel: "CRÍTICO" } })).toBe("crit");
		expect(riscoDoNo("EMPRESA", { metrics: { suspicious: true } })).toBe("crit");
	});

	it("sem dados é ok; score aceita o campo alternativo", () => {
		expect(riscoDoNo("DESPESA", undefined)).toBe("ok");
		expect(scoreDoNo({ score: 70 })).toBe(70);
		expect(scoreDoNo(undefined)).toBe(0);
		expect(GLIFO_RISCO.crit).toBe("◆");
	});
});

describe("iniciarDossie", () => {
	it("cria o card da pessoa em carregando e o job em andamento", () => {
		const s = iniciarDossie({ label: "alice", cargo: "SENADOR", uf: "MG" });
		expect(s.status).toBe("running");
		expect(s.nodes).toHaveLength(1);
		expect(s.nodes[0].id).toBe(PESSOA_PLACEHOLDER_ID);
		expect(s.nodes[0].data).toMatchObject({ label: "ALICE", cargo: "SENADOR", isSearching: true });
	});

	it("deduz o cargo pela alçada quando não há cargo", () => {
		expect(iniciarDossie({ label: "x", uf: "FEDERAL" }).nodes[0].data.cargo).toBe("GOVERNO FEDERAL");
		expect(iniciarDossie({ label: "x", uf: "RJ" }).nodes[0].data.cargo).toBe("POLÍTICO (RJ)");
		expect(iniciarDossie({ label: "x" }).nodes[0].data.cargo).toBe("POLÍTICO");
	});
});

describe("eventos de status", () => {
	it("STATUS atualiza mensagem, log, etapas e o card em busca", () => {
		const s = aplicarEvento(rodando(), ev("STATUS", { msg: "Puxando financiadores de campanha no TSE..." }));
		expect(s.mensagem).toContain("TSE");
		expect(s.log).toHaveLength(1);
		expect(s.etapas.atual).toBe("tse");
		expect(s.nodes[0].data.currentStatus).toContain("TSE");
	});

	it("o log guarda no máximo 40 linhas", () => {
		let s = rodando();
		for (let i = 0; i < 60; i++) s = aplicarEvento(s, ev("STATUS", { msg: `linha ${i}` }));
		expect(s.log).toHaveLength(40);
		expect(s.log[39]).toBe("linha 59");
	});

	it("ERROR coloca o job em erro com a mensagem", () => {
		const s = aplicarEvento(rodando(), ev("ERROR", { mensagem: "falhou" }));
		expect(s.status).toBe("error");
		expect(s.erro).toBe("falhou");
	});

	it("ERROR sem mensagem usa o texto padrão", () => {
		expect(aplicarEvento(rodando(), ev("ERROR", {})).erro).toBe("Erro no pipeline");
	});

	it("API_WARNING é deduplicado por fonte e pode ser dispensado", () => {
		let s = aplicarEvento(rodando(), ev("API_WARNING", { fonte: "TSE", mensagem: "fora" }));
		s = aplicarEvento(s, ev("API_WARNING", { fonte: "TSE", mensagem: "fora de novo" }));
		expect(s.warnings).toHaveLength(1);
		expect(descartarAviso(s, "TSE").warnings).toHaveLength(0);
	});

	it("STATUS de 'nenhuma despesa encontrada' vira aviso visível (uma vez só)", () => {
		const msg = "Nenhuma despesa recente encontrada no portal da CAMARA para avaliação.";
		let s = aplicarEvento(rodando(), ev("STATUS", { msg }));
		s = aplicarEvento(s, ev("STATUS", { msg: "O político não possui despesas recentes elegíveis para análise." }));
		expect(s.warnings).toHaveLength(1);
		expect(s.warnings[0].fonte).toMatch(/despesas/i);
		expect(aplicarEvento(rodando(), ev("STATUS", { msg: "Carregando lote massivo de Cotas" })).warnings).toHaveLength(0);
	});

	it("CANDIDATOS_ENCONTRADOS guarda os homônimos", () => {
		const s = aplicarEvento(rodando(), ev("CANDIDATOS_ENCONTRADOS", { candidatos: [{ nome: "A", ref: "r" }] }));
		expect(s.candidatos).toHaveLength(1);
	});

	it("evento desconhecido não altera o estado", () => {
		const s = rodando();
		expect(aplicarEvento(s, ev("XYZ", {}))).toBe(s);
	});
});

describe("NODE_NOVO — roteamento", () => {
	it("PESSOA substitui o placeholder mantendo um único nó de pessoa", () => {
		const s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		expect(s.nodes.filter((n) => n.type === "PESSOA")).toHaveLength(1);
		expect(s.nodes[0].id).toBe("pessoa-1");
		expect(s.pessoaId).toBe("pessoa-1");
		expect(s.nodes[0].data.isSearching).toBe(true);
	});

	it("estrutural vai ao canvas e liga à pessoa", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emp-1", type: "EMPRESA", data: { label: "ACME" } }));
		expect(s.nodes.map((n) => n.id)).toContain("emp-1");
		expect(s.edges.find((e) => e.target === "emp-1")?.source).toBe("pessoa-1");
	});

	it("despesa com score ≥ 60 vai ao canvas com aresta de IA", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("d1", 70)));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("d2", 90)));
		expect(s.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["d1", "d2"]));
		expect(s.edges.find((e) => e.target === "d1")?.label).toBe("IA SUSPEITO");
		expect(s.edges.find((e) => e.target === "d2")?.label).toBe("ALERTA IA CRÍTICO");
	});

	it("despesa com score < 60 vai só para as evidências", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("d3", 30)));
		expect(s.evidencias.map((n) => n.id)).toEqual(["d3"]);
		expect(s.nodes.map((n) => n.id)).not.toContain("d3");
	});

	it("resumo da cota (CEAP_RESUMO, inclusive de cache antigo) não vira nó nem item da lista de despesas", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "ceap-resumo-pessoa-1", type: "CEAP_RESUMO", data: { label: "COTA PARLAMENTAR (60 NOTAS AUDITADAS)", score_letalidade: 10 } }));
		expect(s.nodes.map((n) => n.id)).not.toContain("ceap-resumo-pessoa-1");
		expect(s.evidencias).toHaveLength(0);
	});

	it("Raio-X de Gastos do vereador (RESUMO_GASTOS) continua no canvas", () => {
		// Em 08/10/2026 a limpeza do nó agregador de cotas passou a descartar todo RESUMO_GASTOS.
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "dashboard-cota-cmrj-1", type: "RESUMO_GASTOS", _origemId: "pessoa-1", data: { label: "Raio-X de Gastos", nomeVereador: "Fulano", score_letalidade: 0 } }));
		expect(s.nodes.map((n) => n.id)).toContain("dashboard-cota-cmrj-1");
		expect(s.edges.find((e) => e.target === "dashboard-cota-cmrj-1")?.source).toBe("pessoa-1");
	});

	it("o mesmo id mescla os dados em vez de duplicar", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emp-1", type: "EMPRESA", data: { label: "A" } }));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emp-1", type: "EMPRESA", data: { situacao: "ATIVA" } }));
		const emp = s.nodes.filter((n) => n.id === "emp-1");
		expect(emp).toHaveLength(1);
		expect(emp[0].data).toMatchObject({ label: "A", situacao: "ATIVA" });
	});

	it("descarta nós legados de bens vindos de cache antigo", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		const antes = s;
		for (const lixo of [
			{ id: "x1", type: "CONTRATO", data: { label: "BEM DECLARADO: casa" } },
			{ id: "x2", type: "CONTRATO", data: { codigo: "TSE-BENS" } },
			{ id: "bens-1", type: "CONTRATO", data: { label: "a" } },
			{ id: "bem-2", type: "CONTRATO", data: { label: "a" } },
			{ id: "x3", type: "CONTRATO", data: { label: "Patrimônio Declarado (TSE)" } },
			{ id: "x4", type: "CONTRATO", data: { objeto: "Total de Bens: 1" } },
		]) {
			s = aplicarEvento(s, ev("NODE_NOVO", lixo));
		}
		expect(s).toEqual(antes);
	});

	it("emendas individuais ficam ocultas e ligadas ao hub; o toggle as revela", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "hub", type: "EMENDA_RESUMO", data: { label: "Resumo" } }));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emenda-1", type: "EMENDA", data: { label: "E1" } }));
		const e1 = s.nodes.find((n) => n.id === "emenda-1");
		expect(e1?.hidden).toBe(true);
		expect(s.edges.find((e) => e.target === "emenda-1")?.source).toBe("hub");

		s = alternarEmendas(s, "hub");
		expect(s.nodes.find((n) => n.id === "emenda-1")?.hidden).toBe(false);
		expect(s.nodes.find((n) => n.id === "hub")?.data.isExpanded).toBe(true);
		expect(s.edges.find((e) => e.target === "emenda-1")?.hidden).toBe(false);

		s = alternarEmendas(s, "hub");
		expect(s.nodes.find((n) => n.id === "emenda-1")?.hidden).toBe(true);
	});

	it("o resumo do Transferegov não rouba as emendas do hub de emendas parlamentares", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emenda-resumo-pessoa-1", type: "EMENDA_RESUMO", data: { label: "EMENDAS PARLAMENTARES (57)" } }));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "transferegov-pessoa-1", type: "EMENDA_RESUMO", data: { label: "TRANSFEREGOV: EMENDAS PIX (75)" } }));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emenda-1", type: "EMENDA", data: { label: "E1" } }));
		expect(s.edges.find((e) => e.target === "emenda-1")?.source).toBe("emenda-resumo-pessoa-1");
	});

	it("expandir um hub sem emendas filhas não solta emendas na coluna da pessoa", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emenda-resumo-pessoa-1", type: "EMENDA_RESUMO", data: { label: "EMENDAS PARLAMENTARES (1)" } }));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "transferegov-pessoa-1", type: "EMENDA_RESUMO", data: { label: "TRANSFEREGOV: EMENDAS PIX (75)" } }));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emenda-1", type: "EMENDA", data: { label: "E1" } }));
		const depois = alternarEmendas(s, "transferegov-pessoa-1");
		expect(depois).toBe(s); // nada muda: o Transferegov não tem filhas
		expect(depois.nodes.find((n) => n.id === "emenda-1")?.hidden).toBe(true);
	});

	it("alternarEmendas com hub inexistente não muda nada", () => {
		const s = rodando();
		expect(alternarEmendas(s, "nao-existe")).toBe(s);
	});
});

describe("outros eventos", () => {
	it("ADD_ALERT acrescenta o alerta ao nó da pessoa", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("ADD_ALERT", { msg: "Afastamento" }));
		s = aplicarEvento(s, ev("ADD_ALERT", { msg: "Outro" }));
		expect(s.nodes[0].data.alertas).toEqual(["Afastamento", "Outro"]);
	});

	it("GRAPH_ANALYSIS_SCORES injeta métricas e conta os suspeitos", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("d3", 30)));
		s = aplicarEvento(s, ev("GRAPH_ANALYSIS_SCORES", { "pessoa-1": { suspicious: true }, d3: { suspicious: false } }));
		expect(s.suspeitosGrafo).toBe(1);
		expect(s.nodes[0].data.metrics).toEqual({ suspicious: true });
		expect(s.evidencias[0].data.metrics).toEqual({ suspicious: false });
	});

	it("EDGE_NOVA (replay de cache) adiciona uma vez e ignora incompletas", () => {
		let s = aplicarEvento(rodando(), ev("EDGE_NOVA", { id: "e1", source: "a", target: "b" }));
		s = aplicarEvento(s, ev("EDGE_NOVA", { id: "e1", source: "a", target: "b" }));
		s = aplicarEvento(s, ev("EDGE_NOVA", { id: "e2" }));
		expect(s.edges).toHaveLength(1);
	});

	it("DONE conclui o job, desliga a busca nos nós e marca as etapas", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("DONE", { msg: "Dossiê finalizado" }));
		expect(s.status).toBe("done");
		expect(s.nodes[0].data.isSearching).toBe(false);
		expect(s.etapas.concluida).toBe(true);
		expect(s.mensagem).toBe("Dossiê finalizado");
	});

	it("DONE depois de um ERROR mantém o estado de erro", () => {
		let s = aplicarEvento(rodando(), ev("ERROR", { mensagem: "x" }));
		s = aplicarEvento(s, ev("DONE", {}));
		expect(s.status).toBe("error");
	});

	it("aplicarEventos aplica em sequência", () => {
		const s = aplicarEventos(rodando(), [ev("NODE_NOVO", pessoa()), ev("NODE_NOVO", despesa("d1", 70))]);
		expect(s.nodes).toHaveLength(2);
	});
});

describe("ciclo de vida", () => {
	it("fimDoStream conclui um job que ainda estava rodando", () => {
		expect(fimDoStream(rodando()).status).toBe("done");
	});

	it("fimDoStream preserva erro e parcial", () => {
		expect(fimDoStream(falhar(rodando(), "x")).status).toBe("error");
		expect(fimDoStream(interromper(rodando())).status).toBe("partial");
	});

	it("interromper deixa o dossiê parcial e desliga o loading", () => {
		const s = interromper(aplicarEvento(rodando(), ev("NODE_NOVO", pessoa())));
		expect(s.status).toBe("partial");
		expect(s.nodes[0].data.isSearching).toBe(false);
	});

	it("falhar registra a mensagem", () => {
		const s = falhar(rodando(), "rede caiu");
		expect(s.status).toBe("error");
		expect(s.erro).toBe("rede caiu");
	});

	it("marcarNoBuscando liga e desliga o loading de um nó", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emp-1", type: "EMPRESA", data: { label: "A" } }));
		s = marcarNoBuscando(s, "emp-1", true, "Pivoteando");
		expect(s.nodes.find((n) => n.id === "emp-1")?.data).toMatchObject({ isSearching: true, currentStatus: "Pivoteando" });
		s = marcarNoBuscando(s, "emp-1", false);
		expect(s.nodes.find((n) => n.id === "emp-1")?.data.isSearching).toBe(false);
	});
});

describe("evidenciaParaCanvas", () => {
	it("move a despesa do rail para o canvas ligando à pessoa", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("d3", 30)));
		s = evidenciaParaCanvas(s, "d3");
		expect(s.evidencias).toHaveLength(0);
		expect(s.nodes.map((n) => n.id)).toContain("d3");
		expect(s.edges.find((e) => e.target === "d3")?.label).toBe("EVIDÊNCIA (30/100)");
	});

	it("não duplica e ignora ids inexistentes", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("d3", 30)));
		const a = evidenciaParaCanvas(s, "nao-existe");
		expect(a).toBe(s);
		const b = evidenciaParaCanvas(evidenciaParaCanvas(s, "d3"), "d3");
		expect(b.nodes.filter((n) => n.id === "d3")).toHaveLength(1);
	});
});

describe("pivôs", () => {
	const base = () => aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));

	it("possivelParentesco: sobrenome raro igual alerta; comum ou curto não", () => {
		expect(possivelParentesco("Alice Monteiro Barbosa", "Rui Barbosa")).toBe(true);
		expect(possivelParentesco("Alice Silva", "Rui Silva")).toBe(false);
		expect(possivelParentesco("Alice Paz", "Rui Paz")).toBe(false);
		expect(possivelParentesco(undefined, "Rui Barbosa")).toBe(false);
	});

	it("pivô por CNPJ liga o sócio com o rótulo SÓCIO (QSA)", () => {
		const s = aplicarNoDoPivoCnpj(base(), { id: "s1", type: "SOCIO", data: { label: "Rui Teixeira", _origemId: "emp-1" } } as DossieNode);
		expect(s.edges.find((e) => e.target === "s1")?.label).toBe("SÓCIO (QSA)");
	});

	it("pivô por CNPJ sinaliza possível parentesco com a pessoa investigada", () => {
		const s0 = aplicarEvento(rodando(), ev("NODE_NOVO", { ...pessoa(), data: { label: "A", nomeCivil: "Alice Monteiro Barbosa" } }));
		const s = aplicarNoDoPivoCnpj(s0, { id: "s1", type: "SOCIO", data: { label: "Rui Barbosa", _origemId: "emp-1" } } as DossieNode);
		expect(s.edges.find((e) => e.target === "s1")?.label).toBe("ALERTA: POSSÍVEL PARENTESCO");
	});

	it("o próprio investigado no QSA não vira 'possível parentesco' com ele mesmo", () => {
		const s0 = aplicarEvento(rodando(), ev("NODE_NOVO", { ...pessoa(), data: { label: "Flávio Bolsonaro", nomeCivil: "FLAVIO NANTES BOLSONARO" } }));
		const s = aplicarNoDoPivoCnpj(s0, { id: "s1", type: "SOCIO", data: { label: "FLÁVIO NANTES BOLSONARO", _origemId: "emp-1" } } as DossieNode);
		expect(s.edges.find((e) => e.target === "s1")?.label).toBe("SÓCIO (QSA): O PRÓPRIO INVESTIGADO");
	});

	it("drilldown da empresa declarada atualiza o próprio nó (mesmo id), sem aresta para si mesmo", () => {
		const s0 = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		const s1 = aplicarEvento(s0, ev("NODE_NOVO", { id: "empresa-tse-pessoa-1-2018-0", type: "EMPRESA", data: { label: "Bolsotini", motivo_ia: "declarada" } }));
		const s = aplicarNoDoPivoCnpj(s1, { id: "empresa-tse-pessoa-1-2018-0", type: "EMPRESA", data: { label: "BOLSOTINI LTDA", cnpj: "21.636.316/0001-44", _origemId: "empresa-tse-pessoa-1-2018-0" } } as DossieNode);
		const no = s.nodes.filter((n) => n.id === "empresa-tse-pessoa-1-2018-0");
		expect(no).toHaveLength(1);
		expect(no[0].data).toMatchObject({ cnpj: "21.636.316/0001-44", motivo_ia: "declarada" });
		expect(s.edges.some((e) => e.source === e.target)).toBe(false);
	});

	it("pivô por CNPJ de outro tipo vira FORNECEDOR", () => {
		const s = aplicarNoDoPivoCnpj(base(), { id: "c1", type: "CONTRATO", data: { label: "c", _origemId: "emp-1" } } as DossieNode);
		expect(s.edges.find((e) => e.target === "c1")?.label).toBe("FORNECEDOR");
	});

	it("busca reversa adiciona a empresa nova com aresta PARTICIPAÇÃO", () => {
		const r = aplicarNoDaBuscaReversa(base(), { id: "emp-9", type: "EMPRESA", data: { cnpj: "12.345.678/0001-90", _origemId: "s1" } } as DossieNode);
		expect(r.duplicada).toBe(false);
		expect(r.ehEmpresa).toBe(true);
		expect(r.estado.nodes.map((n) => n.id)).toContain("emp-9");
		expect(r.estado.edges.find((e) => e.target === "emp-9")?.label).toBe("PARTICIPAÇÃO");
	});

	it("busca reversa não duplica empresa já no painel: só liga a aresta ao existente", () => {
		let s = base();
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "emp-1", type: "EMPRESA", data: { cnpj: "12345678000190" } }));
		const r = aplicarNoDaBuscaReversa(s, { id: "emp-novo", type: "EMPRESA", data: { cnpj: "12.345.678/0001-90", _origemId: "s1" } } as DossieNode);
		expect(r.duplicada).toBe(true);
		expect(r.estado.nodes.filter((n) => n.type === "EMPRESA")).toHaveLength(1);
		expect(r.estado.edges.find((e) => e.label === "PARTICIPAÇÃO")?.target).toBe("emp-1");
	});

	it("contratos do PNCP viram nós CONTRATO com a análise de IA", () => {
		const s = adicionarContratosPncp(
			base(),
			"emp-1",
			[{ numeroControlePNCP: "123", objetoContrato: "Obra", valorInicial: 10, orgaoEntidade: { razaoSocial: "Prefeitura" } }],
			{ contratos_avaliados: [{ numeroControlePNCP: "123", score_letalidade: 75, motivo_ia: "Valor alto" }], score_letalidade_geral: 20 },
		);
		const c = s.nodes.find((n) => n.id === "pncp-123");
		expect(c?.data).toMatchObject({ score_letalidade: 75, motivo_ia: "Valor alto", nomeFornecedor: "Prefeitura" });
		expect(s.edges.find((e) => e.target === "pncp-123")?.label).toBe("CONTRATO PÚBLICO");
	});

	it("contrato sem avaliação herda o score geral (ou 20)", () => {
		const s = adicionarContratosPncp(base(), "emp-1", [{ numeroControlePNCP: "9" }], { score_letalidade_geral: 70 });
		expect(s.nodes.find((n) => n.id === "pncp-9")?.data).toMatchObject({
			score_letalidade: 70,
			motivo_ia: "Risco sistêmico identificado no lote.",
		});
		const s2 = adicionarContratosPncp(base(), "emp-1", [{ numeroControlePNCP: "8" }]);
		expect(s2.nodes.find((n) => n.id === "pncp-8")?.data.score_letalidade).toBe(20);
	});
});

describe("contarDossie", () => {
	it("conta nós, críticos e atenção (inclui evidências, exclui a pessoa)", () => {
		let s = aplicarEvento(rodando(), ev("NODE_NOVO", pessoa()));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("a", 90)));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("b", 70)));
		s = aplicarEvento(s, ev("NODE_NOVO", despesa("c", 10)));
		s = aplicarEvento(s, ev("NODE_NOVO", { id: "p", type: "PROCESSO_JUDICIAL", data: { label: "p" } }));
		expect(contarDossie(s)).toEqual({ nos: 4, criticos: 2, atencao: 1 });
	});

	it("estado vazio zera tudo", () => {
		expect(contarDossie(DOSSIE_VAZIO)).toEqual({ nos: 0, criticos: 0, atencao: 0 });
	});
});
