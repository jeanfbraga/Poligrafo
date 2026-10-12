/**
 * O que a investigação grava no Banco Principal: a linha parcial em `pesquisas` logo no começo,
 * a contagem do "Mais investigados" da Home, fotos parciais durante a triagem e o dossiê final.
 * Em desenvolvimento nada é gravado (o .env.local aponta para o banco de produção).
 */
import { documentoValido } from "@/lib/documento";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { type Investigacao, status } from "./contexto";

function escopo(inv: Investigacao): string {
	return inv.dep?.casa || "GLOBAL";
}

/** Cria a linha no banco cedo (partial: true); guarda o id para as atualizações. */
export async function gravarParcialInicial(inv: Investigacao): Promise<void> {
	if (inv.isDev) return;
	try {
		const { data, error } = await supabaseAdmin
			.from("pesquisas")
			.upsert(
				{
					termo_busca: inv.chaveCache,
					cpf_raiz: documentoValido(inv.cpf) ? inv.cpf : null,
					grafo_dados: { timestamp: new Date().toISOString(), nodes: inv.nos, escopo: escopo(inv), partial: true },
				},
				{ onConflict: "termo_busca" },
			)
			.select("id")
			.single();
		if (data?.id) inv.dbSearchId = data.id;
		if (error) console.error("[Partial Cache Init Error]", error);
	} catch (e) {
		console.error("[Partial Cache Init Error]", e);
	}
}

/** Do alvo e, na falta, do TSE. */
function doAlvoOuTse(dep: any, tse: any, campo: string): unknown {
	return dep[campo] || tse?.[campo] || null;
}

function argumentosDaContagem(inv: Investigacao) {
	const { dep, tse } = inv;
	return {
		p_nome: dep.nome.toLowerCase().trim(),
		p_id_politico: String(dep.id || ""),
		p_casa: escopo(inv),
		p_ref: inv.p.refParam || null,
		p_partido: doAlvoOuTse(dep, tse, "partido"),
		p_uf: doAlvoOuTse(dep, tse, "uf"),
		p_cargo: inv.perfil.cargoDisplay || null,
		p_foto_url: doAlvoOuTse(dep, tse, "urlFoto"),
	};
}

/** Dashboard "Mais investigados". Silencioso — contagem é telemetria, não deve travar investigação. */
export async function contarPesquisa(inv: Investigacao): Promise<void> {
	try {
		await supabaseAdmin.rpc("incrementar_pesquisa", argumentosDaContagem(inv));
	} catch (_e) {
		// Silencioso
	}
}

/** Foto parcial a cada 5 despesas complexas processadas (a linha já existe). */
export async function gravarFotoParcial(inv: Investigacao, i: number): Promise<void> {
	if (!(i > 0 && i % 5 === 0 && inv.dbSearchId && !inv.isDev)) return;
	try {
		await supabaseAdmin
			.from("pesquisas")
			.update({ grafo_dados: { timestamp: new Date().toISOString(), nodes: inv.nos, escopo: escopo(inv), partial: true } })
			.eq("id", inv.dbSearchId);
	} catch (_e) {}
}

function grafoFinal(inv: Investigacao) {
	return { timestamp: new Date().toISOString(), nodes: inv.nos, etapas: inv.nos.etapas, escopo: escopo(inv), final: true };
}

async function gravar(inv: Investigacao): Promise<void> {
	if (inv.dbSearchId) {
		const { error } = await supabaseAdmin.from("pesquisas").update({ grafo_dados: grafoFinal(inv) }).eq("id", inv.dbSearchId);
		if (error) console.error("[Supabase Update Error]", error);
		return;
	}
	const cpfRaiz = inv.nos.find((n) => n.type === "PESSOA")?.data?.cpf?.replace(/\D/g, "") || null;
	const { error } = await supabaseAdmin
		.from("pesquisas")
		.upsert({ termo_busca: inv.chaveCache, cpf_raiz: cpfRaiz, grafo_dados: grafoFinal(inv) }, { onConflict: "termo_busca" });
	if (error) console.error("[Supabase Error]", error);
}

export async function gravarDossieFinal(inv: Investigacao): Promise<void> {
	try {
		status(inv, "Sincronizando log final com a base de inteligência...");
		if (inv.isDev) {
			console.log("[Supabase Skipping] Ambiente de desenvolvimento detectado. Sincronização com base de inteligência desativada.");
			return;
		}
		await gravar(inv);
	} catch (e) {
		console.error("[Supabase Catch Error]", e);
	}
}
