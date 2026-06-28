/**
 * build-congresso-index.ts
 * 
 * Gera um JSON estático leve contendo todos os Deputados Federais (Legislatura 57)
 * e Senadores (Legislatura 57) para alimentar o Autocomplete Zero-Latency no frontend.
 * 
 * Uso: npx tsx scripts/build-congresso-index.ts
 * Saída: lib/data/congresso-index.json
 */

import fs from 'fs';
import path from 'path';

interface PoliticoIndex {
    id: string;
    nome: string;
    uf: string;
    partido?: string;
    casa: 'CAMARA' | 'SENADO';
}

async function fetchDeputados(): Promise<PoliticoIndex[]> {
    console.log('[BUILD] Buscando deputados federais na API da Câmara...');
    const url = 'https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=57&ordem=ASC&ordenarPor=nome&itens=600';
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Câmara API retornou ${res.status}`);
    const json = await res.json();
    const dados = json.dados || [];

    console.log(`[BUILD] ${dados.length} deputados encontrados.`);

    return dados.map((dep: any) => ({
        id: String(dep.id),
        nome: dep.nome,
        uf: dep.siglaUf,
        partido: dep.siglaPartido,
        casa: 'CAMARA' as const,
    }));
}

async function fetchSenadores(): Promise<PoliticoIndex[]> {
    console.log('[BUILD] Buscando senadores na API do Senado...');
    const url = 'https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/57';

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`Senado API retornou ${res.status}`);
    const data = await res.json();
    const listaSenadores = data?.ListaParlamentarLegislatura?.Parlamentares?.Parlamentar || [];
    const senadoresArray = Array.isArray(listaSenadores) ? listaSenadores : [listaSenadores];

    console.log(`[BUILD] ${senadoresArray.length} senadores encontrados.`);

    return senadoresArray.map((s: any) => {
        const mandatos = Array.isArray(s.Mandatos?.Mandato) ? s.Mandatos.Mandato : [s.Mandatos?.Mandato];
        const uf = mandatos[0]?.UfParlamentar || 'DF';
        return {
            id: s.IdentificacaoParlamentar.CodigoParlamentar,
            nome: s.IdentificacaoParlamentar.NomeParlamentar,
            uf,
            partido: s.IdentificacaoParlamentar.SiglaPartidoParlamentar,
            casa: 'SENADO' as const,
        };
    });
}

async function main() {
    console.log('=== BUILD: Índice do Congresso Nacional ===');
    const [deputados, senadores] = await Promise.all([fetchDeputados(), fetchSenadores()]);
    const index = [...deputados, ...senadores];

    const outDir = path.resolve(__dirname, '..', 'lib', 'data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, 'congresso-index.json');
    fs.writeFileSync(outPath, JSON.stringify(index, null, 2), 'utf-8');

    console.log(`[BUILD] ✅ Índice salvo em ${outPath} (${index.length} políticos, ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
}

main().catch(err => {
    console.error('[BUILD ERRO]', err);
    process.exit(1);
});
