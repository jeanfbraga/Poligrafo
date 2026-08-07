import { Suspense } from "react";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import Clarity from "@/components/analytics/Clarity";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Toaster } from "@/components/ui/sonner";
import { CrtFlicker } from "@/components/ui/crt-flicker";

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
				url: "/transferir.png",
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
		images: ["/transferir.png"],
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
	const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-1VS9S268X2";
	const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

	const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://poligrafo.app";

	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"name": "Polígrafo",
		"alternateName": "Polígrafo OSINT",
		"url": baseUrl,
		"description": "Plataforma de auditoria cidadã, inteligência artificial e OSINT para monitoramento do Congresso Nacional e agentes políticos brasileiros."
	};

	return (
		<html lang="pt-BR" className={plexMono.variable} suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{
					__html: `
					if (!sessionStorage.getItem("crt_played")) {
						document.documentElement.classList.add("crt-pending");
					}
				`}} />
				<script
					type="application/ld+json"
					dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
				/>
			</head>
			<body className="font-mono subpixel-antialiased crt-monitor" suppressHydrationWarning>
				{children}
				{gaId && <GoogleAnalytics gaId={gaId} />}
				{clarityId && <Clarity projectId={clarityId} />}
				<Analytics />
				<Toaster />
				<CrtFlicker />
			</body>
		</html>
	);
}
