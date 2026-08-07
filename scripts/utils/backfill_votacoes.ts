import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/jeanf/Documents/Projetos/Polígrafo/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL, process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY);
const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";

async function fetchJson(url) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

async function run() {
    const { data: rows } = await supabase.from('camara_votacoes_master').select('*').is('id_proposicao', null);
    if (!rows) return;
    
    console.log(`Encontradas ${rows.length} votações sem id_proposicao para atualizar.`);
    
    for (const row of rows) {
        console.log(`Atualizando ${row.id_votacao}...`);
        try {
            const votDetalheReq = await fetchJson(`${API_BASE}/votacoes/${row.id_votacao}`);
            if (votDetalheReq && votDetalheReq.dados) {
                const dados = votDetalheReq.dados;
                let projeto_nome = row.projeto_nome;
                let projeto_tema = row.projeto_tema;
                let id_proposicao = null;
                
                if (dados.proposicao) {
                    const prop = dados.proposicao;
                    projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano}`;
                    projeto_tema = prop.ementa || projeto_tema;
                    id_proposicao = prop.id;
                } else if (dados.proposicoesAfetadas && dados.proposicoesAfetadas.length > 0) {
                    const prop = dados.proposicoesAfetadas[0];
                    const descCurta = row.projeto_nome ? row.projeto_nome.split(/\.\s*Sim:/i)[0] : "";
                    projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano} - ${descCurta}`;
                    projeto_tema = prop.ementa || projeto_tema;
                    id_proposicao = prop.id;
                } else if (dados.objetosPossiveis && dados.objetosPossiveis.length > 0) {
                    const prop = dados.objetosPossiveis[0];
                    const descCurta = row.projeto_nome ? row.projeto_nome.split(/\.\s*Sim:/i)[0] : "";
                    projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano} - ${descCurta}`;
                    projeto_tema = prop.ementa || projeto_tema;
                    id_proposicao = prop.id;
                }
                
                if (id_proposicao) {
                    await supabase.from('camara_votacoes_master').update({
                        projeto_nome,
                        projeto_tema,
                        id_proposicao
                    }).eq('id_votacao', row.id_votacao);
                    console.log(`  -> Sucesso: ${projeto_nome} (${id_proposicao})`);
                } else {
                    await supabase.from('camara_votacoes_master').update({
                        projeto_nome: row.projeto_nome.split(/\.\s*Sim:/i)[0]
                    }).eq('id_votacao', row.id_votacao);
                    console.log(`  -> Sem proposição atrelada.`);
                }
            }
        } catch(e) {
            console.error(`Erro no id ${row.id_votacao}:`, e);
        }
        await new Promise(r => setTimeout(r, 200));
    }
}

run();
