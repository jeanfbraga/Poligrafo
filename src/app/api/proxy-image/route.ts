import { NextResponse } from "next/server";
import { fetchImageAsBase64 } from "@/lib/image-proxy";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const url = searchParams.get("url");
	const raw = searchParams.get("raw") === "true";

	if (!url) {
		return new NextResponse("Missing url parameter", { status: 400 });
	}

	try {
		const base64 = await fetchImageAsBase64(url);
		
		if (raw) {
			const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
			if (matches && matches.length === 3) {
				const buffer = Buffer.from(matches[2], "base64");
				return new NextResponse(buffer, {
					headers: {
						"Content-Type": matches[1],
						"Cache-Control": "public, max-age=86400",
					},
				});
			}
		}

		return NextResponse.json({ base64 });
	} catch (error) {
		console.error("[PROXY-IMAGE] Erro:", error);
		return new NextResponse("Failed to proxy image", { status: 500 });
	}
}
