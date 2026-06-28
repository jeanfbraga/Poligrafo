"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Landmark, ShieldAlert, Share2 } from "lucide-react";
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export const EmendaNode = ({ data }: { data: any }) => {
    const nodeRef = React.useRef<HTMLDivElement>(null);

    useGSAP(() => {
        gsap.from(nodeRef.current, { scale: 0.8, opacity: 0, duration: 0.5, ease: 'power2.out' });
    }, { scope: nodeRef });
    const taxa = data.percentualExecucao ?? data._percentualExecucao ?? data.taxaExecucao ?? 0;
    const isFantasma = data.isFantasma ?? data._isFantasma;
    const risco = data.riscoNivel ?? data._riscoTipo?.nivel;
    const tipoLabel = data.tipo ?? data._riscoTipo?.label ?? 'EMENDA_PARLAMENTAR';

    const borderColor = isFantasma ? 'border-red-500' : risco === 'CRÍTICO' ? 'border-orange-500' : 'border-teal-500';
    const textColor = isFantasma ? 'text-red-400' : risco === 'CRÍTICO' ? 'text-orange-400' : 'text-teal-400';
    const barColor = isFantasma ? 'bg-red-500' : taxa < 30 ? 'bg-yellow-500' : 'bg-teal-500';

    return (
        <div ref={nodeRef}>
            <Handle type="target" position={Position.Top} className="!bg-teal-500 !rounded-none w-3 h-3 !border-none" />
            <Card 
                className={`w-72 bg-black border-teal-500 rounded-none font-mono relative transition-transform duration-500 origin-center ${data.metrics?.suspicious ? 'ring-2 ring-red-500 !border-red-500' : ''}`}
                style={{ transform: `scale(${1 + (data.metrics?.pagerank || 0) * 0.3})`, zIndex: data.metrics?.suspicious ? 10 : 1 }}
            >
                <CardHeader className={`flex flex-col gap-2 pb-2 space-y-0 border-b ${borderColor} relative`}>
                    <div className="flex justify-between items-start pr-8">
                        <Badge variant="outline" className={`w-fit bg-teal-950/30 ${textColor} ${borderColor} rounded-none text-xs uppercase`}>
                            [{tipoLabel.toUpperCase().replace(/\s/g, '_')}]
                        </Badge>
                        <div className="flex gap-1">
                            {isFantasma && <ShieldAlert className="h-4 w-4 text-red-500 animate-pulse shrink-0" />}
                            {data.onShare && (
                                <button onClick={(e) => { e.stopPropagation(); data.onShare(data, 'EMENDA'); }} className={`w-10 h-10 flex items-center justify-center absolute top-1 right-1 hover:bg-white/10 transition-colors z-10 rounded-full ${textColor}`}>
                                    <Share2 className="h-4 w-4 opacity-70" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Landmark className={`h-4 w-4 ${textColor} shrink-0 mt-1`} />
                        <CardTitle className={`text-sm font-bold uppercase tracking-wider line-clamp-2 ${textColor}`} title={data.label}>
                            {data.label}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="pt-3 space-y-2">
                    <div>
                        <p className="text-xs text-teal-500 uppercase font-bold">Valor Empenhado</p>
                        <p className={`text-sm font-bold mt-0.5 ${textColor}`}>
                            R$ {Number(data._empenhado || data.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div>
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-teal-500 uppercase font-bold">Execução</p>
                            <p className={`text-xs font-bold ${isFantasma ? 'text-red-500' : taxa < 30 ? 'text-yellow-500' : 'text-teal-400'}`}>{taxa}%</p>
                        </div>
                        <div className="w-full h-1.5 bg-teal-950 mt-0.5 overflow-hidden">
                            <div className={`h-full transition-all ${barColor}`} style={{ width: `${Math.min(taxa, 100)}%` }} />
                        </div>
                        {isFantasma && <p className="text-xs text-red-500 mt-1 uppercase font-bold animate-pulse">⚠ FANTASMA: {taxa}% EXECUTADO</p>}
                    </div>
                </CardContent>
            </Card>
            <Handle type="source" position={Position.Bottom} className="!bg-teal-500 !rounded-none w-3 h-3 !border-none" />
        </div>
    );
};
