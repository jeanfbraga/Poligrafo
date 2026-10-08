/**
 * Nome civil do senador pela API de dados abertos do Senado (o Senado não publica CPF).
 *
 * Serve para confirmar o eleito da base tse_eleitos achado só pelo nome de urna: se o
 * nome civil oficial do Senado for igual ao do eleito (mesmo cargo e UF, resultado
 * único), são duas fontes oficiais apontando a mesma pessoa e o CPF da base vale.
 * Antes o CPF do senador só vinha do DivulgaCand ao vivo, que recusa os servidores
 * da Vercel (403 em 08/10/2026): em produção nenhum senador tinha CPF.
 */
import { buscarJson } from "@/lib/fonte-http";

const UM_DIA = 24 * 60 * 60 * 1000;

interface RespostaSenador {
	DetalheParlamentar?: { Parlamentar?: { IdentificacaoParlamentar?: { NomeCompletoParlamentar?: string } } };
}

export async function nomeCivilDoSenador(id: unknown, fetchFn?: typeof fetch): Promise<string | null> {
	const codigo = String(id ?? "");
	if (!/^\d+$/.test(codigo)) return null;
	const r = await buscarJson<RespostaSenador>(`https://legis.senado.leg.br/dadosabertos/senador/${codigo}`, {
		fonte: "senado-parlamentar",
		timeoutMs: 6000,
		tentativas: 2,
		memoria: { ttlMs: UM_DIA },
		fetchFn,
	});
	if (!r.ok) return null;
	return r.dados?.DetalheParlamentar?.Parlamentar?.IdentificacaoParlamentar?.NomeCompletoParlamentar?.trim() || null;
}
