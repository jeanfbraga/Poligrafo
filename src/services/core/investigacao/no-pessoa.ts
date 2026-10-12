/**
 * Nó PESSOA do investigado: identidade, patrimônio (ficha → TSE), foto e partido.
 * Os alertas da ficha são o MESMO array: o que a investigação acrescentar depois
 * (ex.: SICONFI) também aparece no nó guardado no cache.
 */
import { documentoValido } from "@/lib/documento";
import { declaracoesDoPolitico, type NoEmpresaDeclarada, nosDasEmpresasDeclaradas } from "@/services/core/empresas-declaradas";
import { nomesDeReferencia } from "@/services/core/socio-confirmacao";
import { type Investigacao, naTela, status } from "./contexto";

/** Como antes: valor "verdadeiro" e maior que zero (o banco às vezes devolve texto numérico). */
function positivo(v: any): boolean {
	return Boolean(v && v > 0);
}

function patrimonio(ficha: any, tse: any): number {
	if (positivo(ficha.patrimonioTotal)) return ficha.patrimonioTotal;
	if (positivo(tse?.patrimonioTotal)) return tse.patrimonioTotal;
	return ficha.patrimonioTotal ?? tse?.patrimonioTotal ?? 0;
}

function listaOu(daFicha: any, doTse: any): any {
	if (daFicha && daFicha.length > 0) return daFicha;
	return doTse || [];
}

function dadosDoPatrimonio(ficha: any, tse: any) {
	return {
		patrimonio: patrimonio(ficha, tse),
		anoPatrimonio: ficha.anoPatrimonio || tse?.anoEleicao || undefined,
		patrimonioAnterior: ficha.patrimonioAnterior ?? tse?.patrimonioAnterior,
		anoPatrimonioAnterior: ficha.anoPatrimonioAnterior || tse?.anoPatrimonioAnterior,
		variacaoPatrimonio: ficha.variacaoPatrimonio ?? tse?.variacaoPatrimonio,
		variacaoPatrimonioPercentual: ficha.variacaoPatrimonioPercentual ?? tse?.variacaoPatrimonioPercentual,
		historicoPatrimonio: listaOu(ficha.historicoPatrimonio, tse?.historicoPatrimonio),
		bensDeclarados: listaOu(ficha.bensDeclarados, tse?.bensDeclarados),
	};
}

function documento(inv: Investigacao) {
	const valido = documentoValido(inv.cpf) ? inv.cpf : undefined;
	// O frontend formata com regex de acordo com isCnpj.
	return { cpf: valido, documentoPrincipal: valido, isCnpj: inv.documentoIsCnpj };
}

function identificacaoVisual(dep: any) {
	return {
		urlFoto: dep.urlFoto || dep._tseResult?.urlFoto,
		partido: dep.partido || dep._tseResult?.partido,
	};
}

export function montarNoPessoa(inv: Investigacao) {
	const { dep, ficha, identidade } = inv;
	return {
		id: inv.pessoaId,
		type: "PESSOA",
		data: {
			label: dep.nome,
			nomeCivil: inv.detalhes?.nomeCivil || dep.nome,
			...documento(inv),
			uf: dep.uf,
			cargo: inv.perfil.cargoDisplay,
			idLegislatura: dep.idLegislatura,
			casa: dep.casa,
			...dadosDoPatrimonio(ficha, inv.tse),
			alertasPessoais: ficha.alertasPessoais,
			afastamento: dep.afastamento,
			...identificacaoVisual(dep),
			idPoliticoOriginal: dep.id,
			identidade: {
				confianca: identidade.confianca,
				evidencias: identidade.evidencias,
				conflitos: identidade.conflitos,
				sqCandidato: identidade.sqCandidato,
			},
		},
	};
}

/**
 * Emite o nó PESSOA e começa, em paralelo, a conferência das empresas declaradas ao TSE
 * (Receita + QSA; empresas-declaradas.ts), aguardada junto da malha societária.
 */
export function emitirPessoa(inv: Investigacao): { no: ReturnType<typeof montarNoPessoa>; empresasDeclaradas: Promise<NoEmpresaDeclarada[]> } {
	if (inv.documentoIsCnpj && inv.ficha.patrimonioTotal === 0) {
		inv.ficha.alertasPessoais.push("[LGPD] Patrimônio pessoal oculto no TSE (Apenas CNPJ de Campanha disponível).");
	}
	const no = montarNoPessoa(inv);
	naTela(inv, no);
	const empresasDeclaradas = nosDasEmpresasDeclaradas({
		declaracoes: declaracoesDoPolitico(no.data),
		pessoaId: inv.pessoaId,
		referencia: {
			nomes: nomesDeReferencia([inv.detalhes?.nomeCivil, inv.tse?.nome, inv.tse?.nomeUrna, inv.dep.nome]),
			cpf: inv.identidade.cpf,
		},
		status: (msg) => status(inv, msg),
	});
	return { no, empresasDeclaradas };
}
