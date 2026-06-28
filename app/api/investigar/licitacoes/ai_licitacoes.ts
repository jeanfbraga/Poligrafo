import { PNCPContract } from '../../../../lib/pncp/client';

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-3-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash"
];

function construirPromptLicitacoes(cnpj: string, politico: string, contratos: PNCPContract[]) {
    return `Você atua como Auditor de Contas Públicas e Analista de Fraudes em Licitações (TCU/CGU).

MISSÃO:
Avaliar transações financeiras oriundas do Portal Nacional de Contratações Públicas (PNCP). O alvo (CNPJ) possui associação direta com o ecossistema do político investigado: ${politico}.

DIRETRIZES LEGAIS E HEURÍSTICAS:
1. Limiares de Dispensa (Lei 14.133/21): Contratos fragmentados sucessivamente logo abaixo dos limites de dispensa de licitação (R$ 50k a R$ 100k) no mesmo órgão representam forte indício de fraude ("Smurfing" Administrativo).
2. Padrões de Concentração: Avalie se a empresa possui 'vício de vitória', ou seja, ganha repetidas licitações ou contratos milionários em sequência na mesma prefeitura ou sob a mesma jurisdição política.
3. Rosto Múltiplo (Smurfing): Multiplos contratos assinados num curto espaço de tempo (mesma data ou datas adjacentes) para o mesmo objeto.
4. Conflito de Interesses: O CNPJ pertence ou está atrelado a aliados/conhecidos de "${politico}", e os contratos vêm de órgãos de influência eleitoral deste político.

SAÍDA OBRIGATÓRIA:
- Retorne um JSON válido. Não adicione markdown externo na resposta final.
Estrutura:
{
  "conclusao_geral": "Breve resumo criminal do padrão licitatório encontrado (max 40 palavras).",
  "score_letalidade_geral": 0, // 0 a 100 indicando o risco do pacote.
  "contratos_avaliados": [
    {
       "numeroControlePNCP": "codigo original da licitacao extrato",
       "classificacao": "FRAUDE_LICITATORIA | DIRECIONAMENTO_POSSIVEL | REGULAR | ...",
       "motivo_ia": "Fundamentação pericial que aponta o sinal de perigo em 1 ou 2 frases curtas.",
       "score_letalidade": 85, // 0 a 100 exclusivo deste contrato
       "enquadramento_normativo": "Artigo da Lei ou Regimental infringido (ex: Ofensa à Lei 14.133/21...)"
    }
  ]
}

DADOS COLETADOS MÁQUINA (RESTRIÇÃO ESTRITA MÁXIMA - AVALIE TODOS OS ITENS ABAIXO):
${JSON.stringify(contratos.map(c => ({
    numeroControlePNCP: c.numeroControlePNCP,
    orgao: c.orgaoEntidade.razaoSocial,
    estadoOuEsfera: c.orgaoEntidade.esferaId,
    valor: c.valorInicial,
    data: c.dataAssinatura || c.dataVigenciaInicio,
    objeto: c.objetoContrato
})))}
`;
}

