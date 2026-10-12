/**
 * Deep OSINT da pessoa, para todas as alçadas: jurisprudência dos TCEs do Pará e do
 * Tocantins pelo nome, aviso de sanção na CGU, repasses e contratos federais, cartão
 * corporativo (CPGF) e viagens a serviço (FAB/diárias).
 */
import { buscarAcordaosTcePA } from "@/app/api/investigar/estados/pa/tce";
import { buscarProcessosTceTo } from "@/app/api/investigar/estados/to/tce";
import { buscarCartaoCorporativo, buscarReceitasFederais, buscarViagensFAB } from "@/app/api/investigar/scrapers/osint-fiscal";
import { type Investigacao, naMalha, status } from "./contexto";

async function tcePara(inv: Investigacao): Promise<void> {
	status(inv, "Alvo do Pará detectado. Realizando scraping de Jurisprudência no TCE-PA...");
	const acordaos = await buscarAcordaosTcePA(inv.dep.nome);
	if (acordaos.length === 0) return;
	status(inv, `[TCE-PA] Foram encontrados ${acordaos.length} Acórdão(s)/Processo(s) atrelados ao nome do político.`);
	acordaos.forEach((acordao, i) => {
		naMalha(inv, {
			id: `acordao-pa-${Date.now()}-${i}`,
			type: "PROCESSO_JUDICIAL",
			_origemId: inv.pessoaId,
			data: { label: acordao.titulo, resumo: acordao.resumo, data: acordao.dataPublicacao, url: acordao.url, ementa: acordao.ementa, tribunal: "TCE-PA" },
		});
	});
}

async function tceTocantins(inv: Investigacao): Promise<void> {
	status(inv, "Alvo de Tocantins detectado. Vasculhando processos no TCE-TO (e-Contas)...");
	const processos = await buscarProcessosTceTo(inv.dep.nome);
	if (processos.length === 0) return;
	status(inv, `[TCE-TO] ${processos.length} processos de contas/denúncia detectados.`);
	processos.forEach((proc, i) => {
		naMalha(inv, {
			id: `processo-to-${Date.now()}-${i}`,
			type: "PROCESSO_JUDICIAL",
			_origemId: inv.pessoaId,
			data: {
				label: proc.numero_processo,
				resumo: proc.assunto,
				tribunal: "TCE-TO",
				ano: proc.ano,
				motivo_ia: `Processo de ${proc.assunto} referente ao ano de ${proc.ano}. Relator: ${proc.relator}.`,
			},
		});
	});
}

/** A.5. Jurisprudência nativa dos TCEs (PA e TO) e alerta de sanção da CGU (ficha do topo). */
export async function tribunaisDeContas(inv: Investigacao): Promise<void> {
	if (inv.dep.uf === "PA") await tcePara(inv);
	if (inv.dep.uf === "TO") await tceTocantins(inv);
	if (inv.ficha.sancoesCgu) {
		status(inv, "[ALERTA MÁXIMO] O CPF do político consta no Cadastro de Inidôneos/Sancionados da CGU!");
	}
}

/** B, B2 e B3: repasses/contratos federais, cartão corporativo e viagens a serviço. */
export async function osintFederalDaPessoa(inv: Investigacao): Promise<void> {
	const cpf = inv.cpf ?? "";
	status(inv, "Vasculhando repasses diretos e contratos federais ao político na CGU...");
	await buscarReceitasFederais(cpf, inv.pessoaId, inv.sendEvent);
	status(inv, "Analisando faturas de Cartão de Pagamento do Governo Federal (CPGF)...");
	await buscarCartaoCorporativo(cpf, inv.pessoaId, inv.sendEvent, inv.dep.casa);
	status(inv, "Rastreando Viagens a Serviço e Voos da FAB financiados com recursos públicos...");
	await buscarViagensFAB(cpf, inv.pessoaId, inv.sendEvent, inv.dep.casa);
}
