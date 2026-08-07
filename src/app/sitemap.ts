import type { MetadataRoute } from "next";
import congressoIndex from "@/services/integrations/data/congresso-index.json";

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://poligrafo.app";

	// Páginas estáticas / institucionais
	const staticPages: MetadataRoute.Sitemap = [
		{
			url: baseUrl,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 1.0,
		},
		{
			url: `${baseUrl}/perfil/presidente/lula`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/perfil/presidente/bolsonaro`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
	];

	// Páginas de perfil de todos os parlamentares cadastrados
	// URL canônica: sem query params — o generateMetadata do perfil lida com os searchParams
	const deputyPages: MetadataRoute.Sitemap = (congressoIndex as Array<{
		id: string;
		nome: string;
		uf?: string;
		partido?: string;
	}>).map((dep) => ({
		url: `${baseUrl}/perfil/deputado/${dep.id}`,
		lastModified: new Date(),
		changeFrequency: "weekly" as const,
		priority: 0.7,
	}));

	return [...staticPages, ...deputyPages];
}
