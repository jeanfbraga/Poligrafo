

async function testPipe() {
    console.log("Testando pipeline do Polígrafo API (Investigar)...");
    try {
        const response = await fetch('http://localhost:3000/api/investigar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nomeParaBusca: "Bibo Nunes", modoProfundo: true })
        });
        
        console.log("Status Code:", response.status);
        if (response.status === 200) {
            console.log("Teste de requisição inicial passou com sucesso. Iniciando stream...");
        } else {
            const text = await response.text();
            console.error("Falha ao iniciar:", text);
        }
    } catch (e) {
        console.error("O servidor Next.js precisa estar rodando localmente (npm run dev) para este teste:", e);
    }
}

testPipe();
