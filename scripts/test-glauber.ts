import { executarInvestigacaoPrincipal } from "../src/services/core/investigador-principal";

async function main() {
    console.log("=== INICIANDO TESTE GLAUBER BRAGA ===");
    
    const sendEvent = (event: string, data: any) => {
        if (event === "STATUS") {
            console.log(`[SSE STATUS] ${data.msg}`);
        } else if (event === "NODE_NOVO") {
            console.log(`[SSE NODE] ${data.type} - ${data.data?.label || 'Sem label'}`);
        } else if (event === "API_WARNING") {
            console.warn(`[SSE WARNING] ${data.fonte}: ${data.mensagem}`);
        }
    };

    try {
        await executarInvestigacaoPrincipal({
            nomeParaBusca: "glauber braga",
            forceRef: "FEDERAL:CAMARA:152605",
            sendEvent,
            isDev: true
        });
        console.log("=== TESTE CONCLUÍDO COM SUCESSO ===");
    } catch (e) {
        console.error("=== ERRO DURANTE O TESTE ===", e);
    }
}

main();
