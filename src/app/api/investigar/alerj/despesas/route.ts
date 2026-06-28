import { NextResponse } from 'next/server';
import { buscarDespesasDeputadoEstadualRJ } from '../../estados/rj/alerj';
import { analisarLoteComInteligencia } from '../../ai_helpers';
import { buscarDoadoresTSE } from '../../tse';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const nomeBruto = searchParams.get('nome');
    const origemIdBruto = searchParams.get('origemId');

    const nome = nomeBruto ? nomeBruto.replace(/[^a-zA-Z0-9\sÁ-ÿ\-\.]/g, '').trim() : null;
    const origemId = origemIdBruto ? origemIdBruto.replace(/[^a-zA-Z0-9\-_]/g, '').trim() : null;

    if (!nome || !origemId) {
        return NextResponse.json({ error: 'Parâmetros ?nome e ?origemId válidos são obrigatórios.' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            let isStreamClosed = false;
            const safeClose = () => { if (!isStreamClosed) { isStreamClosed = true; try { controller.close(); } catch (e) { } } };
            const sendEvent = (tipo: string, payload: any) => {
                if (isStreamClosed) return;
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tipo, payload })}\n\n`)); } catch (e) { }
            };

            try {
                sendEvent('STATUS', { msg: `Deep Dive ALERJ: Consultando despesas do parlamentar ${nome}...` });

                // 1. Aciona o scraper do Playwright para buscar as despesas cruas
                const despesasCruas = await buscarDespesasDeputadoEstadualRJ(nome, sendEvent);

                if (despesasCruas.length === 0) {
                    sendEvent('STATUS', { msg: `Nenhuma despesa recente encontrada no portal da ALERJ.` });
                    sendEvent('RESULTADO_COMPLETO', { despesas: [] }); // Envia array vazio pro frontend
                    sendEvent('DONE', { msg: `Busca concluída sem resultados.` });
                    safeClose();
                    return;
                }

                // 2. Busca doadores para cruzar o contexto da inteligência
                sendEvent('STATUS', { msg: `Recuperando doadores de campanha para triagem heurística...` });
                const doadores = await buscarDoadoresTSE(nome, 'RJ');

                // 3. Aplica o Gemini
                sendEvent('STATUS', { msg: "[POLÍGRAFO IA] Triando gastos da ALERJ em busca de indícios ilícitos..." });
                const despesasAvaliadas = await analisarLoteComInteligencia(despesasCruas, 'RJ', doadores, 'Estadual');

                // 4. Cria Nodes separados apenas paras despesas suspeitas
                for (let i = 0; i < despesasAvaliadas.length; i++) {
                    const d = despesasAvaliadas[i];
                    const score = d.score_letalidade || 50;

                    if (score >= 60) {
                        const evtId = `alerj-ia-${origemId}-${i}-${Date.now()}`;
                        const payload = {
                            id: evtId,
                            type: 'DESPESA',
                            _origemId: origemId,
                            data: {
                                label: d.nomeFornecedor,
                                valor: d.valorDocumento,
                                tipo: d.tipoDespesa,
                                dataDocumento: d.dataDocumento,
                                score_letalidade: score,
                                isSuspeito: score >= 60,
                                isLetal: score >= 85,
                                isAlerta: true,
                                motivo_ia: d.motivo_ia
                            }
                        };
                        sendEvent('NODE_NOVO', payload);
                    }
                }

                // 5. Envia TODO o dataset cru para popular a Sidebar (Evidências) na UI permanentemente
                sendEvent('RESULTADO_COMPLETO', { despesas: despesasAvaliadas });
                
                sendEvent('DONE', { msg: `Operação de Deep Dive concluída: ${despesasAvaliadas.length} notas processadas.` });

            } catch (err: any) {
                console.error('[ERRO ALERJ DEEP DIVE]', err);
                sendEvent('ERROR', { mensagem: err.message || "Falha ao processar o Portal da Transparência." });
            } finally {
                safeClose();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
