import { NextRequest, NextResponse } from 'next/server';
import {
    Document, Packer, Paragraph, Table, TableCell, TableRow,
    WidthType, TextRun, AlignmentType, BorderStyle, HeadingLevel,
    ShadingType, ExternalHyperlink, PageOrientation
} from 'docx';

/**
 * POST /api/exportar-dossie
 * 
 * Gera um Dossiê Pericial em DOCX contendo:
 * 1. Capa com nome do político, data, disclaimer
 * 2. Tabela de entidades flagradas pela IA (agrupadas por tipo)
 * 3. Lista de URLs com fontes oficiais
 * 4. Rodapé legal
 */

// Cores do tema
const COLORS = {
    GREEN: '1BCA3C',
    DARK: '0D0D0D',
    RED: 'ED4545',
    ORANGE: 'F59E0B',
    YELLOW: 'EAB308',
    GRAY: '808080',
    LIGHT_GRAY: 'F2F2F2',
    WHITE: 'FFFFFF',
    DARK_RED_BG: '2D0A0A',
    DARK_ORANGE_BG: '2D1F0A',
};

const ENTITY_LABELS: Record<string, string> = {
    'DESPESA': '💰 DESPESAS PÚBLICAS',
    'EMPRESA': '🏢 EMPRESAS E DOADORES',
    'CONTRATO': '📋 CONTRATOS E CONVÊNIOS',
    'EMENDA': '🏛️ EMENDAS PARLAMENTARES',
    'EMENDA_RESUMO': '🏛️ RESUMO DE EMENDAS',
    'ORGAO': '🏛️ ÓRGÃOS PÚBLICOS',
    'SOCIO': '👤 SÓCIOS E PESSOAS FÍSICAS',
};

// Larguras fixas em DXA (twips) para A4 Landscape (~15840 DXA total usável)
// ENTIDADE: 3500 | CLASSIFICAÇÃO: 2300 | VALOR: 2200 | SCORE: 1340 | MOTIVO IA: 6500
const COL_WIDTHS_DXA = [3500, 2300, 2200, 1340, 6500];

function createHeaderCell(text: string, widthDxa: number): TableCell {
    return new TableCell({
        children: [new Paragraph({
            children: [new TextRun({ text, bold: true, size: 16, color: COLORS.WHITE, font: 'Consolas' })],
            alignment: AlignmentType.CENTER,
        })],
        shading: { fill: COLORS.DARK, type: ShadingType.SOLID, color: COLORS.DARK },
        width: { size: widthDxa, type: WidthType.DXA },
    });
}

