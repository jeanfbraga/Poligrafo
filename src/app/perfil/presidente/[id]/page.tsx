import type { Metadata } from "next";
import PresidenteDashboard from "./PresidenteDashboard";

export async function generateMetadata(props: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const params = await props.params;
	const id = params.id;
	
	const nome = id.charAt(0).toUpperCase() + id.slice(1);
	const title = `Dossiê: Presidente ${nome} | Polígrafo`;
	const description = `Auditoria completa do Cartão Corporativo (CPGF) e gastos da Presidência da República no mandato de ${nome}.`;

	return {
		title,
		description,
		alternates: {
			canonical: `/perfil/presidente/${id}`,
		},
		openGraph: {
			title,
			description,
			type: "profile",
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
		},
	};
}

export default async function PresidenteProfilePage(props: {
	params: Promise<{ id: string }>;
}) {
	return <PresidenteDashboard params={props.params} />;
}
