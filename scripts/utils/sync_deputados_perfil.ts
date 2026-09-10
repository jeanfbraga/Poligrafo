import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pUrl = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL!;
const pKey = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY!;
const mUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const mKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const pClient = createClient(pUrl, pKey);
const mClient = createClient(mUrl, mKey);

async function syncVotacoesDeputados(idDeputados: number[]) {
  console.log(`--- SYNCING VOTAÇÕES FOR ${idDeputados.length} DEPUTADOS ---`);
  
  for (const idDeputado of idDeputados) {
    const { data: votos, error: vErr } = await pClient
      .from('camara_votos_detalhados')
      .select('*')
      .eq('id_deputado', idDeputado);

    if (vErr || !votos || votos.length === 0) {
      continue;
    }

    console.log(`[Deputado ${idDeputado}] Encontrados ${votos.length} votos.`);
    const idVotacoes = [...new Set(votos.map(v => v.id_votacao))];

    // Upsert master votacoes
    for (let i = 0; i < idVotacoes.length; i += 500) {
      const chunk = idVotacoes.slice(i, i + 500);
      const { data: masters, error: mErr } = await pClient
        .from('camara_votacoes_master')
        .select('*')
        .in('id_votacao', chunk);

      if (masters && masters.length > 0) {
        await mClient
          .from('camara_votacoes_master')
          .upsert(masters, { onConflict: 'id_votacao' });
      }
    }

    // Upsert votos detalhados
    for (let i = 0; i < votos.length; i += 500) {
      const chunk = votos.slice(i, i + 500);
      await mClient
        .from('camara_votos_detalhados')
        .upsert(chunk, { onConflict: 'id_deputado,id_votacao' });
    }
  }

  console.log('--- SYNC VOTAÇÕES CONCLUÍDO ---');
}

async function main() {
  const ids = [
    209787, 220642, 204426, 204536, 204409, 220564, 204534, 178908, 220645, 220655,
    152605, 160545, 141485, 160541, 204441, 178997, 220703, 204572, 204540, 204488,
    204388, 204358, 191923, 220669, 74052, 178929, 92346, 220546, 109429, 66828,
    160543, 220561, 204473, 73486, 220559, 178866, 74356, 220657, 220715, 178829,
    220599, 204563
  ];
  await syncVotacoesDeputados(ids);
}

main().catch(console.error);
