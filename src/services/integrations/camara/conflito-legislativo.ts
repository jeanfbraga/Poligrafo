import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export interface ConflitoLegislativoMatch {
	idVotacao: string;
	projetoNome: string;
	projetoTema: string;
	voto: string;
	dataVotacao?: string;
	doadorRelacionado: string;
	motivoConflito: string;
}

const TEMAS_SETORIAIS: Record<string, RegExp> = {
	"AGRONEGÓCIO": /AGRO|RURAL|FAZENDA|DEFENSIVO|SOJA|PECUARIA|GRAOS|FLORESTAL/i,
	"TRANSPORTES": /TRANSPORTE|RODOVIAR|LOGISTICA|FROTA|ONIBUS|CARGAS|COMBUSTIVEL/i,
	"SAÚDE / FARMA": /SAUDE|MEDICAMENTO|HOSPITAL|FARMAC|LABORATORIO|CLINICA/i,
	"TRIBUTÁRIO / FISCAL": /TRIBUT|IMPOSTO|ISENCAO|SUBSIDIO|INCENTIVO|DESONERACAO/i,
	"MINERAÇÃO & ENERGIA": /MINERAC|ENERGIA|SOLAR|ELETRIC|PETROLEO|GAS|EOLICA/i,
	"FINANCEIRO & CRÉDITO": /BANCO|CREDITO|FINANCEIR|INVESTIMENTO|FUNDO|FACTORING/i,
	"SEGURANÇA & DEFESA": /ARMAS|TIRO|DEFESA|SEGURANCA|MUNIC|VIGILANCIA/i,
};

function identificarTemaDoador(nomeDoador: string): string | null {
	for (const [tema, regex] of Object.entries(TEMAS_SETORIAIS)) {
		if (regex.test(nomeDoador)) {
			return tema;
		}
	}
	return null;
}

/**
 * Cruza o histórico de votações do deputado no Banco de Perfis com a
 * lista de doadores de campanha, detectando potenciais conflitos de interesse.
 */
export async function analisarConflitoVotacoes(
	idDeputado: number,
	doadores: Array<{ nome: string; valor?: number } | string>,
): Promise<ConflitoLegislativoMatch[]> {
	if (!idDeputado || !doadores || doadores.length === 0) return [];

	try {
		// 1. Mapear doadores para setores econômicos identificáveis
		const doadoresSetorizados: Array<{ nome: string; tema: string }> = [];
		for (const d of doadores) {
			const nome = typeof d === "string" ? d : d.nome;
			if (!nome || nome.length < 4) continue;
			const tema = identificarTemaDoador(nome);
			if (tema) {
				doadoresSetorizados.push({ nome, tema });
			}
		}

		if (doadoresSetorizados.length === 0) return [];

		// 2. Buscar votos registrados no banco de perfis
		const { data: votos, error } = await supabasePerfilAdmin
			.from("camara_votos_detalhados")
			.select("id_votacao, voto, camara_votacoes_master (id_proposicao, projeto_nome, projeto_tema, data_votacao)")
			.eq("id_deputado", idDeputado)
			.limit(100);

		if (error || !votos || votos.length === 0) return [];

		// 3. Cruzar votos com temas dos doadores
		const conflitos: ConflitoLegislativoMatch[] = [];

		for (const v of votos) {
			const master: any = v.camara_votacoes_master;
			if (!master) continue;

			const temaProjeto = (master.projeto_tema || master.projeto_nome || "").toUpperCase();
			const votoDep = (v.voto || "").toUpperCase();

			for (const doador of doadoresSetorizados) {
				const regexTema = TEMAS_SETORIAIS[doador.tema];
				if (regexTema && (regexTema.test(temaProjeto) || regexTema.test(master.projeto_nome || ""))) {
					conflitos.push({
						idVotacao: String(v.id_votacao),
						projetoNome: master.projeto_nome || `Votação ${v.id_votacao}`,
						projetoTema: master.projeto_tema || doador.tema,
						voto: votoDep,
						dataVotacao: master.data_votacao,
						doadorRelacionado: doador.nome,
						motivoConflito: `Voto '${votoDep}' em matéria de ${doador.tema} (${master.projeto_nome}) com histórico de financiamento de campanha por '${doador.nome}'.`,
					});
					if (conflitos.length >= 5) break; // Limite de 5 apontamentos principais
				}
			}
			if (conflitos.length >= 5) break;
		}

		return conflitos;
	} catch (err: any) {
		console.warn("[CONFLITO LEGISLATIVO] Erro ao analisar votos:", err.message);
		return [];
	}
}
