function isAllowedDomain(hostname: string): boolean {
	const hostLower = hostname.toLowerCase();
	const allowedSuffixes = [
		"camara.leg.br",
		"senado.leg.br",
		"senado.gov.br",
		"tse.jus.br",
		"tse.gov.br",
		"gov.br",
		"jus.br",
		"githubusercontent.com",
	];
	return allowedSuffixes.some(
		(suffix) => hostLower === suffix || hostLower.endsWith(`.${suffix}`),
	);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 10_000;

export async function fetchImageAsBase64(url: string): Promise<string> {
	try {
		const parsedUrl = new URL(url);

		if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
			throw new Error(`Invalid protocol: ${parsedUrl.protocol}`);
		}

		if (!isAllowedDomain(parsedUrl.hostname)) {
			throw new Error(
				`Forbidden domain for proxy image: ${parsedUrl.hostname}`,
			);
		}

		const response = await fetch(url, {
			headers: {
				"User-Agent": "Poligrafo-Bot/1.0",
				Accept: "image/*",
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch image: HTTP ${response.status}`);
		}

		const contentLength = Number(response.headers.get("content-length") || 0);
		if (contentLength > MAX_IMAGE_BYTES) {
			throw new Error(`Image too large: ${contentLength} bytes`);
		}

		const arrayBuffer = await response.arrayBuffer();
		if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
			throw new Error(`Image too large: ${arrayBuffer.byteLength} bytes`);
		}

		const buffer = Buffer.from(arrayBuffer);
		const contentType = response.headers.get("content-type") || "image/jpeg";

		return `data:${contentType};base64,${buffer.toString("base64")}`;
	} catch (error) {
		console.error("Error fetching proxy image:", error);
		throw error;
	}
}
