/**
 * Empresas ligadas ao político: as do CPF (Receita), as declaradas ao TSE (conferidas em
 * empresas-declaradas.ts) e a busca reversa pelo nome, que só aceita empresa com o político
 * no QSA (socio-confirmacao.ts, proteção anti-homônimo). Depois, contratos e convênios
 * federais de cada uma. Devolve os CNPJs ligados ao político (usados até o fim do pipe).
 */
import { buscarReceitasFederais } from "@/app/api/investigar/scrapers/osint-fiscal";
import { buscarConveniosTransferegov } from "@/app/api/investigar/scrapers/osint-contratos";
import { expandirMalhaSocietaria } from "@/app/api/investigar/scrapers/osint-societario";
import type { NoEmpresaDeclarada } from "@/services/core/empresas-declaradas";
import { nomesDeReferencia, verificarEmpresaDoPolitico } from "@/services/core/socio-confirmacao";
import { type Investigacao, naMalha, status } from "./contexto";

function semDigitos(v: unknown): string {
	return String(v ?? "").replace(/\D/g, "");
}

function juntarDeclaradas(inv: Investigacao, cnpjs: string[], declaradas: NoEmpresaDeclarada[]): void {
	for (const no of declaradas) {
		naMalha(inv, no);
		const cnpj = semDigitos(no.data.cnpj);
		if (cnpj && !cnpjs.includes(cnpj)) cnpjs.push(cnpj);
	}
}

/* ------------------------------ Busca reversa ------------------------------ */

function nomesParaBuscar(inv: Investigacao): string[] {
	const nomes = [inv.dep.nome, inv.detalhes?.nomeCivil, inv.dep.nomeCivil, inv.dep._tseResult?.nome];
	return Array.from(new Set(nomes.filter((n): n is string => Boolean(n && n.trim().length > 3))));
}

async function empresasPeloNome(inv: Investigacao): Promise<any[]> {
	const { buscarEmpresasDoSocio } = await import("@/services/core/socio-search");
	let achadas: any[] = [];
	for (const n of nomesParaBuscar(inv)) {
		const r = await buscarEmpresasDoSocio(n);
		if (r && r.length > 0) achadas = [...achadas, ...r];
	}
	return achadas;
}

function noEmpresaReversa(inv: Investigacao, emp: any, cnpj: string, veredito: { motivo: string; forca?: string }) {
	return {
		id: `empresa-rev-${cnpj}`,
		type: "EMPRESA",
		_origemId: inv.pessoaId,
		data: {
			label: emp.razao_social || "Empresa Localizada",
			cnpj,
			situacao: emp.situacao || "N/I",
			cnae: emp.cnae || "N/I",
			motivo_ia: `Vínculo societário confirmado via QSA: ${veredito.motivo}.`,
			forcaVinculo: veredito.forca,
		},
	};
}

/** A empresa só entra se o QSA confirmar nome e, com CPF confirmado, os 6 dígitos do meio do CPF. */
async function confirmarEmpresa(inv: Investigacao, emp: any, cnpjs: string[], nomesRef: string[]): Promise<boolean> {
	const cnpj = semDigitos(emp?.cnpj);
	if (!emp || !cnpj || cnpjs.includes(cnpj)) return false;
	const veredito = await verificarEmpresaDoPolitico(cnpj, nomesRef, inv.identidade.cpf);
	if (!veredito.confirmado) {
		status(inv, `[OSINT] "${emp.razao_social || cnpj}" descartada: ${veredito.motivo} (proteção anti-homônimo).`);
		return false;
	}
	cnpjs.push(cnpj);
	naMalha(inv, noEmpresaReversa(inv, emp, cnpj, veredito));
	return true;
}

/** C2. Busca reversa por nome — encontra empresas onde o político é sócio. */
async function buscaReversa(inv: Investigacao, cnpjs: string[]): Promise<void> {
	status(inv, `Fazendo busca reversa de empresas vinculadas ao nome "${inv.dep.nome}"...`);
	try {
		const achadas = await empresasPeloNome(inv);
		if (achadas.length === 0) return;
		const nomesRef = nomesDeReferencia([inv.detalhes?.nomeCivil, inv.dep._tseResult?.nome, inv.dep._tseResult?.nomeUrna, inv.dep.nome]);
		let confirmadas = 0;
		for (const emp of achadas) {
			if (await confirmarEmpresa(inv, emp, cnpjs, nomesRef)) confirmadas++;
		}
		if (confirmadas > 0) status(inv, `[OSINT] ${confirmadas} empresa(s) com vínculo societário CONFIRMADO via QSA.`);
	} catch (e) {
		console.warn("[Deep OSINT] Falha na busca reversa por nome:", e);
	}
}

/* ------------------------- Contratos e convênios -------------------------- */

async function conveniosDaEmpresa(inv: Investigacao, cnpj: string): Promise<void> {
	status(inv, `[OSINT] Checando contratos federais para o CNPJ: ${cnpj}`);
	await buscarReceitasFederais(cnpj, `empresa-${cnpj}`, inv.sendEvent);
	const convenios = await buscarConveniosTransferegov(cnpj);
	if (!(convenios && convenios.quantidade > 0)) return;
	status(inv, `[ALTA SUSPEIÇÃO] A empresa privada (${cnpj}) possui ${convenios.quantidade} convênio(s) federal(is) ativos milionários.`);
	naMalha(inv, {
		id: `convenio-${cnpj}-${Date.now()}`,
		type: "CONTRATO",
		_origemId: `empresa-${cnpj}`,
		data: { label: "Convênio Transferegov.br", objeto: `${convenios.quantidade} convênios ativos milionários.`, valor: convenios.valorTotal, codigo: cnpj, ano: "Atual" },
	});
}

/** D. Recebimentos de cada empresa, em paralelo. */
async function contratosDasEmpresas(inv: Investigacao, cnpjs: string[]): Promise<void> {
	if (cnpjs.length === 0) {
		status(inv, "Nenhuma empresa vinculada com contratos federais abertos encontrada (BrasilAPI).");
		return;
	}
	status(inv, `Localizadas ${cnpjs.length} empresa(s). Varrendo base de Convênios do Transferegov para cada uma em paralelo...`);
	await Promise.allSettled(cnpjs.map((cnpj) => conveniosDaEmpresa(inv, cnpj)));
}

/** C, C2 e D. */
export async function malhaSocietaria(inv: Investigacao, declaradas: Promise<NoEmpresaDeclarada[]>): Promise<string[]> {
	status(inv, "Expandindo malha societária via BrasilAPI para rastrear blindagem patrimonial...");
	const cnpjs = await expandirMalhaSocietaria(inv.cpf ?? "", inv.pessoaId, inv.sendEvent);
	juntarDeclaradas(inv, cnpjs, await declaradas);
	await buscaReversa(inv, cnpjs);
	await contratosDasEmpresas(inv, cnpjs);
	return cnpjs;
}
