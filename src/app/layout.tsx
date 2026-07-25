import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Clarity from "@/components/analytics/Clarity";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import { Toaster } from "@/components/ui/sonner";

const plexMono = IBM_Plex_Mono({
	weight: ["400", "500", "600", "700"],
	subsets: ["latin"],
	variable: "--font-plex-mono",
});

import type { Metadata } from "next";

export const metadata: Metadata = {
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
	),
	title: "Polígrafo - Scan de Políticos",
	description:
		"Ferramenta OSINT de auditoria pública. Cruze dados da Câmara, Senado, TSE e Receita Federal para investigar políticos e contratos públicos.",
	keywords: [
		"OSINT",
		"Polígrafo",
		"Auditoria Pública",
		"Dados Abertos",
		"Política",
		"TSE",
		"CGU",
	],
	openGraph: {
		title: "Polígrafo - Auditoria Cidadã",
		description:
			"Cruze dados públicos de políticos para gerar dossiês e encontrar conexões suspeitas em tempo real.",
		url: "https://poligrafo.app",
		siteName: "Polígrafo",
		images: [
			{
				url: "/og-image.jpg",
				width: 1200,
				height: 630,
				alt: "Polígrafo OSINT",
			},
		],
		locale: "pt_BR",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Polígrafo - Auditoria Cidadã",
		description:
			"Cruze dados públicos de políticos para gerar dossiês e encontrar conexões suspeitas em tempo real.",
		images: ["/og-image.jpg"],
	},
};

import type { Viewport } from "next";

export const viewport: Viewport = {
	themeColor: "#050505",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Analytics só é ativado quando os IDs são configurados via env —
	// forks/deploys devem usar seus próprios IDs, nunca os do autor.
	const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
	const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

	return (
		<html lang="pt-BR" className={plexMono.variable} suppressHydrationWarning>
			<body className="font-mono subpixel-antialiased" suppressHydrationWarning>
				{children}
				{gaId && <GoogleAnalytics gaId={gaId} />}
				{clarityId && <Clarity projectId={clarityId} />}
				<Analytics />
				<Toaster />
			</body>
		</html>
	);
}
