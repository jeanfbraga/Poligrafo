"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { alvoDosParams, urlDossie } from "@/lib/investigacao/alvo";
import { HomeView } from "./HomeView";

/**
 * Entrada da rota "/": mostra a Home. Links antigos do tipo `/?alvo=...`
 * (compartilhados antes do redesign) são redirecionados ao Dossiê.
 */
export function HomeEntrada() {
	const params = useSearchParams();
	const router = useRouter();
	const alvo = alvoDosParams(new URLSearchParams(params?.toString() ?? ""));

	useEffect(() => {
		if (alvo) router.replace(urlDossie({ ...alvo, uf: alvo.uf ?? "FEDERAL" }));
	}, [alvo, router]);

	return alvo ? null : <HomeView />;
}