export async function analisarComIAPNCP(cnpj: string, politico: string, contratos: PNCPContract[]) {
    const prompt = construirPromptLicitacoes(cnpj, politico, contratos);
    
    // NÍVEL 1: GROQ (Velocidade e Precisão Primária)
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        try {
            console.log(`[PNCP L1 GROQ] Iniciando motor inteligente...`);
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: [
                        { role: "system", content: "You MUST reply ONLY with a valid JSON OBJECT." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.1,
                    response_format: { type: "json_object" }
                }),
                signal: AbortSignal.timeout(15000)
            });

            if (res.ok) {
                const data = await res.json();
                const payload = JSON.parse(data.choices[0].message.content);
                // Valida retorno raso para evitar vazamentos null pointers
                if (payload.contratos_avaliados) return payload;
            }
        } catch (e) {
            console.error("[PNCP L1 GROQ] Falha na camada primária:", e);
        }
    }

    // NÍVEL 2: OPENROUTER (Modelos Open Source - Kimi/Llama)
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey) {
        console.log(`[PNCP L2 OPENROUTER] Fallback acionado...`);
        const openRouterModels = [
            "liquid/lfm-2.5-1.2b-instruct:free",
            "liquid/lfm-2.5-1.2b-thinking:free",
            "meta-llama/llama-3.3-70b-instruct:free",
            "meta-llama/llama-3.2-3b-instruct:free"
        ];
        
        for (const model of openRouterModels) {
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openRouterKey}`,
                        'HTTP-Referer': 'https://poligrafo.app.br',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: "system", content: "You MUST reply ONLY with a valid JSON OBJECT." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.1,
                        response_format: { type: "json_object" }
                    }),
                    signal: AbortSignal.timeout(15000)
                });

                if (res.ok) {
                    const data = await res.json();
                    let textResult = data.choices[0]?.message?.content;
                    if (textResult) {
                        const parsedObj = JSON.parse(textResult.replace(/```json/g, '').replace(/```/g, '').trim());
                        if (parsedObj.contratos_avaliados) return parsedObj;
                    }
                }
            } catch (e) {
                console.warn(`[PNCP L2 OPENROUTER] Falhou no modelo ${model}. Tentando o próximo.`);
            }
        }
    }

    // NÍVEL 3: GEMINI (Fallback Neural Cognitivo)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        console.log(`[PNCP L3 GEMINI] Fallback L3 acionado...`);
        for (const model of GEMINI_MODELS) {
            try {
                const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: "You MUST reply ONLY with a valid JSON OBJECT.\n" + prompt }] }],
                        generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
                    }),
                    signal: AbortSignal.timeout(20000)
                });

                if (res.ok) {
                    const data = await res.json();
                    let textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (textResult) {
                        const parsedObj = JSON.parse(textResult.replace(/```json/g, '').replace(/```/g, '').trim());
                        if (parsedObj.contratos_avaliados) return parsedObj;
                    }
                }
            } catch (e) {
                console.warn(`[PNCP L3 GEMINI] Falhou no modelo ${model}. Tentando o próximo.`);
            }
        }
    }

    // NÍVEL 4: HEURÍSTICA MATEMÁTICA PURA (Circuit Breaker L4)
    console.warn(`[PNCP L4 HEURISTICA] APIs Neurais indisponíveis. Modulando aproximação L4...`);
    let riscoScore = 20;
    let fraudeLabel = "AUSTERIDADE_ALIDA";

    if (contratos.length > 5) {
        riscoScore = 75;
        fraudeLabel = "CONCENTRAÇÃO_SUSPEITA_NO_ORGAO";
    }

    const contratosAvaliadosFallback = contratos.map(c => {
        let isLetal = false;
        let pScore = 20;
        let motivo = "Processamento automático heurístico: Nada grave detectado no limiar numérico.";
        const valor = c.valorInicial || 0;

        // Smurfing Simples (Dispensa < 100.000)
        if (valor < 100000 && valor > 30000) {
            isLetal = true;
            pScore = 70;
            motivo = "ALERTA L4: Valor perigosamente num limiar de dispensa de licitação (Lei 14.133). Smurfing?";
        }
        
        // Milionário
        if (valor > 1000000) {
            isLetal = true;
            pScore = 85;
            motivo = "ALERTA L4: Contrato com teto Milionário num curto espaço de tempo. Auditoria manual Requerida.";
        }

        return {
            numeroControlePNCP: c.numeroControlePNCP,
            classificacao: isLetal ? fraudeLabel : "REGULAR_L4",
            motivo_ia: motivo,
            score_letalidade: pScore,
            enquadramento_normativo: "Heurística Sistema Matemático L4"
        }
    });

    return {
        conclusao_geral: "Análise realizada via contingência analítica por quebra nas APIs IAs.",
        score_letalidade_geral: riscoScore,
        contratos_avaliados: contratosAvaliadosFallback
    };
}
