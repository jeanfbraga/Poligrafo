import { afterEach, describe, expect, it, vi } from "vitest";
import { citacaoNoDiarioMunicipal, citacaoNoDou } from "../../src/app/api/investigar/scrapers/osint-societario";
import { achadoParaNo, emitirCruzamentos } from "../../src/services/cruzamentos";
import {
	alvoDoGabinete,
	type DadosGabinete,
	type EleitoHomonimo,
	fatosDoGabinete,
	mandatoDoEleito,
	nomesParaConferirNoTse,
	pessoasDoGabinete,
} from "../../src/services/cruzamentos/gabinete";
import { executarCruzamentos } from "../../src/services/cruzamentos/motor";
import { fatosDeSocios } from "../../src/services/cruzamentos/socios";
import type { Fato, Papel } from "../../src/services/cruzamentos/tipos";
import { type ConsultasGabinete, carregarGabinete } from "../../src/services/integrations/gabinete/pessoal";

const AGORA = "2026-10-08T12:00:00.000Z";
const CPF = "52998224725";
const CPF_2 = "11144477735";
const FORNECEDOR = "11222333000181";

function doador(cpf: string, nome: string, ano = "2022"): Fato {
	return { id: `fato-doador-${cpf}`, papel: "DOADOR", documento: cpf, nome, valor: 2600, data: ano, procedencia: { fonte: "TSE — prestação de contas 2022 (receitas)", chave: "sq_candidato=1", coletadoEm: AGORA } };
}

function eleito(extra: Partial<EleitoHomonimo> = {}): EleitoHomonimo {
	return { sq: "130001234567", cpf: null, nome: "JOÃO BATISTA FERREIRA", cargo: "VEREADOR", ano: 2024, municipio: "CAMPOS GERAIS", uf: "MG", situacao: "ELEITO POR QP", ...extra };
}

