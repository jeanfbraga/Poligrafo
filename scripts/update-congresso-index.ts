import * as fs from 'fs';
import * as path from 'path';

interface PoliticoIndex {
    id: string;
    nome: string;
    uf: string;
    partido: string;
    casa: 'CAMARA' | 'SENADO' | 'GOVERNO_ESTADUAL';
}

const INDEX_FILE_PATH = path.join(__dirname, '../src/services/integrations/data/congresso-index.json');

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

async function coletarDeputados(): Promise<PoliticoIndex[]> {
    const deputadosList: PoliticoIndex[] = [];
    const urlCamara = (pagina: number) =>
        `https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=57&ordem=ASC&ordenarPor=nome&itens=100&pagina=${pagina}`;
    try {
        let pagina = 1;
        while (pagina <= 20) {
            const dataCamara = await fetchWithRetry(urlCamara(pagina));
            const deputados = dataCamara.dados || [];
            for (const dep of deputados) {
                deputadosList.push({
                    id: String(dep.id),
                    nome: dep.nome,
                    uf: dep.siglaUf,
                    partido: dep.siglaPartido,
                    casa: 'CAMARA'
                });
            }
            if (deputados.length < 100) break;
            pagina++;
        }
        console.log(`✅ Câmara: ${deputadosList.length} deputados obtidos (legislatura 57 completa).`);
    } catch (e: any) {
        console.error("❌ Erro fatal ao buscar dados da Câmara:", e.message);
    }
    return deputadosList;
}

async function coletarSenadores(): Promise<PoliticoIndex[]> {
    const senadoresList: PoliticoIndex[] = [];
    const urlSenado = 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual';
    try {
        const dataSenado = await fetchWithRetry(urlSenado);
        const senadores = dataSenado?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
        const list = Array.isArray(senadores) ? senadores : [senadores];
        for (const sen of list) {
            const ident = sen.IdentificacaoParlamentar;
            if (!ident) continue;
            senadoresList.push({
                id: String(ident.CodigoParlamentar),
                nome: ident.NomeParlamentar,
                uf: ident.UfParlamentar,
                partido: ident.SiglaPartidoParlamentar,
                casa: 'SENADO'
            });
        }
        console.log(`✅ Senado: ${senadoresList.length} senadores obtidos.`);
    } catch (e: any) {
        console.error("❌ Erro fatal ao buscar dados do Senado:", e.message);
    }
    return senadoresList;
}

async function coletarGovernadores(): Promise<PoliticoIndex[]> {
    const govList: PoliticoIndex[] = [];
    const urlGov = "https://raw.githubusercontent.com/GusFurtado/dab_assets/main/data/governadores.json";
    try {
        let rawGov = await fetchWithRetry(urlGov);
        if (typeof rawGov === 'string') rawGov = JSON.parse(rawGov);
        for (const [estado, info] of Object.entries(rawGov)) {
            const uf = ESTADO_PARA_UF[estado];
            const govInfo = info as any;
            if (uf && govInfo?.nome) {
                govList.push({
                    id: govInfo.nome,
                    nome: govInfo.nome,
                    uf: uf,
                    partido: govInfo.partido_sigla || govInfo.partido || "N/A",
                    casa: 'GOVERNO_ESTADUAL'
                });
            }
        }
        console.log(`✅ Governadores: ${govList.length} governadores obtidos.`);
    } catch (e: any) {
        console.error("❌ Erro ao buscar dados de Governadores:", e.message);
    }
    return govList;
}

function salvarIndice(index: PoliticoIndex[]) {
    if (index.length <= 500) {
        console.error("\n⚠️ A extração retornou menos de 500 registros. Abortando gravação para não corromper o arquivo atual.");
        process.exit(1);
    }

    const unicos = [...new Map(index.map((p) => [p.id, p])).values()];
    console.log(`ℹ️  Deduplicados por id: ${index.length} -> ${unicos.length} registros.`);
    fs.writeFileSync(INDEX_FILE_PATH, JSON.stringify(unicos, null, 2), 'utf-8');
    console.log(`\n🎉 Sucesso! Index atualizado com ${unicos.length} parlamentares/governadores.`);
    console.log(`📍 Arquivo gravado em: ${INDEX_FILE_PATH}`);

    const trovao = unicos.find(p => p.nome.toLowerCase().includes('trovão'));
    if (trovao) {
        console.log(`⚡ Zé Trovão foi encontrado no index novo! ID: ${trovao.id}`);
    } else {
        console.log(`⚠️ Zé Trovão ainda não encontrado. Talvez o nome dele seja diferente na Câmara?`);
    }
}

async function updateCongressoIndex() {
    console.log("=== INICIANDO ATUALIZAÇÃO DO CONGRESSO INDEX ===");
    const deputados = await coletarDeputados();
    const senadores = await coletarSenadores();
    const governadores = await coletarGovernadores();
    const index = [...deputados, ...senadores, ...governadores];
    salvarIndice(index);
}

updateCongressoIndex();
