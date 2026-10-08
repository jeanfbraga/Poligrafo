import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AgrupadorDaCota,
	anosDaJanela,
	dataDaNota,
	linhaDoLog,
	minimoDeLinhas,
	type NotaCota,
	processarAno,
} from "../../scripts/etl/ceap-fornecedores-sync";
import { emitirCruzamentos } from "../../src/services/cruzamentos";
import { alvoDaCota, fatosDaCotaAgrupada, resumoDaCotaAgrupada } from "../../src/services/cruzamentos/cota";
import { buscarFornecedoresDaCota, type FornecedorDaCota, reiniciarAvisoCotaAgrupada } from "../../src/services/integrations/camara/cota-agrupada";

const CPF = "52998224725";
const CNPJ = "11222333000181";
const nota = (extra: Partial<NotaCota> = {}): NotaCota => ({ casa: "CAMARA", id_parlamentar: 160535, ano: 2025, documento: "11.222.333/0001-81", fornecedor: "GRAFICA X", tipo_despesa: "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.", valor: 100.1, data: "2025-03-10T00:00:00", ...extra });

afterEach(() => vi.restoreAllMocks());

describe("cota agrupada — ETL (parlamentar + ano + fornecedor + tipo)", () => {
	it("soma valores e notas, guarda a primeira e a última data e deixa de fora nota sem CNPJ/CPF", () => {
		const a = new AgrupadorDaCota();
		a.adicionar(nota());
		a.adicionar(nota({ valor: 200.2, data: "2025-01-05T00:00:00" }));
		a.adicionar(nota({ valor: 50, data: "2025-11-30" }));
		a.adicionar(nota({ tipo_despesa: "LOCAÇÃO DE VEÍCULOS" }));
		a.adicionar(nota({ documento: "" }));
		a.adicionar(nota({ documento: "123" }));
		expect(a.semDocumento).toBe(2);
		expect(a.linhas()).toEqual([
			{ casa: "CAMARA", id_parlamentar: 160535, ano: 2025, documento: CNPJ, tipo_despesa: "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.", fornecedor: "GRAFICA X", valor_total: 350.3, notas: 3, primeira_data: "2025-01-05", ultima_data: "2025-11-30" },
			expect.objectContaining({ tipo_despesa: "LOCAÇÃO DE VEÍCULOS", notas: 1 }),
		]);
	});

	it("janela de 4 anos (um mandato), datas dos dois formatos e mínimo por ano fechado/aberto", () => {
		expect(anosDaJanela(new Date("2026-10-08T12:00:00Z"))).toEqual([2023, 2024, 2025, 2026]);
		expect([dataDaNota("2025-02-28T00:00:00"), dataDaNota("2025-03-20"), dataDaNota("20/03/2025"), dataDaNota(null)]).toEqual(["2025-02-28", "2025-03-20", null, null]);
		const agora = new Date("2026-10-08T12:00:00Z");
		expect([minimoDeLinhas("CAMARA", 2025, agora), minimoDeLinhas("CAMARA", 2026, agora), minimoDeLinhas("SENADO", 2025, agora)]).toEqual([20_000, 1_000, 1_500]);
	});

	it("grava: apaga o ano da casa e insere em lotes de 1000; arquivo ruim não apaga nada", async () => {
		const chamadas: string[] = [];
		const cliente: any = {
			from: () => ({
				delete: () => ({ eq: (_c: string, casa: string) => ({ eq: async (_c2: string, ano: number) => { chamadas.push(`apagar ${casa} ${ano}`); return { error: null }; } }) }),
				insert: async (lote: unknown[]) => { chamadas.push(`inserir ${lote.length}`); return { error: null }; },
			}),
		};
		const muitas = async (_ano: number, _dir: string, a: AgrupadorDaCota) => {
			for (let i = 0; i < 1500; i++) a.adicionar(nota({ id_parlamentar: i + 1 }));
		};
		const r = await processarAno("CAMARA", 2026, { cliente, gravar: true, leitores: { CAMARA: muitas, SENADO: muitas }, agora: new Date("2026-10-08T12:00:00Z") });
		expect(chamadas).toEqual(["apagar CAMARA 2026", "inserir 1000", "inserir 500"]);
		expect(linhaDoLog(r)).toBe("[COTA AGRUPADA] CAMARA 2026: 1500 grupos (~0.3 MB); 0 nota(s) sem CNPJ/CPF ficaram fora; gravado.");
		chamadas.length = 0;
		const poucas = async (_ano: number, _dir: string, a: AgrupadorDaCota) => a.adicionar(nota());
		const ruim = await processarAno("CAMARA", 2025, { cliente, gravar: true, leitores: { CAMARA: poucas, SENADO: poucas }, agora: new Date("2026-10-08T12:00:00Z") });
		expect(chamadas).toEqual([]);
		expect(linhaDoLog(ruim)).toBe("[COTA AGRUPADA] CAMARA 2025: falhou (1 grupos (< 20000); base existente preservada).");
	});
});

