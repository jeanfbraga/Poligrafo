import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://poligrafo.app";

	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/api/"],
			},
			{
				userAgent: [
					"GPTBot",
					"ChatGPT-User",
					"PerplexityBot",
					"ClaudeBot",
					"Claude-Web",
					"Google-Extended",
					"Applebot-Extended",
					"CCBot",
				],
				allow: ["/", "/llms.txt", "/api/dashboard/", "/api/perfil/"],
				disallow: ["/api/investigar/", "/api/proxy-image/", "/api/exportar-dossie/"],
			},
		],
		sitemap: `${baseUrl}/sitemap.xml`,
	};
}
