import { NextResponse } from "next/server";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { GROQ_MODELS, OPENROUTER_MODELS, GEMINI_MODELS } from "@/services/ai/ai-models-config";
import Groq from "groq-sdk";

export const dynamic = "force-dynamic";

/**
 * Motor de IA em Cascata para Resumo Analítico de Projetos de Lei
 * Cascata: Groq (L1) ➔ OpenRouter (L2) ➔ Google Gemini (L3) ➔ Heurística Analítica (L4)
 */
async function gerarResumoComCascata(titulo: string, ementa: string): Promise<{ resumoMarkdown: string; motorUsado: string }> {
	const promptSistema = `Você é um analista jurídico e auditor legislativo do projeto Polígrafo.
Abaixo estão o título e a ementa de um Projeto de Lei do Congresso Nacional:

TÍTULO: ${titulo}
EMENTA OFICIAL: ${ementa}

Elabore um RESUMO COMPLETO, denso e aprofundado para cidadãos e jornalistas (NÃO faça resumos superficiais de poucas linhas).
Sua resposta DEVE conter obrigatoriamente as 3 seções detalhadas a seguir:

### 1. O que este projeto faz de forma direta?
Explique com clareza e profundidade a mudança prática proposta: o que a lei cria, altera, proíbe ou obriga no ordenamento jurídico brasileiro e como isso afeta a sociedade.

### 2. Quem sai impactado?
Destaque com precisão:
- Setores beneficiados, categorias profissionais ou grupos sociais favorecidos.
- Setores regulados, empresas ou órgãos públicos que terão novas obrigações ou custos operacionais.

### 3. Pontos de atenção e análise crítica
Aponte de forma técnica, equilibrada e sem partidarismo:
- Desafios práticos de fiscalização e implementação.
- Possíveis impactos fiscais/orçamentários ou controvérsias jurídicas.

Mantenha tom técnico, direto e pericial. Use negritos nos termos fundamentais.`;

	// 1. NÍVEL 1: Groq (Developer Free Tier)
	const groqKey = process.env.GROQ_API_KEY;
	if (groqKey && groqKey.trim() !== "") {
		const groq = new Groq({ apiKey: groqKey });
		for (const model of GROQ_MODELS) {
			try {
				const completion = await groq.chat.completions.create({
					messages: [{ role: "user", content: promptSistema }],
					model: model,
					temperature: 0.2,
					max_tokens: 1000,
				});
				const text = completion.choices[0]?.message?.content;
				if (text && text.trim().length > 80) {
					// Remove eventuais tags <think> se o modelo for reasoning
					const cleanText = text.replace(new RegExp("<think>[\\s\\S]*?<\\/think>", "g"), "").trim();
					return { resumoMarkdown: cleanText, motorUsado: `GROQ:${model.toUpperCase()}` };
				}
			} catch (err: any) {
				// Tenta próximo modelo do Groq silenciosamente
			}
		}
		console.warn("[IA RESUMO] Modelos do Groq falharam -> Saltando para L2 (OpenRouter)...");
	}

	// 2. NÍVEL 2: OpenRouter (Modelos 100% Gratuitos / openrouter/free)
	const openRouterKey = process.env.OPENROUTER_API_KEY;
	if (openRouterKey && openRouterKey.trim() !== "") {
		for (const model of OPENROUTER_MODELS) {
			try {
				const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${openRouterKey}`,
						"HTTP-Referer": "https://poligrafo.app",
						"X-Title": "Poligrafo OSINT",
					},
					body: JSON.stringify({
						model: model,
						messages: [{ role: "user", content: promptSistema }],
						temperature: 0.2,
						max_tokens: 1000,
					}),
					signal: AbortSignal.timeout(8000),
				});
				if (res.ok) {
					const data = await res.json();
					const text = data?.choices?.[0]?.message?.content;
					if (text && text.trim().length > 80) {
						const cleanText = text.replace(new RegExp("<think>[\\s\\S]*?<\\/think>", "g"), "").trim();
						return { resumoMarkdown: cleanText, motorUsado: `OPENROUTER:${model.toUpperCase()}` };
					}
				}
			} catch (err: any) {
				// Tenta próximo modelo gratuito do OpenRouter
			}
		}
		console.warn("[IA RESUMO] Modelos gratuitos do OpenRouter falharam -> Saltando para L3 (Gemini)...");
	}

	// 3. NÍVEL 3: Google Gemini (Google AI Studio Free Tier)
	const geminiKey = process.env.GEMINI_API_KEY;
	if (geminiKey && geminiKey.trim() !== "") {
		for (const model of GEMINI_MODELS) {
			try {
				const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
				const res = await fetch(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contents: [{ parts: [{ text: promptSistema }] }],
						generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
					}),
					signal: AbortSignal.timeout(8000),
				});
				if (res.ok) {
					const data = await res.json();
					const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
					if (text && text.trim().length > 80) {
						return { resumoMarkdown: text.trim(), motorUsado: `GEMINI:${model.toUpperCase()}` };
					}
				}
			} catch (err: any) {
				console.warn(`[IA RESUMO] L3 (Gemini/${model}) falhou:`, err.message);
			}
		}
	}

	// 4. NÍVEL 4: Heurística Analítica Estruturada (Fallback Local Zero-Config)
	return {
		resumoMarkdown: `### 1. O que este projeto faz de forma direta?
O **${titulo}** propõe formalmente: *"${ementa}"*. A matéria introduz diretrizes regulatórias e obrigações jurídicas de cumprimento obrigatório na esfera federal.

### 2. Quem sai impactado?
- **Público e Setores Afetados**: Indivíduos, categorias profissionais, empresas ou entidades da administração pública vinculados à temática central da proposição.
- **Obrigações e Conformidade**: Institui deveres de adequação procedural, transparência e cumprimento normativo aos agentes abrangidos pelo texto legal.

### 3. Pontos de atenção e análise crítica
- **Tramitação Legislativa**: Matéria sujeita à análise conclusiva e de mérito pelas comissões temáticas permanentes da Câmara dos Deputados antes de eventual envio ao Senado ou Plenário.
- **Impacto Operacional**: Requer atenção quanto à viabilidade técnica de fiscalização pelos órgãos de controle e compatibilidade com o orçamento público.`,
		motorUsado: "HEURÍSTICA:LOCAL_L4",
	};
}

/**
 * Converte Markdown para HTML seguro e estruturado para o tema Terminal
 */
function converterMarkdownParaHtml(md: string): string {
	return md
		.replace(/^### (.*$)/gim, '<h3 class="text-xs font-bold uppercase text-green-400 mt-4 mb-2 tracking-wider border-b border-green-900/50 pb-1">$1</h3>')
		.replace(/^## (.*$)/gim, '<h2 class="text-sm font-bold uppercase text-green-300 mt-5 mb-2 tracking-wider">$1</h2>')
		.replace(/^# (.*$)/gim, '<h1 class="text-base font-bold uppercase text-green-300 mt-6 mb-2 tracking-wider">$1</h1>')
		.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-green-300 text-sm mb-1.5 leading-relaxed">$1</li>')
		.replace(/^\s*\*\s+(.*$)/gim, '<li class="ml-4 list-disc text-green-300 text-sm mb-1.5 leading-relaxed">$1</li>')
		.replace(/\*\*(.*?)\*\*/g, '<strong class="text-green-300 font-bold">$1</strong>')
		.replace(/\n\n/g, '<div class="h-2.5"></div>')
		.replace(/\n/g, '<br />');
}

export async function POST(
	request: Request,
	props: { params: Promise<{ id: string }> },
) {
	const params = await props.params;
	const idProjeto = params.id;

	if (!idProjeto) {
		return NextResponse.json({ error: "ID do projeto é obrigatório" }, { status: 400 });
	}

	let titulo = "";
	let ementa = "";

	// 1. Tenta ler do body enviado pelo cliente (otimização instantânea)
	try {
		const body = await request.json().catch(() => ({}));
		if (body.titulo) titulo = body.titulo;
		if (body.ementa) ementa = body.ementa;
	} catch {}

	// 2. Se não veio no body, busca no banco de dados (Supabase)
	if (!titulo || !ementa) {
		const supabase = supabaseAdmin || supabasePerfilAdmin;
		if (supabase) {
			// Tenta na tabela de detalhes
			const { data: propDetalhes } = await supabase
				.from("camara_proposicoes_detalhes_cache")
				.select("titulo, ementa")
				.eq("id_proposicao", idProjeto)
				.maybeSingle();

			if (propDetalhes?.ementa) {
				titulo = propDetalhes.titulo || `PL ${idProjeto}`;
				ementa = propDetalhes.ementa;
			} else {
				// Tenta na tabela de produção legislativa
				const { data: propProducao } = await supabase
					.from("camara_producao_legislativa")
					.select("titulo, ementa")
					.eq("id_proposicao", idProjeto)
					.maybeSingle();

				if (propProducao?.ementa) {
					titulo = propProducao.titulo || `PL ${idProjeto}`;
					ementa = propProducao.ementa;
				}
			}
		}
	}

	// 3. Se ainda não achou, faz fallback ao vivo na API da Câmara dos Deputados
	if (!titulo || !ementa) {
		try {
			const resCamara = await fetch(
				`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${idProjeto}`,
				{
					headers: { Accept: "application/json" },
					signal: AbortSignal.timeout(8000),
				},
			);
			if (resCamara.ok) {
				const json = await resCamara.json();
				const dados = json?.dados;
				if (dados) {
					titulo = `${dados.siglaTipo || "PL"} ${dados.numero || ""}/${dados.ano || ""}`.trim();
					ementa = dados.ementa || "Ementa não informada pela Câmara.";
				}
			}
		} catch (camaraErr: any) {
			console.warn("[IA RESUMO] Fallback Câmara falhou:", camaraErr.message);
		}
	}

	if (!ementa) {
		return NextResponse.json(
			{ error: `Projeto ${idProjeto} não localizado no banco nem na Câmara dos Deputados.` },
			{ status: 404 },
		);
	}

	// 4. Executa a inteligência artificial com cascata de fallbacks
	try {
		const { resumoMarkdown, motorUsado } = await gerarResumoComCascata(titulo, ementa);
		const htmlResumo = converterMarkdownParaHtml(resumoMarkdown);

		return NextResponse.json({
			resumo: htmlResumo,
			resumoRaw: resumoMarkdown,
			motor: motorUsado,
			titulo,
		});
	} catch (error: any) {
		console.error("[API IA Resumo] Erro fatal:", error);
		return NextResponse.json(
			{ error: "Erro interno ao gerar o resumo da proposição." },
			{ status: 500 },
		);
	}
}
