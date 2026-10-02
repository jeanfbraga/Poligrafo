"use client";

import { createContext, useContext } from "react";
import type { Direcao } from "@/lib/investigacao/layout";

export interface DossieUi {
	direcao: Direcao;
	/** Nó em destaque (hover no rail). */
	destacado: string | null;
	/** Nº de conexões por nó. */
	conexoes: ReadonlyMap<string, number>;
}

export const DossieUiCtx = createContext<DossieUi>({
	direcao: "LR",
	destacado: null,
	conexoes: new Map(),
});

export function useDossieUi(): DossieUi {
	return useContext(DossieUiCtx);
}
