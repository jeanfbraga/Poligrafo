import { buscarCpfNoTSE } from '../../tse';
import * as cheerio from 'cheerio';

export async function buscarDeputadoEstadualSP(nomeBuscado: string): Promise<{
    ref: string;
    id: string;
    nome: string;
    cargo: string;
    uf: string;
    casa: "ALESP";
}[]> {
    const termo = nomeBuscado.toLowerCase().trim();
    const resultados: {
        ref: string;
        id: string;
        nome: string;
        cargo: string;
        uf: string;
        casa: "ALESP";
    }[] = [];

    // Busca o CPF no TSE do candidato a Deputado Estadual (Cargo 7) em SP
    const tseResult = await buscarCpfNoTSE(termo, "SP", "7");

    if (tseResult) {
        const nomeCompleto = tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
        const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
        const documento = tseResult.documentoPrincipal || tseResult.cpf;
        const nomeExibicao = (nomeUrna && nomeUrna !== nomeCompleto)
            ? `${nomeCompleto} (${nomeUrna})`
            : nomeCompleto;
        resultados.push({
            // Ref agora carrega NOME e DOCUMENTO separados: ALESP:DEPUTADO_ESTADUAL:{nome}:{documento}
            ref: `ALESP:DEPUTADO_ESTADUAL:${encodeURIComponent(nomeCompleto)}:${documento}`,
            id: nomeCompleto, // O ID é o NOME — o scraper da ALESP filtra por nome
            nome: nomeExibicao,
            cargo: "Deputado Estadual (SP)",
            uf: "SP",
            casa: 'ALESP'
        });
    }

    return resultados;
}

export async function buscarDespesasDeputadoEstadualSP(identificador: string, nomePolitico: string, sendEvent?: any) {
    const matricula = identificador; // A ALESP usa a matrícula, não o CPF para despesas
    const anoAtual = new Date().getFullYear();
    const despesasExtraidas: any[] = [];

    // Na ALESP é melhor iterar os últimos 3 meses na API aberta
    const meses = [2, 3, 4];

    try {
        for (const mes of meses) {
            // Rota documentada da API Oficial de Dados Abertos da ALESP
            const urlAlvo = `https://www.al.sp.gov.br/dados-abertos/despesa/${anoAtual}/${mes}`;

            const response = await fetch(urlAlvo, { signal: AbortSignal.timeout(6000) });
            if (!response.ok) {
                // Notifica que a API caiu em uma das iterações (não quebra tudo, mas alerta)
                if (mes === meses[0] && sendEvent) { // Só manda 1 vez pra não poluir
                    sendEvent('API_WARNING', {
                        fonte: 'Assembleia Legislativa de SP (ALESP)',
                        mensagem: `A API de despesas da ALESP retornou erro HTTP ${response.status}. Gastos de gabinete indisponíveis no momento. Tente novamente mais tarde.`
                    });
                }
                continue;
            }

            const data = await response.json(); // Dependendo do cabeçalho pode vir XML

            // Filtra pelo nome do Deputado
            const notasDoPolitico = data.filter((d: any) => {
                return (d.Deputado || '').toLowerCase() === nomePolitico.toLowerCase();
            });

            const formatado = notasDoPolitico.map((d: any) => ({
                cnpjCpfFornecedor: d.CNPJ ? d.CNPJ.replace(/\D/g, '') : "00000000000000",
                nomeFornecedor: d.Fornecedor || "Fornecedor ALESP",
                tipoDespesa: d.Tipo || 'Verba Indenizatória / Gabinete',
                valorDocumento: parseFloat(d.Valor) || 0,
                dataDocumento: `${anoAtual}-${String(mes).padStart(2, '0')}-01`,
                urlDocumento: urlAlvo
            }));

            despesasExtraidas.push(...formatado);
        }
        
        return despesasExtraidas.slice(0, 80);
    } catch (error: any) {
        console.error(`[ESTADUAL SP] Falha na API Aberta ALESP: ${error?.message}`);
        if (sendEvent) {
            sendEvent('API_WARNING', {
                fonte: 'Assembleia Legislativa de SP (ALESP)',
                mensagem: 'O servidor da AL-SP recusou a conexão ou deu timeout. Tente novamente mais tarde.'
            });
        }
        return [];
    }
}
