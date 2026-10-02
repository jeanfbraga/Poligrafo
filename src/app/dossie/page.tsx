import type { Metadata } from "next";
import { Suspense } from "react";
import { DossieView } from "@/components/dossie/DossieView";

export const metadata: Metadata = {
	title: "Dossiê | Polígrafo",
	description: "Dossiê OSINT: cruzamento de fontes oficiais e IA para apontar sinais de alerta.",
	robots: { index: false },
};

export default function DossiePage() {
	return (
		<Suspense fallback={null}>
			<DossieView />
		</Suspense>
	);
}
