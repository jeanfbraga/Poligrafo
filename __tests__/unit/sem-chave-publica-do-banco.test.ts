import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Os bancos não têm leitura pública (a chave anon é pública por natureza e daria acesso direto
// às tabelas, inclusive CPFs). Só o servidor lê, pela chave de serviço — que nunca pode ir
// para o navegador (prefixo NEXT_PUBLIC_ a colocaria no JavaScript do site).

function arquivosDeCodigo(pasta: string): string[] {
	return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
		const caminho = path.join(pasta, item.name);
		if (item.isDirectory()) return arquivosDeCodigo(caminho);
		return /\.(ts|tsx)$/.test(item.name) && !/\.test\.tsx?$/.test(item.name) ? [caminho] : [];
	});
}

const raiz = path.resolve(__dirname, "../..");
const codigo = arquivosDeCodigo(path.join(raiz, "src")).map((arquivo) => ({
	arquivo: path.relative(raiz, arquivo),
	texto: fs.readFileSync(arquivo, "utf8"),
}));

describe("acesso aos bancos só pelo servidor", () => {
	it("nenhum código do app usa a chave anon do Supabase", () => {
		const comAnon = codigo.filter(({ texto }) => /SUPABASE[A-Z_]*ANON_KEY/.test(texto)).map((c) => c.arquivo);
		expect(comAnon).toEqual([]);
	});

	it("chave de serviço nunca com prefixo NEXT_PUBLIC_", () => {
		const expostas = codigo.filter(({ texto }) => /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(texto)).map((c) => c.arquivo);
		expect(expostas).toEqual([]);
	});

	it("o cliente com a chave de serviço não entra em componente de navegador", () => {
		const noNavegador = codigo
			.filter(({ texto }) => /^\s*["']use client["']/m.test(texto))
			.filter(({ texto }) => /@\/lib\/supabase-(admin|perfil)/.test(texto))
			.map((c) => c.arquivo);
		expect(noNavegador).toEqual([]);
	});
});
