import { buscarMunicipalSP, buscarDespesasVereadorSP } from '../estados/sp/tce';
import { buscarMunicipalRJ, buscarDespesasVereadorRJ } from '../estados/rj/tce';
import { buscarMunicipalPE, buscarDespesasMunicipalPE } from '../estados/pe/tce';
import { buscarMunicipalCE, buscarDespesasMunicipalCE } from '../estados/ce/tce';
import { buscarDespesasES } from '../estados/es/tce';
import { buscarDespesasPI } from '../estados/pi/tce';
import { buscarAcordaosTcePA, buscarDespesasPA } from '../estados/pa/tce';
import { buscarDespesasRN } from '../estados/rn/tce';
import { buscarCpfNoTSE } from '../tse';
import { buscarProxyOsint } from '../proxy_osint';
import { buscarMunicipalRS, buscarDespesasMunicipalRS } from '../estados/rs/tce';
import { buscarMunicipalSC, buscarDespesasMunicipalSC } from '../estados/sc/tce';
import { buscarDespesasMunicipalPB } from '../estados/pb/tce';
import { buscarDespesasTO } from '../estados/to/tce';

/**
 * Orquestrador Geográfico: Decide para qual Tribunal de Contas (TCE) 
 * enviar a varredura do político baseado no ufScope ("sp", "pe", "ce").
 */
export async function buscarMunicipalMestre(uf: string, nomeBuscado: string) {
    const estado = uf.toUpperCase();
    console.log(`[>> MUNICIPAL MASTER ROUTER] Direcionando busca para a malha municipal do Estado: ${estado}`);

    switch (estado) {
        case 'SP': return await buscarMunicipalSP(nomeBuscado);
        case 'RJ': return await buscarMunicipalRJ(nomeBuscado);
        case 'PE': return await buscarMunicipalPE(nomeBuscado);
        case 'CE': return await buscarMunicipalCE(nomeBuscado);
        case 'RS': return await buscarMunicipalRS(nomeBuscado);
        case 'SC': return await buscarMunicipalSC(nomeBuscado);
        case 'PB':
        case 'PI':
        case 'PA':
        case 'RN':
        case 'ES':
        case 'TO':
            return await buscarMunicipalGenericoTSE(estado, nomeBuscado);
        default:
            console.warn(`[!] TCE do estado ${estado} não reconhecido no Polígrafo OSINT.`);
            return [];
    }
}

/**
 * Motor Genérico TSE
 * Puxa Prefeitos e Vereadores para os estados sem extrator específico construído.
 */
async function buscarMunicipalGenericoTSE(uf: string, nomeBuscado: string) {
    const termo = nomeBuscado.toLowerCase().trim();
    const resultados: any[] = [];
    
    let tseResult = await buscarCpfNoTSE(termo, uf, "13"); // Vereador
    let tipoCargo: "CAMARA_MUNICIPAL" | "PREFEITURA" = "CAMARA_MUNICIPAL";
    let tituloCargo = "Vereador";

    if (!tseResult) {
        tseResult = await buscarCpfNoTSE(termo, uf, "11"); // Prefeito
        if (tseResult) {
            tipoCargo = "PREFEITURA";
            tituloCargo = "Prefeito";
        }
    }

    if (tseResult) {
        const nomeCompleto = tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
        const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
        const nomeExibicao = (nomeUrna && nomeUrna !== nomeCompleto)
            ? `${nomeCompleto} (${nomeUrna})`
            : nomeCompleto;
        resultados.push({
            ref: `${uf}:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
            id: tseResult.documentoPrincipal,
            nome: nomeExibicao,
            cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, ' ').toUpperCase()}`,
            uf: uf,
            isCnpj: tseResult.isCnpj,
            casa: tipoCargo,
            uri: tseResult.municipio
        });
    }

    return resultados;
}

/**
 * Orquestrador Geográfico: Despesas. 
 * Re-roteia despesas para o respectivo estado caso a casa legislativa exija parse nativo do TCE.
 */
export async function buscarDespesasMunicipalMestre(uf: string, identificador: string, nomeParaBusca?: string, municipioUri?: string, casa?: string) {
    const estado = uf.toUpperCase();

    switch (estado) {
        case 'SP': return await buscarDespesasVereadorSP(identificador, nomeParaBusca || "");
        case 'RJ': return await buscarDespesasVereadorRJ(identificador, nomeParaBusca, municipioUri, casa);
        case 'PE': return await buscarDespesasMunicipalPE(identificador, nomeParaBusca, municipioUri, casa);
        case 'CE': return await buscarDespesasMunicipalCE(identificador, nomeParaBusca, municipioUri, casa);
        case 'ES':
            if (municipioUri) return await buscarDespesasES(municipioUri, casa || 'PREFEITURA');
            console.log(`[TCE-ES] Sem URI geográfica. Redirecionando para Proxy OSINT.`);
            const esProxy = await buscarProxyOsint(identificador, nomeParaBusca);
            return esProxy.despesasFederais;
        case 'PI':
            if (municipioUri) return await buscarDespesasPI(municipioUri, casa || 'PREFEITURA');
            console.log(`[TCE-PI] Sem URI geográfica. Redirecionando para Proxy OSINT.`);
            const piProxy = await buscarProxyOsint(identificador, nomeParaBusca);
            return piProxy.despesasFederais;
        case 'PA':
            if (municipioUri) return await buscarDespesasPA(identificador, municipioUri, nomeParaBusca);
            console.log(`[TCE-PA] Sem URI geográfica. Redirecionando para Proxy OSINT.`);
            const paProxy = await buscarProxyOsint(identificador, nomeParaBusca);
            return paProxy.despesasFederais;
        case 'RN':
            if (municipioUri) return await buscarDespesasRN(municipioUri, casa || 'PREFEITURA');
            console.log(`[TCE-RN] Sem URI geográfica. Redirecionando para Proxy OSINT.`);
            const rnProxy = await buscarProxyOsint(identificador, nomeParaBusca);
            return rnProxy.despesasFederais;
        case 'RS': return await buscarDespesasMunicipalRS(identificador, nomeParaBusca, municipioUri, casa);
        case 'SC': return await buscarDespesasMunicipalSC(identificador, nomeParaBusca, municipioUri, casa);
        case 'PB': return await buscarDespesasMunicipalPB(identificador, nomeParaBusca, municipioUri, casa);
        case 'TO':
            const despesasTO = await buscarDespesasTO(identificador, nomeParaBusca);
            if (despesasTO.length > 0) return despesasTO;
            console.log(`[TCE-TO] Sem despesas nativas, fallback para Proxy OSINT Federal.`);
            const proxyResultTO = await buscarProxyOsint(identificador, nomeParaBusca);
            return proxyResultTO.despesasFederais;
        default:
            console.warn(`[!] Motor de Despesas do TCE-${estado} não está mapeado.`);
            return [];
    }
}
