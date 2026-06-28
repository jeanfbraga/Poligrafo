import * as fs from 'fs';
import * as path from 'path';

interface PoliticoIndex {
    id: string;
    nome: string;
    uf: string;
    partido: string;
    casa: 'CAMARA' | 'SENADO' | 'GOVERNO_ESTADUAL';
}

const INDEX_FILE_PATH = path.join(__dirname, '../lib/data/congresso-index.json');

const ESTADO_PARA_UF: Record<string, string> = {
    "Acre": "AC",
    "Alagoas": "AL",
    "Amazonas": "AM",
    "Amapá": "AP",
    "Bahia": "BA",
    "Ceará": "CE",
    "Distrito Federal": "DF",
    "Espírito Santo": "ES",
    "Goiás": "GO",
    "Maranhão": "MA",
    "Mato Grosso": "MT",
    "Mato Grosso do Sul": "MS",
    "Minas Gerais": "MG",
    "Pará": "PA",
    "Paraíba": "PB",
    "Paraná": "PR",
    "Pernambuco": "PE",
    "Piauí": "PI",
    "Rio de Janeiro": "RJ",
    "Rio Grande do Norte": "RN",
    "Rio Grande do Sul": "RS",
    "Rondônia": "RO",
    "Roraima": "RR",
    "São Paulo": "SP",
    "Santa Catarina": "SC",
    "Sergipe": "SE",
    "Tocantins": "TO"
};

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`[HTTP] Fetching ${url}... (Attempt ${i + 1}/${retries})`);
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(15000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e: any) {
            console.warn(`[HTTP] Error on attempt ${i + 1}: ${e.message}`);
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

async function updateCongressoIndex() {
    console.log("=== INICIANDO ATUALIZAÇÃO DO CONGRESSO INDEX ===");
    const index: PoliticoIndex[] = [];

    // 1. Deputados Federais (Câmara)
    const urlCamara = 'https://dadosabertos.camara.leg.br/api/v2/deputados';
    try {
        const dataCamara = await fetchWithRetry(urlCamara);
        const deputados = dataCamara.dados || [];
        for (const dep of deputados) {
            index.push({
                id: String(dep.id),
                nome: dep.nome,
                uf: dep.siglaUf,
                partido: dep.siglaPartido,
                casa: 'CAMARA'
            });
        }
        console.log(`✅ Câmara: ${deputados.length} deputados obtidos.`);
    } catch (e: any) {
        console.error("❌ Erro fatal ao buscar dados da Câmara:", e.message);
    }

    // 2. Senadores (Senado)
    const urlSenado = 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual';
    try {
        const dataSenado = await fetchWithRetry(urlSenado);
        const senadores = dataSenado?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
        const list = Array.isArray(senadores) ? senadores : [senadores];
        
        let count = 0;
        for (const sen of list) {
            const ident = sen.IdentificacaoParlamentar;
            if (!ident) continue;
            index.push({
                id: String(ident.CodigoParlamentar),
                nome: ident.NomeParlamentar,
                uf: ident.UfParlamentar,
                partido: ident.SiglaPartidoParlamentar,
                casa: 'SENADO'
            });
            count++;
        }
        console.log(`✅ Senado: ${count} senadores obtidos.`);
    } catch (e: any) {
        console.error("❌ Erro fatal ao buscar dados do Senado:", e.message);
    }

    // 3. Governadores (DAB Assets)
    const urlGov = "https://raw.githubusercontent.com/GusFurtado/dab_assets/main/data/governadores.json";
    try {
        let rawGov = await fetchWithRetry(urlGov);
        // Algumas vezes o JSON do upstream vem stringified duas vezes
        if (typeof rawGov === 'string') {
            rawGov = JSON.parse(rawGov);
        }

        let govCount = 0;
        for (const [estado, info] of Object.entries(rawGov)) {
            const uf = ESTADO_PARA_UF[estado];
            const govInfo = info as any;
            if (uf && govInfo?.nome) {
                index.push({
                    id: govInfo.nome,
                    nome: govInfo.nome,
                    uf: uf,
                    partido: govInfo.partido_sigla || govInfo.partido || "N/A",
                    casa: 'GOVERNO_ESTADUAL'
                });
                govCount++;
            }
        }
        console.log(`✅ Governadores: ${govCount} governadores obtidos.`);
    } catch (e: any) {
        console.error("❌ Erro ao buscar dados de Governadores:", e.message);
    }

    if (index.length > 500) {
        fs.writeFileSync(INDEX_FILE_PATH, JSON.stringify(index, null, 2), 'utf-8');
        console.log(`\n🎉 Sucesso! Index atualizado com ${index.length} parlamentares/governadores.`);
        console.log(`📍 Arquivo gravado em: ${INDEX_FILE_PATH}`);
        
        const trovao = index.find(p => p.nome.toLowerCase().includes('trovão'));
        if (trovao) {
            console.log(`⚡ Zé Trovão foi encontrado no index novo! ID: ${trovao.id}`);
        } else {
            console.log(`⚠️ Zé Trovão ainda não encontrado. Talvez o nome dele seja diferente na Câmara?`);
        }
    } else {
        console.error("\n⚠️ A extração retornou menos de 500 registros. Abortando gravação para não corromper o arquivo atual.");
        process.exit(1);
    }
}

updateCongressoIndex();
