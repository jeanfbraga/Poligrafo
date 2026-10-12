/**
 * Primeiras consultas depois do nó PESSOA: CGU/Receita pelo CPF (fora executivos, que o
 * Deep OSINT já cobre adiante) e diários oficiais para prefeitos e vereadores.
 */
import { investigarDiariosOficiais } from "@/app/api/investigar/scrapers/osint-diarios";
import { buscarReceitasFederais } from "@/app/api/investigar/scrapers/osint-fiscal";
import { expandirMalhaSocietaria } from "@/app/api/investigar/scrapers/osint-societario";
import { documentoValido } from "@/lib/documento";
import { type Investigacao, status } from "./contexto";

/** Pré-Passo CGU/BrasilAPI: SKIP para executivos (Deep OSINT já faz essas chamadas adiante). */
async function cguEReceita(inv: Investigacao): Promise<void> {
	if (!documentoValido(inv.cpf) || inv.perfil.executivo) return;
	const cpf = inv.cpf as string;
	status(inv, `Cruzando documento ${cpf} nas bases da CGU e Receita Federal...`);
	await buscarReceitasFederais(cpf, inv.pessoaId, inv.sendEvent);
	// Só expande malha se não for CNPJ (pessoas físicas)
	if (!inv.documentoIsCnpj) await expandirMalhaSocietaria(cpf, inv.pessoaId, inv.sendEvent);
}

function ehMunicipal(casa: unknown): boolean {
	return casa === "PREFEITURA" || String(casa).startsWith("CAMARA_MUNICIPAL");
}

export async function executarPrePassos(inv: Investigacao): Promise<void> {
	await cguEReceita(inv);
	// Diários Oficiais para cargos 11 e 13
	if (ehMunicipal(inv.dep.casa)) {
		await investigarDiariosOficiais(inv.dep.nome, inv.dep.uf, inv.pessoaId, inv.sendEvent, inv.nos, inv.eleito?.cd_municipio_ibge);
	}
}
