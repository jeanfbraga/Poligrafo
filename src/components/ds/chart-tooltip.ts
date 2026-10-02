/* ==========================================================================
   Tooltip dos gráficos (Recharts) no design system.
   O Recharts pinta o texto do item com a cor da série (preto quando a série não
   tem `fill`, como nos gráficos com <Cell>), ignorando `contentStyle.color`.
   Por isso o item e o rótulo precisam de estilo próprio — contraste AAA sobre
   --pg-bg-2: #d2ffe0 / #7fd39b sobre #0a1b11.
   ========================================================================== */
import type { CSSProperties } from "react";

export const ESTILO_TOOLTIP: CSSProperties = {
	backgroundColor: "#0a1b11",
	border: "1px solid #3dff8b",
	borderRadius: 0,
	color: "#d2ffe0",
	fontFamily: "var(--pg-font)",
	fontSize: "12px",
	padding: "8px 10px",
};

/** Linhas de valor ("Gasto CEAP : R$ …"). */
export const ESTILO_TOOLTIP_ITEM: CSSProperties = { color: "#d2ffe0", paddingBlock: 1 };

/** Rótulo do ponto (mês/categoria). */
export const ESTILO_TOOLTIP_ROTULO: CSSProperties = { color: "#7fd39b", marginBottom: 4, fontWeight: 600 };
