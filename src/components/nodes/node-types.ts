/* ==========================================================================
   Tipos de nó do Dossiê — família, ícone e rótulo.
   Fonte única de verdade para canvas (React Flow), rail, inspetor e mobile.

   Famílias (cor SÓ no cabeçalho do node):
     pessoa → verde fósforo   (PESSOA, SOCIO, SERVIDOR, ATIVIDADE_PARLAMENTAR)
     org    → ciano           (EMPRESA, ORGAO)
     fin    → aço             (DESPESA, CONTRATO, EMENDA, EMENDA_RESUMO, RESUMO_GASTOS)
     doc    → violeta         (PROCESSO_JUDICIAL, DIARIO_OFICIAL_NODE)
   Risco (âmbar/vermelho) NUNCA vem da família: ver lib/investigacao/risco.
   ========================================================================== */
import type { PixelIconName } from "@/components/pixel/pixel-icons";

export type Familia = "pessoa" | "org" | "fin" | "doc";

export interface TipoNo {
	familia: Familia;
	icon: PixelIconName;
	/** Rótulo do cabeçalho. */
	tag: string;
	/** Texto da barra de carregamento durante pivôs. */
	carregando: string;
	canShare: boolean;
}

export const TIPOS_NO: Record<string, TipoNo> = {
	PESSOA: { familia: "pessoa", icon: "user", tag: "Pessoa", carregando: "Processando dossiê…", canShare: true },
	SOCIO: { familia: "pessoa", icon: "users", tag: "Sócio · QSA", carregando: "Busca reversa…", canShare: false },
	SERVIDOR: { familia: "pessoa", icon: "users", tag: "Servidor", carregando: "Busca reversa…", canShare: false },
	ATIVIDADE_PARLAMENTAR: { familia: "pessoa", icon: "cal", tag: "Atividade parlamentar", carregando: "Analisando presenças e votações…", canShare: false },
	EMPRESA: { familia: "org", icon: "briefcase", tag: "Pessoa jurídica", carregando: "Pivoteando malha…", canShare: true },
	ORGAO: { familia: "org", icon: "building", tag: "Órgão público", carregando: "Interceptando notas…", canShare: false },
	DESPESA: { familia: "fin", icon: "dollar", tag: "Despesa", carregando: "Pivoteando…", canShare: true },
	DESPESA_PUBLICA: { familia: "fin", icon: "dollar", tag: "Despesa", carregando: "Pivoteando…", canShare: true },
	CONTRATO: { familia: "fin", icon: "file", tag: "Contrato federal", carregando: "Processando…", canShare: true },
	EMENDA: { familia: "fin", icon: "landmark", tag: "Emenda", carregando: "Analisando execução…", canShare: true },
	EMENDA_RESUMO: { familia: "fin", icon: "landmark", tag: "Resumo de emendas", carregando: "Processando…", canShare: false },
	RESUMO_GASTOS: { familia: "fin", icon: "chart", tag: "Cota de gabinete", carregando: "Processando…", canShare: false },
	PROCESSO_JUDICIAL: { familia: "doc", icon: "scale", tag: "Processo judicial", carregando: "Processando…", canShare: true },
	DIARIO_OFICIAL_NODE: { familia: "doc", icon: "news", tag: "Diário oficial", carregando: "Extraindo ato oficial…", canShare: true },
};

const TIPO_PADRAO: TipoNo = {
	familia: "pessoa",
	icon: "file",
	tag: "Registro",
	carregando: "Processando…",
	canShare: false,
};

export function tipoDoNo(type: string | undefined): TipoNo {
	return (type && TIPOS_NO[type]) || TIPO_PADRAO;
}

/** Cor CSS da família (usada em minimapa e legenda). */
export const COR_FAMILIA: Record<Familia, string> = {
	pessoa: "var(--pg-pessoa)",
	org: "var(--pg-org)",
	fin: "var(--pg-fin)",
	doc: "var(--pg-doc)",
};

export const ROTULO_FAMILIA: Record<Familia, string> = {
	pessoa: "Pessoa",
	org: "Organização",
	fin: "Financeiro",
	doc: "Documento",
};
