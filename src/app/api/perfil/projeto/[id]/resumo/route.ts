import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Groq from "groq-sdk";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const idProjeto = params.id;

  if (!idProjeto) {
    return NextResponse.json({ error: "ID do projeto é obrigatório" }, { status: 400 });
  }

  const supabase = supabaseAdmin;
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!supabase || !groqApiKey) {
    return NextResponse.json(
      { error: "Infraestrutura (Supabase/Groq) não configurada." },
      { status: 500 }
    );
  }

  try {
    // 1. Busca os dados do projeto no banco
    const { data: projeto, error } = await supabase
      .from("camara_producao_legislativa")
      .select("*")
      .eq("id_proposicao", idProjeto)
      .single();

    if (error || !projeto) {
      return NextResponse.json(
        { error: "Projeto não encontrado no banco de dados." },
        { status: 404 }
      );
    }

    // 2. Aciona o LLM (Llama 3 via Groq) para resumir
    const groq = new Groq({ apiKey: groqApiKey });
    const prompt = `Você é um advogado especialista em direito legislativo e auditoria OSINT.
Abaixo está a ementa de um Projeto de Lei (PL) ou proposição similar apresentado na Câmara dos Deputados:

Título: ${projeto.titulo}
Ementa Oficial: ${projeto.ementa}

Seu objetivo é gerar um "Resumo Descomplicado" para o cidadão comum, explicando:
1. O que este projeto faz de forma direta? (Pense no impacto real na sociedade)
2. Quem sai ganhando ou perdendo com isso? (Se houver claro impacto econômico ou social)
3. Há algum ponto de alerta ou polêmica em potencial? (Seja neutro e objetivo)

Formate sua resposta em Markdown. Use negritos para destacar o principal. Seja direto, sem introduções robóticas. Mantenha o tom de um 'Dossiê Técnico', direto e profissional.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 600,
    });

    const resumo = chatCompletion.choices[0]?.message?.content || "Não foi possível gerar o resumo.";

    // Opcional: Aqui poderíamos salvar o "resumo" no banco na própria tabela "camara_producao_legislativa" para não precisar gerar de novo.
    // Mas faremos sob demanda por enquanto.

    // Apenas formatamos Markdown básico para HTML simples no Frontend, ou o frontend renderiza Markdown puro.
    // Como o frontend usa dangerouslySetInnerHTML, converteremos quebras de linha.
    // O ideal seria usar uma lib de Markdown no Frontend (ex: react-markdown).
    // Como a instrução era fazer rápido, vamos enviar o markdown cru ou converter simples.
    // Vamos converter o markdown simples para tags básicas.
    
    let htmlResumo = resumo
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br />');

    return NextResponse.json({ resumo: htmlResumo });
  } catch (error: any) {
    console.error("[API IA Resumo] Erro ao resumir projeto:", error);
    return NextResponse.json(
      { error: "Falha ao se comunicar com os motores de Inteligência Artificial." },
      { status: 500 }
    );
  }
}
