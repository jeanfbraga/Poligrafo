import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const indexPath = path.join(process.cwd(), 'src/services/integrations/data/congresso-index.json');
const congressoIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

async function run() {
    console.log("[FOTOS SYNC] Sincronizando fotos de políticos para o Supabase Storage...");
    
    // Lista as fotos existentes no bucket
    const { data: files, error: listError } = await supabaseAdmin.storage.from('fotos-politicos').list('', { limit: 1000 });
    
    if (listError) {
        console.error("[FOTOS SYNC] Erro ao listar bucket:", listError.message);
        return;
    }
    
    const existingFiles = new Set(files.map(f => f.name));
    
    let uploaded = 0;
    let failed = 0;
    
    for (const dep of congressoIndex) {
        const fileName = `${dep.id}.jpg`;
        
        if (existingFiles.has(fileName)) {
            continue; // Já existe
        }
        
        const url = dep.casa === 'SENADO' 
            ? `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${dep.id}.jpg`
            : `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`;
            
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`[FOTOS SYNC] ⚠️ Foto não encontrada para ${dep.nome} (${dep.id})`);
                failed++;
                continue;
            }
            
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            const { error: uploadError } = await supabaseAdmin.storage.from('fotos-politicos').upload(fileName, buffer, {
                contentType: 'image/jpeg',
                upsert: false
            });
            
            if (uploadError) {
                console.error(`[FOTOS SYNC] ❌ Erro ao enviar ${fileName}:`, uploadError.message);
                failed++;
            } else {
                console.log(`[FOTOS SYNC] ✅ Upload sucesso: ${dep.nome} (${fileName})`);
                uploaded++;
            }
            
            // Pequeno delay para evitar rate limit
            await new Promise(r => setTimeout(r, 100));
            
        } catch (e: any) {
            console.error(`[FOTOS SYNC] ❌ Erro no download para ${dep.nome}:`, e.message);
            failed++;
        }
    }
    
    console.log(`\n[FOTOS SYNC] Concluído! ${uploaded} enviadas, ${failed} falhas. (${existingFiles.size} já existiam no cache).`);
}

run().catch(console.error);
