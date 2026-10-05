import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { gerarDossieDocx } from "@/lib/investigacao/dossie-docx/documento";
import { segmentosDoMes } from "@/lib/investigacao/dossie-docx/grafico-cota";
import { MAX_VOTOS_DOSSIE, montarPerfilDossie, PERFIL_INDISPONIVEL } from "@/lib/investigacao/dossie-docx/perfil";
import { idCamaraDaRef } from "@/lib/investigacao/alvo";
import { montarPayloadExportacao } from "@/lib/investigacao/exportacao";
import { emLotes, resumoDaApi } from "@/lib/perfil-deputado/proposicoes";
import { idProposicaoPrincipal, sentidoDoVoto, urlFichaCamara } from "@/lib/votos";

vi.mock("@/lib/perfil-deputado/consultas", () => ({
	buscarServidoresDeputado: () => new Promise(() => {}),
	buscarCotaDeputado: async () => [],
	buscarVotosDeputado: async () => [],
}));

const HOJE = new Date("2026-10-05T12:00:00Z");
const TETO = 45612.53;

const dados = {
	servidores: [
		{ nome: "ANA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 01/02/2023" },
		{ nome: "ANA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 01/02/2023 a 31/12/2023" },
		{ nome: "BIA", cargo: "CARGO DE NATUREZA ESPECIAL", periodo: "Desde 01/02/2023" },
		{ nome: "CAIO", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 01/02/2023 a 30/06/2025" },
	],
	cota: [
		{ ano_referencia: 2025, mes_referencia: 12, valor_gasto: 99999, valor_teto: TETO },
		{ ano_referencia: 2026, mes_referencia: 1, valor_gasto: 40000, valor_teto: TETO },
		{ ano_referencia: 2026, mes_referencia: 2, valor_gasto: 52000, valor_teto: TETO },
	],
	votos: [
		{ voto: "Sim", id_proposicao: 11, projeto_nome: "PL 1/2026 - Teste. Sim: 300; Não: 10", projeto_tema: "Economia", data_votacao: "2026-09-30" },
		{ voto: "Não", id_proposicao: 22, projeto_nome: "PEC 2/2026", projeto_tema: "Não especificado", data_votacao: "2026-09-01" },
		{ voto: "Obstrução", projeto_nome: "REQ 3/2026", data_votacao: "2026-08-01" },
	],
	proposicoes: { "11": { titulo: "PL 1/2026", ementa: "Dispõe sobre teste.", integra: "https://www.camara.leg.br/integra/11.pdf" } },
};

describe("idCamaraDaRef", () => {
	it("aceita id da Câmara e recusa CPF (11 dígitos) ou outras casas", () => {
		expect(idCamaraDaRef("FEDERAL:CAMARA:204554")).toBe("204554");
		expect(idCamaraDaRef("FEDERAL:CAMARA:12345678901")).toBeNull();
		expect(idCamaraDaRef("FEDERAL:SENADO:5012")).toBeNull();
		expect(idCamaraDaRef(undefined)).toBeNull();
	});

	it("vai no payload da exportação", () => {
		expect(montarPayloadExportacao([], [], "X", "FEDERAL:CAMARA:204554").idCamara).toBe("204554");
		expect(montarPayloadExportacao([], [], "X", "GOVERNADOR:SP:1").idCamara).toBeUndefined();
	});
});

describe("montarPerfilDossie", () => {
	const p = montarPerfilDossie("204554", dados, HOJE);

	it("gabinete: uma pessoa por nome, ativos x desligados e cargos dos ativos", () => {
		expect(p.gabinete).toEqual({
			ativos: 2,
			desligados: 1,
			periodos: 4,
			cargos: [
				{ cargo: "CARGO DE NATUREZA ESPECIAL", quantidade: 1 },
				{ cargo: "SECRETÁRIO PARLAMENTAR", quantidade: 1 },
			],
		});
	});

	it("cota: ano mais recente e meses acima do teto", () => {
		expect(p.cota).toMatchObject({ ano: 2026, teto: TETO, totalGasto: 92000, mesesAcima: 1, situacao: "acima" });
	});

	it("votos: contagem, proposição identificada, votação sem placar e link (inteiro teor ou ficha da Câmara)", () => {
		expect(p.votos).toMatchObject({ total: 3, sim: 1, nao: 1, outros: 1 });
		expect(p.votos.lista[0]).toMatchObject({
			proposicao: "PL 1/2026",
			ementa: "Dispõe sobre teste.",
			votado: "PL 1/2026 - Teste",
			url: "https://www.camara.leg.br/integra/11.pdf",
			integra: true,
			data: "30/09/2026",
		});
		expect(p.votos.lista[1]).toMatchObject({ proposicao: "", url: urlFichaCamara(22), integra: false });
		expect(p.votos.lista[2].url).toBeNull();
	});

	it("o link vai para a proposição principal (prefixo do id da votação), não para o parecer votado", () => {
		const r = montarPerfilDossie(
			"1",
			{ ...dados, votos: [{ id_votacao: "2580259-24", id_proposicao: 2643408, voto: "Sim", projeto_nome: "Aprovado o Substitutivo" }], proposicoes: {} },
			HOJE,
		);
		expect(r.votos.lista[0].url).toBe(urlFichaCamara("2580259"));
		expect(idProposicaoPrincipal({ id_votacao: "abc", id_proposicao: 77 })).toBe("77");
		expect(idProposicaoPrincipal({})).toBeNull();
	});

	it("lista no máximo os votos mais recentes, mas conta todos", () => {
		const muitos = Array.from({ length: MAX_VOTOS_DOSSIE + 20 }, (_, i) => ({ voto: "Sim", id_proposicao: i, data_votacao: "2026-01-01" }));
		const r = montarPerfilDossie("1", { ...dados, votos: muitos }, HOJE);
		expect(r.votos.total).toBe(MAX_VOTOS_DOSSIE + 20);
		expect(r.votos.lista).toHaveLength(MAX_VOTOS_DOSSIE);
	});

	it("sem cota: null; lixo nas listas é ignorado", () => {
		const r = montarPerfilDossie("1", { servidores: null as never, cota: [], votos: [null, 3] as never, proposicoes: {} }, HOJE);
		expect(r.cota).toBeNull();
		expect(r.gabinete.ativos).toBe(0);
		expect(r.votos.total).toBe(0);
	});

	it("sentido do voto", () => {
		expect([sentidoDoVoto("Sim"), sentidoDoVoto("NÃO"), sentidoDoVoto("Abstenção"), sentidoDoVoto(undefined)]).toEqual(["sim", "nao", "outro", "outro"]);
	});
});

describe("segmentosDoMes (barra do gráfico)", () => {
	const soma = (s: { largura: number }[]) => s.reduce((t, x) => t + x.largura, 0);

	it("abaixo do teto: barra + trecho vazio com o filete do teto", () => {
		const s = segmentosDoMes(50, 100, 200, 1000);
		expect(s.map((x) => x.largura)).toEqual([250, 250, 500]);
		expect(s[1].marcaTeto).toBe(true);
		expect(soma(s)).toBe(1000);
	});

	it("acima do teto: excesso separado depois do filete", () => {
		const s = segmentosDoMes(150, 100, 200, 1000);
		expect(s.map((x) => x.largura)).toEqual([500, 250, 250]);
		expect(s[0]).toMatchObject({ marcaTeto: true });
		expect(s[1].fill).not.toBe(s[0].fill);
	});

	it("gasto colado no teto: o filete não some", () => {
		const s = segmentosDoMes(100.5, 100, 200, 1000);
		expect(s.some((x) => x.marcaTeto)).toBe(true);
		expect(soma(s)).toBe(1000);
	});

	it("sem gasto: só o filete na posição do teto", () => {
		const s = segmentosDoMes(0, 100, 200, 1000);
		expect(s[0]).toMatchObject({ largura: 500, marcaTeto: true });
		expect(s[0].fill).toBeUndefined();
	});
});

describe("seção Atuação parlamentar no docx", () => {
	const payload = { nomePolitico: "ANA", idCamara: "204554", despesasCriticas: [], urlsNotasFiscais: [] };
	const xmlDe = async (b: Buffer) => (await (await JSZip.loadAsync(b)).file("word/document.xml")!.async("string"));

	it("entra com gabinete, cota (gráfico) e votos com links", async () => {
		const xml = await xmlDe(await gerarDossieDocx(payload, HOJE, montarPerfilDossie("204554", dados, HOJE)));
		for (const t of ["Atuação parlamentar", "Gabinete", "Cota parlamentar (CEAP) · 2026", "Votações em plenário", "Inteiro teor", "Ficha na Câmara", "acima: +R$"]) {
			expect(xml).toContain(t);
		}
		expect(xml).toContain('w:val="dashed"');
	});

	it("consulta indisponível: seção avisa, sem inventar números", async () => {
		const xml = await xmlDe(await gerarDossieDocx(payload, HOJE, PERFIL_INDISPONIVEL));
		expect(xml).toContain("Não foi possível consultar a base da Câmara");
		expect(xml).not.toContain("Votações em plenário");
	});

	it("sem idCamara (não é deputado federal): nenhuma seção de perfil", async () => {
		const xml = await xmlDe(await gerarDossieDocx({ ...payload, idCamara: undefined }, HOJE, montarPerfilDossie("1", dados, HOJE)));
		expect(xml).not.toContain("Atuação parlamentar");
	});
});

describe("proposições (API da Câmara)", () => {
	it("resumo: sigla/número/ano, ementa e inteiro teor; ano 0 (parecer) não vira título", () => {
		expect(resumoDaApi({ siglaTipo: "PLP", numero: 230, ano: 2025, ementa: " Altera… ", urlInteiroTeor: "https://x/teor" })).toEqual({
			titulo: "PLP 230/2025",
			ementa: "Altera…",
			integra: "https://x/teor",
		});
		expect(resumoDaApi({ siglaTipo: "PEP", numero: 1, ano: 0, urlInteiroTeor: "javascript:x" })).toEqual({ titulo: undefined, ementa: undefined, integra: undefined });
	});

	it("emLotes respeita o limite de paralelismo e mantém a ordem", async () => {
		let ativos = 0;
		let pico = 0;
		const r = await emLotes([1, 2, 3, 4, 5, 6], 2, async (n) => {
			ativos++;
			pico = Math.max(pico, ativos);
			await new Promise((ok) => setTimeout(ok, 5));
			ativos--;
			return n * 10;
		});
		expect(r).toEqual([10, 20, 30, 40, 50, 60]);
		expect(pico).toBe(2);
	});
});

describe("buscarDadosPerfilCamara", () => {
	it("id inválido ou consulta que estoura o prazo → null (o dossiê sai mesmo assim)", async () => {
		const { buscarDadosPerfilCamara } = await import("@/lib/investigacao/dossie-docx/perfil-dados");
		expect(await buscarDadosPerfilCamara("abc")).toBeNull();
		expect(await buscarDadosPerfilCamara("204554", 20)).toBeNull();
	});
});
