/**
 * Conversão de markdown simples (resumos gerados por IA) para HTML seguro.
 */

/** Escapa HTML do texto vindo da IA/do corpo da requisição antes de virar marcação. */
export function escaparHtml(texto: string): string {
	return texto
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Converte o markdown simples do resumo em HTML. O texto é escapado antes,
 * então só as tags geradas aqui chegam ao navegador (antes, um título ou
 * ementa com <script> ou <img onerror> era injetado na página).
 */
export function converterMarkdownParaHtml(md: string): string {
	return escaparHtml(md)
		.replace(/^### (.*$)/gim, '<h3 class="text-xs font-bold uppercase text-green-400 mt-4 mb-2 tracking-wider border-b border-green-900/50 pb-1">$1</h3>')
		.replace(/^## (.*$)/gim, '<h2 class="text-sm font-bold uppercase text-green-300 mt-5 mb-2 tracking-wider">$1</h2>')
		.replace(/^# (.*$)/gim, '<h1 class="text-base font-bold uppercase text-green-300 mt-6 mb-2 tracking-wider">$1</h1>')
		.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-green-300 text-sm mb-1.5 leading-relaxed">$1</li>')
		.replace(/^\s*\*\s+(.*$)/gim, '<li class="ml-4 list-disc text-green-300 text-sm mb-1.5 leading-relaxed">$1</li>')
		.replace(/\*\*(.*?)\*\*/g, '<strong class="text-green-300 font-bold">$1</strong>')
		.replace(/\n\n/g, '<div class="h-2.5"></div>')
		.replace(/\n/g, '<br />');
}
