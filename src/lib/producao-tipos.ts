/* ==========================================================================
   Tipos de proposição que contam como produção legislativa (carga diária e
   perfil do deputado). Requerimentos de rotina (urgência, audiência, voto de
   pesar), emendas e indicações eram 77% das linhas e 85 MB do Banco de Perfil
   em 12/10/2026, e apareciam na tela como "projetos".
   ========================================================================== */

/** Projetos de lei, PEC, decreto legislativo, medida provisória e pedido de informação (fiscalização). */
export const TIPOS_PRODUCAO = ["PL", "PLP", "PEC", "PDL", "MPV", "RIC"] as const;

export function ehTipoDeProducao(tipo: unknown): boolean {
	return (TIPOS_PRODUCAO as readonly string[]).includes(String(tipo ?? "").toUpperCase());
}

/** Filtro da API de dados abertos da Câmara (siglaTipo repetido): "&siglaTipo=PL&siglaTipo=PLP…". */
export function filtroTiposCamara(): string {
	return TIPOS_PRODUCAO.map((t) => `&siglaTipo=${t}`).join("");
}
