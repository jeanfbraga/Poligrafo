import http from 'http';

const req = http.get('http://localhost:3000/api/investigar?nome=rogerio+marinho&limit=10', (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    
    let cacheHitDetected = false;
    let nodeCount = 0;
    
    res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.substring(6));
                    if (data.type === 'STATUS') {
                        console.log(`[STATUS] ${data.data.msg}`);
                        if (data.data.msg.includes('GRAFO RESTAURADO')) {
                            cacheHitDetected = true;
                        }
                    } else if (data.type === 'NODE_NOVO') {
                        nodeCount++;
                        console.log(`[NODE] ${data.data.id} - ${data.data.data.label}`);
                    } else if (data.type === 'ERRO') {
                        console.error(`[ERRO] ${data.data.msg}`);
                    }
                } catch (e) {
                    // ignore parse errors for partial chunks
                }
            }
        }
    });

    res.on('end', () => {
        console.log('\n--- RESULTADO FINAL ---');
        console.log(`Total de nós recuperados: ${nodeCount}`);
        if (cacheHitDetected) {
            console.log('✅ CACHE-FIRST FUNCIONOU (Grafo restaurado do banco!)');
        } else {
            console.log('⏳ Busca nova (Não usou cache do grafo 24h). Verifique se puxou dados do Cache das bases.');
        }
        process.exit(0);
    });
});

req.on('error', (e) => {
    console.error(`Problema com a requisição: ${e.message}`);
});
