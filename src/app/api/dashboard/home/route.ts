import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import congressoIndex from '@/services/integrations/data/congresso-index.json';

export const revalidate = 0; // Temporariamente sem cache para dev

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

export async function GET() {
    try {
        const [
            { data: ceapTop10, error: err1 },
            { data: ceapTotal, error: err2 },
            { data: ceapCategorias, error: err3 },
            { data: faltosos, error: err4 },
            { data: votantes, error: err5 },
            { data: emendasTop10, error: err6 },
            { data: emendasUF, error: err7 },
            { data: pesquisas, error: err8 },
            { data: ceap2025Raw, error: err9 }
        ] = await Promise.all([
            supabaseAdmin.from('dashboard_ceap_top10').select('*'),
            supabaseAdmin.from('dashboard_ceap_total').select('*'),
            supabaseAdmin.from('dashboard_ceap_categorias').select('*'),
            supabaseAdmin.from('camara_frequencia').select('*').order('ausencias_nao_justificadas', { ascending: false }).limit(10),
            supabaseAdmin.from('camara_votacoes').select('*').order('votos_registrados', { ascending: false }).limit(10),
            supabaseAdmin.from('dashboard_emendas_top10').select('*'),
            supabaseAdmin.from('dashboard_emendas_uf').select('*'),
            supabaseAdmin.from('dashboard_pesquisas_top10').select('*'),
            supabaseAdmin.from('dashboard_ceap_2025_deputados').select('*')
        ]);

        // Helper para mapear id_deputado para Nome e Partido do congresso-index
        const enriquecerDeputados = (lista: any[]) => {
            if (!lista) return [];
            return lista.map(item => {
                const dep = congressoIndex.find(d => parseInt(d.id) === item.id_deputado);
                return {
                    ...item,
                    nome: dep?.nome || `Deputado ID ${item.id_deputado}`,
                    partido: dep?.partido || 'N/A',
                    uf: dep?.uf || 'BR',
                    foto: dep ? (dep.casa === 'SENADO' ? `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${dep.id}.jpg` : `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`) : null,
                    cargo: dep?.casa === 'SENADO' ? 'SENADOR(A)' : 'DEPUTADO FEDERAL'
                };
            });
        };

        const removerAcentos = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

        const enriquecerEmendasPorNome = (lista: any[]) => {
            if (!lista) return [];
            return lista.map(item => {
                const autorStr = removerAcentos(item.autor);
                const dep = congressoIndex.find(d => {
                    const depNome = removerAcentos(d.nome);
                    return depNome.includes(autorStr) || autorStr.includes(depNome) || removerAcentos(d.nome.split(' ')[0]) === autorStr;
                });
                return {
                    ...item,
                    partido: dep?.partido || 'CONGRESSO',
                    uf: dep?.uf || 'BR',
                    foto: dep ? (dep.casa === 'SENADO' ? `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${dep.id}.jpg` : `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`) : null,
                    id_deputado: dep ? parseInt(dep.id) : undefined,
                    cargo: dep ? (dep.casa === 'SENADO' ? 'SENADOR(A)' : 'DEPUTADO FEDERAL') : 'SENADOR(A)'
                };
            });
        };

        const enriquecerPesquisas = (lista: any[]) => {
            if (!lista) return [];
            return lista.map(item => {
                let dep;
                if (item.id_deputado) {
                    dep = congressoIndex.find(d => parseInt(d.id) === item.id_deputado);
                } else {
                    const termoStr = removerAcentos(item.termo);
                    dep = congressoIndex.find(d => {
                        const depNome = removerAcentos(d.nome);
                        return depNome.includes(termoStr) || termoStr.includes(depNome) || removerAcentos(d.nome.split(' ')[0]) === termoStr;
                    });
                }
                
                return {
                    ...item,
                    partido: dep?.partido || 'N/A',
                    uf: dep?.uf || 'BR',
                    foto: dep ? (dep.casa === 'SENADO' ? `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${dep.id}.jpg` : `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`) : null,
                    id_deputado: dep ? parseInt(dep.id) : undefined,
                    cargo: dep ? (dep.casa === 'SENADO' ? 'SENADOR(A)' : 'DEPUTADO FEDERAL') : null
                };
            });
        };

        const ceap2025Enriched = err9 ? [] : enriquecerDeputados(ceap2025Raw || []);
        const ceapEstados: Record<string, any[]> = {};
        for (const item of ceap2025Enriched) {
            const uf = item.uf;
            if (!uf || uf === 'BR') continue;
            if (!ceapEstados[uf]) ceapEstados[uf] = [];
            if (ceapEstados[uf].length < 5) {
                ceapEstados[uf].push(item);
            }
        }

        // Ordenar os UFs alfabeticamente
        const ceapEstadosSorted = Object.keys(ceapEstados).sort().reduce((acc, uf) => {
            acc[uf] = ceapEstados[uf];
            return acc;
        }, {} as Record<string, any[]>);

        return NextResponse.json({
            ceapTop10: err1 ? null : enriquecerDeputados(ceapTop10 || []),
            ceapTotal: err2 ? null : (ceapTotal || []),
            ceapCategorias: err3 ? null : (ceapCategorias || []),
            faltosos: err4 ? null : enriquecerDeputados(faltosos || []),
            votantes: err5 ? null : enriquecerDeputados(votantes || []),
            emendasTop10: err6 ? null : enriquecerEmendasPorNome(emendasTop10 || []),
            emendasUF: err7 ? null : (emendasUF || []),
            pesquisas: err8 ? null : enriquecerPesquisas(pesquisas || []).filter((item: any) => item.id_deputado).slice(0, 10),
            ceapEstados: ceapEstadosSorted
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