function gabinete(extra: Partial<DadosGabinete> = {}): DadosGabinete {
	return {
		alvo: { casa: "CAMARA", id: 160518, nome: "DEPUTADO X", uf: "MG" },
		fonte: "Câmara dos Deputados — pessoal do gabinete",
		url: "https://www.camara.leg.br/deputados/160518/pessoal-gabinete",
		assessores: [
			{ nome: "Maria Aparecida dos Santos", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 01/02/2023 a 17/02/2026" },
			{ nome: "MARIA APARECIDA DOS SANTOS", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 18/02/2026" },
			{ nome: "João Batista Ferreira", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 06/05/2026" },
			{ nome: "RODRIGO DE SOUZA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 03/03/2026" },
		],
		eleitos: [],
		gabinetesPorNome: {},
		...extra,
	};
}

function regrasDe(fatos: Fato[]) {
	return executarCruzamentos(fatos).map((a) => [a.regra, a.severidade]);
}

describe("gabinete: quem pode ter a lista de funcionários", () => {
	it("deputado federal (id da Câmara) e vereador do Rio; as outras casas não publicam", () => {
		expect(alvoDoGabinete({ casa: "CAMARA", id: "160518", nome: "Fulano", uf: "mg" })).toEqual({ casa: "CAMARA", id: 160518, nome: "Fulano", uf: "MG" });
		expect(alvoDoGabinete({ casa: "CAMARA_MUNICIPAL_RJ", id: "x", nome: "Carlo Caiado" })).toEqual({ casa: "CAMARA_MUNICIPAL_RJ", nome: "Carlo Caiado", uf: "RJ" });
		expect(alvoDoGabinete({ casa: "CAMARA", nome: "Sem id" })).toBeNull();
		expect(alvoDoGabinete({ casa: "SENADO", id: 1, nome: "X" })).toBeNull();
		expect(alvoDoGabinete({ casa: "ASSEMBLEIA_LEGISLATIVA", nome: "Wanderson Florencio", uf: "pe" })).toEqual({ casa: "ALEPE", nome: "Wanderson Florencio", uf: "PE" });
		expect(alvoDoGabinete({ casa: "ASSEMBLEIA_LEGISLATIVA", nome: "Fulano", uf: "BA" })).toBeNull();
		expect(alvoDoGabinete(null)).toBeNull();
	});

	it("junta os períodos da mesma pessoa (vínculo em aberto = fim nulo) e só manda ao TSE nome com 3+ palavras próprias", () => {
		const [maria] = pessoasDoGabinete(gabinete().assessores);
		expect(maria).toMatchObject({ chave: "MARIA APARECIDA DOS SANTOS", inicio: "2023-02-01", fim: null });
		expect(maria.vinculos).toHaveLength(2);
		expect(nomesParaConferirNoTse(gabinete().assessores)).toEqual(["MARIA APARECIDA DOS SANTOS", "JOAO BATISTA FERREIRA"]);
	});
});

describe("assessor que doou para a campanha do próprio chefe", () => {
	it("vira achado MÉDIO no CPF do doador, com o CPF mascarado e a nota de quando ele entrou no gabinete", () => {
		const fatos = [doador(CPF, "MARIA APARECIDA DOS SANTOS")];
		const novos = fatosDoGabinete(gabinete(), fatos, AGORA);
		expect(novos).toEqual([expect.objectContaining({ papel: "ASSESSOR_DO_GABINETE", documento: CPF, detalhe: "SECRETÁRIO PARLAMENTAR, Desde 18/02/2026 (e mais 1 período(s))" })]);
		const [achado] = executarCruzamentos([...fatos, ...novos]);
		expect(achado).toMatchObject({ regra: "assessor-doador", severidade: "MEDIA" });
		expect(achado.resumo).toContain("***.982.247-**");
		expect(achado.resumo).not.toContain(CPF);
		expect(achado.resumo).toContain("Entrou no gabinete depois da eleição em que doou.");
		const no = achadoParaNo(achado, [...fatos, ...novos], "pessoa-1");
		expect(no.id).toBe("achado-assessor-doador-cpf982247");
		expect(no.data.fatos.map((x) => x.url)).toContain("https://www.camara.leg.br/deputados/160518/pessoal-gabinete");
	});

	it("diz se já trabalhava no gabinete na eleição; nome com dois CPFs entre os doadores fica de fora", () => {
		const antigo = gabinete({ assessores: [{ nome: "Maria Aparecida dos Santos", cargo: "SP", periodo: "De 05/02/2019 a 17/02/2026" }] });
		const fatos = [doador(CPF, "MARIA APARECIDA DOS SANTOS")];
		expect(executarCruzamentos([...fatos, ...fatosDoGabinete(antigo, fatos, AGORA)])[0].resumo).toContain("Trabalhava no gabinete na época da eleição em que doou.");
		const ambiguo = [doador(CPF, "MARIA APARECIDA DOS SANTOS"), doador(CPF_2, "Maria Aparecida dos Santos")];
		expect(fatosDoGabinete(gabinete(), ambiguo, AGORA)).toEqual([]);
	});
});

describe("assessor com mandato eletivo no mesmo período (funcionário fantasma?)", () => {
	const comEleito = (e: Partial<EleitoHomonimo> = {}, porNome: Record<string, number> = { "JOAO BATISTA FERREIRA": 1 }) =>
		gabinete({ eleitos: [eleito(e)], gabinetesPorNome: porNome });

	it("vereador: BAIXA, no nº do TSE (2024 não tem CPF), com a regra do art. 38, III e o aviso de confirmar", () => {
		const fatos = fatosDoGabinete(comEleito(), [], AGORA);
		expect(fatos.map((f) => [f.papel, f.documento])).toEqual([["ASSESSOR_DO_GABINETE", "SQ-130001234567"], ["MANDATO_ELETIVO", "SQ-130001234567"]]);
		expect(fatos[1].detalhe).toBe("Vereador eleito em 2024 — CAMPOS GERAIS/MG (mandato 2025–2028)");
		const [achado] = executarCruzamentos(fatos);
		expect(achado).toMatchObject({ regra: "assessor-com-mandato", severidade: "BAIXA", documento: "SQ-130001234567" });
		expect(achado.resumo).toContain("candidato nº 130001234567 no TSE");
		expect(achado.resumo).toContain("art. 38, III");
		expect(achado.resumo).toContain("Confira se é a mesma pessoa.");
		expect(achadoParaNo(achado, fatos, "p").data.documento).toBe("candidato nº 130001234567 no TSE");
	});

	it("prefeito ou deputado estadual (com CPF em 2022) sobe para MÉDIA", () => {
		expect(regrasDe(fatosDoGabinete(comEleito({ cargo: "PREFEITO" }), [], AGORA))).toEqual([["assessor-com-mandato", "MEDIA"]]);
		const estadual = fatosDoGabinete(comEleito({ cargo: "DEPUTADO ESTADUAL", ano: 2022, cpf: CPF, municipio: "MINAS GERAIS" }), [], AGORA);
		expect(estadual[1]).toMatchObject({ documento: CPF, detalhe: "Deputado estadual eleito em 2022 — MG (mandato 2023–2027)" });
		expect(regrasDe(estadual)).toEqual([["assessor-com-mandato", "MEDIA"]]);
	});

	it("filtros de homônimo: nome curto, nome em vários gabinetes, dois eleitos, suplente, mandato fora do período", () => {
		const souza = gabinete({ eleitos: [eleito({ nome: "RODRIGO DE SOUZA", cargo: "PREFEITO" })], gabinetesPorNome: { "RODRIGO DE SOUZA": 1 } });
		expect(fatosDoGabinete(souza, [], AGORA)).toEqual([]);
		expect(fatosDoGabinete(comEleito({}, { "JOAO BATISTA FERREIRA": 3 }), [], AGORA)).toEqual([]);
		expect(fatosDoGabinete(comEleito({}, {}), [], AGORA)).toEqual([]);
		const dois = gabinete({ eleitos: [eleito(), eleito({ sq: "130009999999", municipio: "OUTRA" })], gabinetesPorNome: { "JOAO BATISTA FERREIRA": 1 } });
		expect(fatosDoGabinete(dois, [], AGORA)).toEqual([]);
		expect(fatosDoGabinete(comEleito({ situacao: "SUPLENTE" }), [], AGORA)).toEqual([]);
		const antes = gabinete({
			assessores: [{ nome: "João Batista Ferreira", cargo: "SP", periodo: "De 01/02/2023 a 30/06/2024" }],
			eleitos: [eleito()],
			gabinetesPorNome: { "JOAO BATISTA FERREIRA": 1 },
		});
		expect(fatosDoGabinete(antes, [], AGORA)).toEqual([]);
		expect(mandatoDoEleito({ ano: 2024 })).toEqual({ inicio: "2025-01-01", fim: "2028-12-31" });
	});
});

describe("empresa de assessor paga pelo mandato (QSA)", () => {
	const qsa = async () => ({ razao_social: "GRAFICA EXEMPLO LTDA", qsa: [{ nome_socio: "ANA PAULA RIBEIRO COSTA", cnpj_cpf_do_socio: "***123456**" }, { nome_socio: "ANA COSTA", cnpj_cpf_do_socio: "***654321**" }] });
	const pessoas = pessoasDoGabinete([
		{ nome: "Ana Paula Ribeiro Costa", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 01/03/2023 a 31/12/2024" },
		{ nome: "Ana Costa", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 01/01/2025" },
	]);
	const cota = (data: string): Fato => ({ id: `fato-cota-${data}`, papel: "FORNECEDOR_COTA" as Papel, documento: FORNECEDOR, nome: "GRAFICA EXEMPLO", valor: 5000, data, procedencia: { fonte: "CEAP", chave: "x", coletadoEm: AGORA } });

	it("pagamento durante o vínculo: ALTA; fora do período: MÉDIA; nome de 2 palavras não conta", async () => {
		const durante = [cota("2024-05-10")];
		const novos = await fatosDeSocios(durante, null, AGORA, qsa, 10, pessoas);
		expect(novos).toEqual([expect.objectContaining({ papel: "EMPRESA_DE_ASSESSOR", documento: FORNECEDOR, periodo: { inicio: "2023-03-01", fim: "2024-12-31" } })]);
		expect(novos[0].detalhe).toContain("sócio Ana Paula Ribeiro Costa tem o nome completo de funcionário do gabinete");
		const [achado] = executarCruzamentos([...durante, ...novos]);
		expect(achado).toMatchObject({ regra: "assessor-empresa-cota", severidade: "ALTA" });
		expect(achado.resumo).toContain("Houve pagamento enquanto o sócio trabalhava no gabinete.");
		const depois = [cota("2025-08-01")];
		expect(regrasDe([...depois, ...(await fatosDeSocios(depois, null, AGORA, qsa, 10, pessoas))])).toEqual([["assessor-empresa-cota", "MEDIA"]]);
	});
});

describe("carregarGabinete (bancos injetados)", () => {
	afterEach(() => vi.restoreAllMocks());

	function consultas(extra: Partial<ConsultasGabinete> = {}): ConsultasGabinete {
		return {
			gabineteCamara: vi.fn(async () => [
				{ nome: "João Batista Ferreira", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 06/05/2026" },
				{ nome: "RODRIGO DE SOUZA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 03/03/2026" },
			]),
			gabinetesCmrj: vi.fn(async () => [{ nome_urna: "Carlo Caiado", gabinete_numero: "Gabinete Parlamentar Nº 02" }, { nome_urna: "Átila Nunes", gabinete_numero: "Gabinete Parlamentar Nº 01" }]),
			servidoresCmrj: vi.fn(async () => [{ nome: "FULANA DE TAL SOUZA", cargo: "ASSISTENTE I", data_ingresso: "01/01/2025" }]),
			eleitosPorNomes: vi.fn(async () => [
				{ sq_candidato: "130001234567", nr_cpf_candidato: null, nm_candidato: "JOÃO BATISTA FERREIRA", ds_cargo: "VEREADOR", ano_eleicao: 2024, nm_ue: "CAMPOS GERAIS", sg_uf: "MG", ds_sit_tot_turno: "ELEITO" },
				{ sq_candidato: "130007654321", nr_cpf_candidato: null, nm_candidato: "JOÃO BATISTA FERREIRA NETO", ds_cargo: "VEREADOR", ano_eleicao: 2024, nm_ue: "OUTRA", sg_uf: "MG", ds_sit_tot_turno: "ELEITO" },
			]),
			gabinetesPorNomes: vi.fn(async () => [{ nome: "João Batista Ferreira", gabinete: "160518" }]),
			servidoresAlepe: vi.fn(async () => [
				{ NOME: "ABRAAO SANTOS SILVA", NOME_LOTACAO: "GAB.DEP. WANDERSON FLORENCIO", CARGO_EFETIVO: "Assessor Especial", VINCULO: "Comissionado", DATA_ADMISSAO: { date: "2026-05-05 00:00:00.000000" } },
				{ NOME: "MARIA DA PENHA LIMA", NOME_LOTACAO: "GAB.DEP. WANDERSON FLORENCIO", CARGO_EFETIVO: "", CARGO_NIVEL: "", VINCULO: "À Disposição", DATA_ADMISSAO: null },
				{ NOME: "OUTRA PESSOA QUALQUER", NOME_LOTACAO: "GAB.DEP. IZAIAS REGIS", CARGO_EFETIVO: "Assessor", VINCULO: "Comissionado", DATA_ADMISSAO: { date: "2023-02-01 00:00:00.000000" } },
				{ NOME: "SERVIDOR DA MESA", NOME_LOTACAO: "1ª Secretaria", CARGO_EFETIVO: "Analista", VINCULO: "Efetivo", DATA_ADMISSAO: null },
			]),
			...extra,
		};
	}

	it("ALEPE: acha o gabinete pelo nome parlamentar na lotação 'GAB.DEP.'; admissão vira 'Desde'; sem gabinete, avisa no log", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const c = consultas({ eleitosPorNomes: vi.fn(async () => []) });
		const d = await carregarGabinete({ casa: "ALEPE", nome: "WANDERSON FLORENCIO DE OLIVEIRA (WANDERSON FLORENCIO)", uf: "PE" }, c);
		expect(d).toMatchObject({
			fonte: "ALEPE — servidores do GAB.DEP. WANDERSON FLORENCIO",
			url: "https://dadosabertos.alepe.pe.gov.br/api/v1/servidores",
			assessores: [
				{ nome: "ABRAAO SANTOS SILVA", cargo: "Assessor Especial", periodo: "Desde 05/05/2026" },
				{ nome: "MARIA DA PENHA LIMA", cargo: "À Disposição", periodo: "" },
			],
		});
		expect(c.eleitosPorNomes).toHaveBeenCalledWith(["ABRAAO SANTOS SILVA", "MARIA DA PENHA LIMA"], "PE");
		expect(await carregarGabinete({ casa: "ALEPE", nome: "NINGUEM DESSA CASA", uf: "PE" }, c)).toBeNull();
		expect(aviso).toHaveBeenCalledWith('[GABINETE] Gabinete da ALEPE não encontrado para "NINGUEM DESSA CASA" (2 gabinetes na API).');
	});

	it("Câmara: só nomes distintivos vão ao TSE; o prefixo ('... NETO') é descartado; conta os gabinetes do nome que bateu", async () => {
		const c = consultas();
		const d = await carregarGabinete({ casa: "CAMARA", id: 160518, nome: "X", uf: "MG" }, c);
		expect(c.eleitosPorNomes).toHaveBeenCalledWith(["JOAO BATISTA FERREIRA"], "MG");
		expect(c.gabinetesPorNomes).toHaveBeenCalledWith("CAMARA", ["João Batista Ferreira"]);
		expect(d?.eleitos.map((e) => e.sq)).toEqual(["130001234567"]);
		expect(d?.gabinetesPorNome).toEqual({ "JOAO BATISTA FERREIRA": 1 });
		expect(d?.url).toBe("https://www.camara.leg.br/deputados/160518/pessoal-gabinete");
	});

	it("CMRJ: acha o gabinete pelo nome de urna e lê a lotação; sem gabinete, avisa no log", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const c = consultas({ eleitosPorNomes: vi.fn(async () => []) });
		const d = await carregarGabinete({ casa: "CAMARA_MUNICIPAL_RJ", nome: "CARLO CAIADO", uf: "RJ" }, c);
		expect(c.servidoresCmrj).toHaveBeenCalledWith("Gabinete Parlamentar Nº 02");
		expect(d).toMatchObject({ fonte: "Câmara Municipal do Rio — servidores do Gabinete Parlamentar Nº 02", assessores: [{ nome: "FULANA DE TAL SOUZA", periodo: "Desde 01/01/2025" }] });
		expect(c.gabinetesPorNomes).not.toHaveBeenCalled();
		expect(await carregarGabinete({ casa: "CAMARA_MUNICIPAL_RJ", nome: "NINGUEM CONHECIDO", uf: "RJ" }, c)).toBeNull();
		expect(aviso).toHaveBeenCalledWith('[GABINETE] Gabinete da CMRJ não encontrado para "NINGUEM CONHECIDO" (cmrj_vereador_gabinete).');
	});

	it("falhas viram aviso no log: base fora do ar = null; TSE fora do ar = gabinete sem eleitos; gabinete vazio = null", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const alvo = { casa: "CAMARA" as const, id: 1, nome: "X", uf: "MG" };
		expect(await carregarGabinete(alvo, consultas({ gabineteCamara: vi.fn(async () => { throw new Error("timeout"); }) }))).toBeNull();
		expect(aviso).toHaveBeenCalledWith("[GABINETE] Base indisponível (timeout); seguindo sem os cruzamentos de assessor.");
		const semTse = await carregarGabinete(alvo, consultas({ eleitosPorNomes: vi.fn(async () => { throw new Error("503"); }) }));
		expect(semTse).toMatchObject({ eleitos: [], gabinetesPorNome: {} });
		expect(semTse?.assessores).toHaveLength(2);
		expect(aviso).toHaveBeenCalledWith("[GABINETE] Eleitos do TSE indisponíveis (503); seguindo sem o cruzamento de mandato.");
		expect(await carregarGabinete(alvo, consultas({ gabineteCamara: vi.fn(async () => []) }))).toBeNull();
		expect(aviso).toHaveBeenCalledWith("[GABINETE] Nenhum funcionário do gabinete do deputado 1 na base (camara_servidores_gabinete).");
	});
});

describe("emitirCruzamentos com o gabinete", () => {
	const contas = {
		doadores: [{ sq_candidato: "1", ano_eleicao: 2022, tipo: "DOADOR" as const, documento: CPF, nome: "MARIA APARECIDA DOS SANTOS", valor_total: 2600, quantidade: 1, origem: "Recursos de pessoas físicas" }],
		fornecedores: [],
	};
	const base = {
		pessoaId: "pessoa-1", casa: "CAMARA", doadores: [], empresasDoPolitico: [], despesasMandato: [], nos: [], sqCandidato: "1",
		agora: () => new Date(AGORA),
		buscarContas: async () => contas,
		buscarSancoes: async () => [], buscarQsa: async () => null, buscarFuncoes: async () => [],
		explicar: async () => [],
	};

	it("registra no log quantas pessoas do gabinete foram conferidas e emite o achado", async () => {
		const eventos: { tipo: string; payload: any }[] = [];
		const carregar = vi.fn(async () => gabinete());
		await emitirCruzamentos({ ...base, gabinete: { casa: "CAMARA", id: 160518, nome: "X", uf: "MG" }, carregarGabinete: carregar }, (tipo, payload) => eventos.push({ tipo, payload }));
		const status = eventos.filter((e) => e.tipo === "STATUS").map((e) => e.payload.msg);
		expect(status).toContain("[GABINETE] 3 pessoa(s) do gabinete (Câmara dos Deputados — pessoal do gabinete) conferidas com os doadores da campanha, os sócios dos fornecedores e os eleitos da UF.");
		expect(status.at(-1)).toMatch(/^\[CRUZAMENTO\] 1 cruzamento\(s\) entre \d+ fatos verificados\.$/);
		const achados = eventos.filter((e) => e.tipo === "NODE_NOVO" && e.payload.type === "ACHADO");
		expect(achados.map((e) => e.payload.data.regra)).toEqual(["assessor-doador"]);
		expect(JSON.stringify(achados)).not.toContain(CPF);
	});

	it("casa sem lista de gabinete: não consulta nada e não escreve linha de gabinete no log", async () => {
		const eventos: { tipo: string; payload: any }[] = [];
		const carregar = vi.fn(async () => gabinete());
		await emitirCruzamentos({ ...base, gabinete: null, carregarGabinete: carregar }, (tipo, payload) => eventos.push({ tipo, payload }));
		expect(carregar).not.toHaveBeenCalled();
		expect(eventos.some((e) => String(e.payload?.msg).startsWith("[GABINETE]"))).toBe(false);
	});
});

describe("sócios citados em diário oficial: contexto, não acusação", () => {
	it("o texto avisa que pode ser homônimo e não fala em nepotismo", () => {
		const dou = citacaoNoDou({ tipoPublicacao: "Portaria", orgao: "Ministério X" });
		const qd = citacaoNoDiarioMunicipal({ territory_name: "Cuiabá", excerpts: ["nomeia FULANO para o cargo"] });
		expect(dou).toBe("[DOU] Publicação com o mesmo nome (busca pelo nome; pode ser homônimo): Portaria — Ministério X.");
		expect(qd).toBe('[QUERIDO DIÁRIO] Citação com o mesmo nome em Cuiabá (busca pelo nome; pode ser homônimo). Trecho: "nomeia FULANO para o cargo..."');
		expect(`${dou} ${qd}`).not.toMatch(/nepotismo|laranja/i);
	});
});
