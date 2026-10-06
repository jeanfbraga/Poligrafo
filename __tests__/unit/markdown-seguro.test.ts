import { describe, expect, it } from "vitest";
import { converterMarkdownParaHtml, escaparHtml } from "../../src/lib/markdown-seguro";

describe("markdown-seguro", () => {
	it("escapa HTML antes de montar as tags (fecha o XSS do resumo de PL)", () => {
		const html = converterMarkdownParaHtml('### Título <img src=x onerror="alert(1)">\n**<script>x</script>**');
		expect(html).not.toContain("<img");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
		expect(html).toContain("<h3 ");
		expect(html).toContain("<strong ");
	});

	it("mantém a formatação do markdown simples", () => {
		const html = converterMarkdownParaHtml("- item\n\nfim");
		expect(html).toContain("<li ");
		expect(html).toContain('<div class="h-2.5"></div>');
	});

	it("escapa os cinco caracteres especiais", () => {
		expect(escaparHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
	});
});
