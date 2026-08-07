import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2';
const BATCH_SIZE = 100;

async function fetchJson(url: string) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    console.log("[PRODUCAO LEGISLATIVA SYNC] Iniciando sincronização...");
    const anoAtual = new Date().getFullYear();
    
    try {
        console.log("[PRODUCAO LEGISLATIVA SYNC] Buscando lista de deputados...");
        const depsReq = await fetchJson(`${API_BASE}/deputados`);
        const deputados = depsReq.dados || [];
        console.log(`[PRODUCAO LEGISLATIVA SYNC] Encontrados ${deputados.length} deputados.`);

        let count = 0;
        for (const dep of deputados) {
            count++;
            console.log(`[${count}/${deputados.length}] Buscando proposições do deputado ID ${dep.id} (${dep.nome})...`);
            
            // Buscar proposições de todo o mandato atual (57ª Legislatura - a partir de 2023)
            let anosQuery = '';
            for (let ano = 2023; ano <= anoAtual; ano++) {
                anosQuery += `&ano=${ano}`;
            }
            const urlProposicoes = `${API_BASE}/proposicoes?idDeputadoAutor=${dep.id}${anosQuery}&itens=100&ordem=DESC&ordenarPor=ano`;
            
            try {
                const data = await fetchJson(urlProposicoes);
                const proposicoes = data?.dados || [];
                
                if (proposicoes.length > 0) {
                    const payload = [];

                    for (const prop of proposicoes) {
                        // Buscar detalhes para pegar ementa e texto integral
                        // Texto integral está disponível em outro endpoint ou arquivo, mas geralmente o link/texto vem nos detalhes
                        let ementa = prop.ementa || "";
                        let texto_integral = null;

                        try {
                            const detalhe = await fetchJson(`${API_BASE}/proposicoes/${prop.id}`);
                            if (detalhe && detalhe.dados) {
                                ementa = detalhe.dados.ementa || ementa;
                                const urlInteiroTeor = detalhe.dados.urlInteiroTeor;
                                // Para o texto integral verdadeiro, a Câmara disponibiliza PDF.
                                // Como PDF exige parseamento pesado, salvaremos o URL do inteiro teor
                                // para visualização ou para que o agente de IA acesse depois via scraper.
                                texto_integral = urlInteiroTeor || null;
                            }
                        } catch(e) {
                            // ignore detalhe fail
                        }

                        payload.push({
                            id_deputado: dep.id,
                            id_proposicao: String(prop.id),
                            tipo: prop.siglaTipo,
                            numero: prop.numero,
                            ano: prop.ano,
                            titulo: `${prop.siglaTipo} ${prop.numero}/${prop.ano}`,
                            ementa: ementa,
                            texto_integral: texto_integral,
                            data_apresentacao: prop.dataApresentacao
                        });
                        
                        await delay(200); // Rate limit detalhe
                    }

                    const { error } = await supabaseAdmin.from('camara_producao_legislativa').upsert(
                        payload,
                        { onConflict: 'id_deputado,id_proposicao' }
                    );

                    if (error) {
                        console.error(`  - Erro ao salvar producao:`, error.message);
                    } else {
                        console.log(`  - Salvas ${payload.length} proposições.`);
                    }
                }
            } catch (err: any) {
                console.error(`  - Erro ao buscar proposições do deputado ${dep.id}:`, err.message);
            }

            await delay(500); 
        }

        console.log("[PRODUCAO LEGISLATIVA SYNC] Finalizado com sucesso!");
    } catch (error) {
        console.error("[PRODUCAO LEGISLATIVA SYNC] Erro fatal:", error);
        process.exit(1);
    }
}

run();