function createDataCell(text: string, isLetal: boolean, widthDxa?: number): TableCell {
    return new TableCell({
        children: [new Paragraph({
            children: [new TextRun({
                text: text || '-',
                size: 16,
                color: isLetal ? COLORS.RED : '1A1A1A',
                bold: isLetal,
                font: 'Consolas',
            })],
        })],
        shading: isLetal
            ? { fill: 'FDE8E8', type: ShadingType.SOLID, color: 'FDE8E8' }
            : { fill: COLORS.WHITE, type: ShadingType.SOLID, color: COLORS.WHITE },
        width: widthDxa ? { size: widthDxa, type: WidthType.DXA } : undefined,
    });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { nomePolitico, despesasCriticas, urlsNotasFiscais } = body;

        if (!nomePolitico) {
            return NextResponse.json({ error: 'Nome do político é obrigatório.' }, { status: 400 });
        }

        const dataGeracao = `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`;

        // ===========================
        // SEÇÃO 1: CAPA
        // ===========================
        const coverChildren: Paragraph[] = [
            new Paragraph({ spacing: { after: 600 }, children: [] }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', color: COLORS.GREEN, size: 28, font: 'Consolas' })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
                children: [new TextRun({ text: 'POLÍGRAFO', bold: true, size: 56, color: COLORS.GREEN, font: 'Consolas' })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [new TextRun({ text: 'DOSSIÊ ANALÍTICO DE INTELIGÊNCIA', size: 24, color: COLORS.GRAY, font: 'Consolas' })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', color: COLORS.GREEN, size: 28, font: 'Consolas' })],
            }),
            new Paragraph({ spacing: { after: 400 }, children: [] }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
                children: [
                    new TextRun({ text: 'ALVO: ', size: 28, color: COLORS.GRAY, font: 'Consolas' }),
                    new TextRun({ text: nomePolitico.toUpperCase(), bold: true, size: 32, color: COLORS.RED, font: 'Consolas' }),
                ],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 600 },
                children: [new TextRun({ text: `Gerado em: ${dataGeracao}`, size: 18, color: COLORS.GRAY, font: 'Consolas' })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
                children: [new TextRun({
                    text: 'DOCUMENTO CONFIDENCIAL — GERADO POR MOTOR DE INTELIGÊNCIA ARTIFICIAL',
                    size: 16, color: COLORS.ORANGE, bold: true, font: 'Consolas',
                })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({
                    text: 'Dados extraídos de bases públicas governamentais (TSE, Câmara dos Deputados, Portal da Transparência, Receita Federal, PNCP).',
                    size: 14, color: COLORS.GRAY, font: 'Consolas',
                })],
            }),
        ];

        // ===========================
        // SEÇÃO 2: TABELA DE ENTIDADES (AGRUPADAS)
        // ===========================
        const tableChildren: (Paragraph | Table)[] = [];

        if (despesasCriticas && despesasCriticas.length > 0) {
            // Agrupar por tipo
            const grupos: Record<string, any[]> = {};
            for (const d of despesasCriticas) {
                const tipo = d.type || 'DESPESA';
                if (!grupos[tipo]) grupos[tipo] = [];
                grupos[tipo].push(d);
            }

            for (const [tipo, entidades] of Object.entries(grupos)) {
                const label = ENTITY_LABELS[tipo] || tipo;

                // Sub-header do grupo
                tableChildren.push(
                    new Paragraph({ spacing: { before: 400, after: 100 }, children: [] }),
                    new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        spacing: { after: 200 },
                        children: [new TextRun({ text: label, bold: true, size: 24, color: COLORS.GREEN, font: 'Consolas' })],
                    }),
                );

                // Cabeçalho da tabela
                const headerRow = new TableRow({
                    children: [
                        createHeaderCell('ENTIDADE', COL_WIDTHS_DXA[0]),
                        createHeaderCell('CLASSIFICAÇÃO', COL_WIDTHS_DXA[1]),
                        createHeaderCell('VALOR (R$)', COL_WIDTHS_DXA[2]),
                        createHeaderCell('SCORE', COL_WIDTHS_DXA[3]),
                        createHeaderCell('MOTIVO IA', COL_WIDTHS_DXA[4]),
                    ],
                });

                // Linhas do corpo
                const dataRows: TableRow[] = [];
                entidades.forEach((d: any) => {
                    const isLetal = (d.score_letalidade || 0) >= 85;
                    const isAlerta = (d.score_letalidade || 0) >= 50;
                    const nome = String(d.label || 'N/A').substring(0, 50);
                    // Captura a nova classificação injetada pelo ai_helpers no route.ts
                    const classificacao = String(d.classificacao || d.tipo || d.type || '-').substring(0, 30).toUpperCase();
                    const valor = Number(d.valor || d.capitalSocial || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    const score = String(d.score_letalidade || '-');
                    const motivo = String(d.motivo_ia || 'Sem observação da IA.');
                    const fundamentacao = String(d.fundamentacao_tecnica || d.risco?.fundamentacao_tecnica || '');
                    const enquadramento = String(d.enquadramento_normativo || d.risco?.enquadramento_normativo || '');

                    dataRows.push(new TableRow({
                        children: [
                            createDataCell(nome, isLetal, COL_WIDTHS_DXA[0]),
                            createDataCell(classificacao, isLetal, COL_WIDTHS_DXA[1]),
                            createDataCell(`R$ ${valor}`, isLetal, COL_WIDTHS_DXA[2]),
                            createDataCell(score, isLetal, COL_WIDTHS_DXA[3]),
                            createDataCell(motivo, isLetal, COL_WIDTHS_DXA[4]),
                        ],
                    }));
                    
                    // Adiciona a quebra de linha detalhada (fundamentação da IA) se houver
                    if (isAlerta && (fundamentacao || enquadramento)) {
                        dataRows.push(new TableRow({
                            children: [
                                new TableCell({
                                    columnSpan: 5,
                                    shading: { fill: isLetal ? 'FFF4F4' : 'FDF7E8', type: ShadingType.SOLID, color: isLetal ? 'FFF4F4' : 'FDF7E8' },
                                    margins: { left: 200, right: 200, top: 100, bottom: 100 },
                                    children: [
                                        new Paragraph({
                                            spacing: { before: 60, after: 60 },
                                            children: [
                                                new TextRun({ text: "[ANÁLISE PROFUNDA MÁQUINA] ", bold: true, size: 14, color: COLORS.GRAY, font: 'Consolas' }),
                                                new TextRun({ text: fundamentacao || "N/I", size: 14, color: COLORS.DARK, font: 'Consolas' }),
                                                new TextRun({ text: " | Enquadramento Típico: ", bold: true, size: 14, color: COLORS.GRAY, font: 'Consolas' }),
                                                new TextRun({ text: enquadramento || "N/I", size: 14, color: COLORS.DARK, font: 'Consolas' }),
                                            ]
                                        })
                                    ]
                                })
                            ]
                        }));
                    }
                });

                tableChildren.push(
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        columnWidths: COL_WIDTHS_DXA,
                        rows: [headerRow, ...dataRows],
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                            left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                            right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
                            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
                            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
                        },
                    }),
                );
            }
        } else {
            tableChildren.push(
                new Paragraph({
                    spacing: { before: 400 },
                    children: [new TextRun({ text: 'Nenhuma entidade com score de risco relevante foi detectada nesta investigação.', size: 20, color: COLORS.GRAY, font: 'Consolas' })],
                }),
            );
        }

        // ===========================
        // SEÇÃO 3: FONTES E EVIDÊNCIAS OFICIAIS (URLs)
        // ===========================
        const urlChildren: Paragraph[] = [];

        if (urlsNotasFiscais && urlsNotasFiscais.length > 0) {
            urlChildren.push(
                new Paragraph({ spacing: { before: 600 }, children: [] }),
                new Paragraph({
                    heading: HeadingLevel.HEADING_1,
                    spacing: { after: 200 },
                    children: [new TextRun({ text: '🔗 FONTES E DOCUMENTOS COMPROBATÓRIOS', bold: true, size: 28, color: COLORS.GREEN, font: 'Consolas' })],
                }),
                new Paragraph({
                    spacing: { after: 200 },
                    children: [new TextRun({ text: 'Os documentos abaixo podem ser verificados diretamente nas fontes governamentais originais:', size: 18, color: COLORS.GRAY, font: 'Consolas' })],
                }),
            );

            const uniqueUrls = Array.from(new Set(urlsNotasFiscais as string[]));
            for (const url of uniqueUrls) {
                urlChildren.push(
                    new Paragraph({
                        spacing: { after: 100 },
                        children: [
                            new TextRun({ text: '• ', size: 18, font: 'Consolas' }),
                            new ExternalHyperlink({
                                children: [new TextRun({ text: url, size: 16, color: '2563EB', underline: {}, font: 'Consolas' })],
                                link: url,
                            }),
                        ],
                    }),
                );
            }
        }

        // ===========================
        // SEÇÃO 4: RODAPÉ LEGAL
        // ===========================
        const footerChildren: Paragraph[] = [
            new Paragraph({ spacing: { before: 600 }, children: [] }),
            new Paragraph({
                children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', color: COLORS.GREEN, size: 16, font: 'Consolas' })],
            }),
            new Paragraph({
                spacing: { after: 100 },
                children: [new TextRun({
                    text: 'Este documento foi gerado automaticamente pelo sistema Polígrafo com auxílio de Inteligência Artificial (LLM). ' +
                        'As informações são extraídas de bases públicas governamentais e não possuem caráter acusatório. ' +
                        'Cabe ao destinatário verificar as fontes oficiais antes de qualquer ação jurídica ou editorial.',
                    size: 14, color: COLORS.GRAY, italics: true, font: 'Consolas',
                })],
            }),
        ];

        // ===========================
        // MONTAGEM FINAL DO DOCUMENTO
        // ===========================
        const doc = new Document({
            creator: 'Polígrafo IA',
            title: `Dossiê Analítico - ${nomePolitico}`,
            description: `Dossiê gerado pelo Polígrafo em ${dataGeracao}`,
            sections: [
                {
                    children: [
                        ...coverChildren,
                    ],
                },
                {
                    properties: {
                        page: {
                            size: { orientation: PageOrientation.LANDSCAPE },
                        },
                    },
                    children: [
                        new Paragraph({
                            heading: HeadingLevel.HEADING_1,
                            spacing: { after: 200 },
                            children: [new TextRun({ text: '⚠️ ENTIDADES FLAGRADAS PELA INTELIGÊNCIA ARTIFICIAL', bold: true, size: 28, color: COLORS.RED, font: 'Consolas' })],
                        }),
                        new Paragraph({
                            spacing: { after: 300 },
                            children: [new TextRun({ text: `Total de alertas: ${despesasCriticas?.length || 0} entidade(s) com score de risco ≥ 60`, size: 18, color: COLORS.GRAY, font: 'Consolas' })],
                        }),
                        ...tableChildren,
                        ...urlChildren,
                        ...footerChildren,
                    ],
                },
            ],
        });

        const buffer = await Packer.toBuffer(doc);

        return new Response(Buffer.from(buffer), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="dossie-${nomePolitico.replace(/\s+/g, '_')}.docx"`,
            },
        });
    } catch (error: any) {
        console.error('[Exportar Dossiê] Erro:', error);
        return NextResponse.json({ error: error.message || 'Erro ao gerar DOCX.' }, { status: 500 });
    }
}
