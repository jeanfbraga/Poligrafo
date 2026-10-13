import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Banco de Perfil no plano gratuito: acima de 500 MB fica só leitura. Cargas diárias que
 * regravavam tudo (upsert sem mudança) deixavam dezenas de MB de linhas mortas por dia
 * (13/10/2026: 469 → 484 MB em horas). Dados que não mudam depois de gravados só entram se
 * forem novos (ignoreDuplicates); as cargas do TSE gravam só o que mudou.
 */
const ler = (arquivo: string) => fs.readFileSync(path.join(process.cwd(), arquivo), "utf8");

describe("cargas não regravam o que não mudou", () => {
	it("votos e votações: só insere o que falta", () => {
		const fonte = ler("scripts/etl/votos-detalhados-sync.ts");
		expect(fonte).toContain("const VOTOS_SO_NOVOS = { onConflict: 'id_deputado,id_votacao', ignoreDuplicates: true }");
		expect(fonte).not.toMatch(/onConflict: 'id_deputado,id_votacao' \}/);
		expect(fonte).toContain("{ onConflict: 'id_votacao', ignoreDuplicates: true }");
	});

	it("produção legislativa (carga diária e perfil ao vivo): só insere o que falta", () => {
		expect(ler("scripts/etl/producao-legislativa-sync.ts")).toContain("{ onConflict: 'id_deputado,id_proposicao', ignoreDuplicates: true }");
		expect(ler("src/app/api/perfil/deputado/[id]/route.ts")).toContain('{ onConflict: "id_deputado,id_proposicao", ignoreDuplicates: true }');
	});

	it("TSE: eleitos e bens gravam só o que mudou; contas só inserem o que falta", () => {
		expect(ler("scripts/etl/tse-eleitos-sync.ts")).toContain("linhasQueMudaram(linhas, naBase)");
		expect(ler("scripts/etl/tse-bens-sync.ts")).toContain("bensQueMudaram(linhas, naBase)");
		expect(ler("scripts/etl/tse-contas-campanha-sync.ts")).toContain("ignoreDuplicates: true");
	});
});