const LINHAS: FornecedorDaCota[] = [
	{ casa: "CAMARA", id_parlamentar: 160535, ano: 2023, documento: CNPJ, tipo_despesa: "DIVULGAÇÃO", fornecedor: "GRAFICA X", valor_total: 9000, notas: 3, primeira_data: "2023-02-01", ultima_data: "2023-09-01" },
	{ casa: "CAMARA", id_parlamentar: 160535, ano: 2026, documento: "11444777000161", tipo_despesa: "LOCAÇÃO", fornecedor: "LOCADORA Y", valor_total: 1, notas: 1, primeira_data: null, ultima_data: null },
	{ casa: "CAMARA", id_parlamentar: 160535, ano: 2026, documento: "123", tipo_despesa: "X", fornecedor: "SEM DOC", valor_total: 1, notas: 1, primeira_data: null, ultima_data: null },
];

describe("cota agrupada — no motor de cruzamentos", () => {
	it("alvo: deputado federal ou senador com id; o resto não tem CEAP", () => {
		expect(alvoDaCota({ casa: "CAMARA", id: "160535" })).toEqual({ casa: "CAMARA", id: 160535 });
		expect(alvoDaCota({ casa: "SENADO", id: 5012 })).toEqual({ casa: "SENADO", id: 5012 });
		expect(alvoDaCota({ casa: "ALESP", id: 1 })).toBeNull();
		expect(alvoDaCota({ casa: "CAMARA" })).toBeNull();
	});

	it("cada linha vira um fato FORNECEDOR_COTA com período e fonte; documento inválido fica fora", () => {
		const fatos = fatosDaCotaAgrupada(LINHAS, "2026-10-08T00:00:00Z");
		expect(fatos).toHaveLength(2);
		expect(fatos[0]).toMatchObject({
			papel: "FORNECEDOR_COTA", documento: CNPJ, nome: "GRAFICA X", valor: 9000, data: "2023-02-01",
			periodo: { inicio: "2023-02-01", fim: "2023-09-01" }, detalhe: "DIVULGAÇÃO — 3 notas em 2023",
			procedencia: { fonte: "Câmara dos Deputados — cota parlamentar 2023 (todas as notas, agrupadas por fornecedor)", chave: "parlamentar=160535; ano=2023" },
		});
		expect(fatos[1]).toMatchObject({ data: "2026", detalhe: "LOCAÇÃO — 1 nota em 2026" });
		expect(resumoDaCotaAgrupada(LINHAS)).toBe("3 fornecedores da cota em 2 anos (2023–2026)");
	});

	it("doador que só aparece na cota agrupada (fora das 60 notas) agora cruza; o log diz quantos fornecedores entraram", async () => {
		const eventos: { tipo: string; payload: any }[] = [];
		const doadorFornecedor: FornecedorDaCota = { ...LINHAS[0], documento: CPF, fornecedor: "FULANO DOADOR" };
		await emitirCruzamentos(
			{
				pessoaId: "p", casa: "CAMARA", doadores: [], empresasDoPolitico: [], despesasMandato: [], nos: [], sqCandidato: "1",
				buscarContas: async () => ({ doadores: [{ sq_candidato: "1", ano_eleicao: 2022, tipo: "DOADOR", documento: CPF, nome: "FULANO DOADOR", valor_total: 5000, quantidade: 1, origem: "Recursos de pessoas físicas" }], fornecedores: [] }),
				buscarSancoes: async () => [], buscarQsa: async () => null, buscarFuncoes: async () => [], explicar: async () => [],
				cota: { casa: "CAMARA", id: 160535 }, buscarFornecedoresCota: async () => [doadorFornecedor, LINHAS[1]],
			},
			(tipo, payload) => eventos.push({ tipo, payload }),
		);
		const status = eventos.filter((e) => e.tipo === "STATUS").map((e) => e.payload.msg);
		expect(status).toContain("[COTA] 2 fornecedores da cota em 2 anos (2023–2026) entram no cruzamento (o dossiê mostra as 60 notas de maior valor).");
		const achados = eventos.filter((e) => e.tipo === "NODE_NOVO" && e.payload.type === "ACHADO").map((e) => e.payload.data.regra);
		expect(achados).toEqual(["doador-fornecedor-cota"]);
	});

	it("leitura da base: filtra pela casa e pelo parlamentar; base fora do ar avisa uma vez e devolve null", async () => {
		reiniciarAvisoCotaAgrupada();
		const filtros: string[] = [];
		const q: any = {
			select: () => q, order: () => q, limit: async () => ({ data: [{ ...LINHAS[0], valor_total: "9000.00", notas: "3" }], error: null }),
			eq: (c: string, v: unknown) => { filtros.push(`${c}=${v}`); return q; },
		};
		const r = await buscarFornecedoresDaCota({ casa: "CAMARA", id: 160535 }, { from: () => q } as never);
		expect(filtros).toEqual(["casa=CAMARA", "id_parlamentar=160535"]);
		expect(r?.[0]).toMatchObject({ valor_total: 9000, notas: 3 });
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const quebrado: any = { select: () => quebrado, eq: () => quebrado, order: () => quebrado, limit: async () => ({ data: null, error: { message: "timeout" } }) };
		expect(await buscarFornecedoresDaCota({ casa: "CAMARA", id: 1 }, { from: () => quebrado } as never)).toBeNull();
		await buscarFornecedoresDaCota({ casa: "CAMARA", id: 1 }, { from: () => quebrado } as never);
		expect(aviso).toHaveBeenCalledTimes(1);
		expect(aviso).toHaveBeenCalledWith("[COTA] Base agrupada indisponível (timeout); o cruzamento usa só as notas do dossiê.");
	});
});
