"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Share2 } from "lucide-react";
import { AIProgressBar } from "./AIProgressBar";
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export const ContratoNode = ({ data }: { data: any }) => {
    const isEmenda = data.label?.startsWith('EMENDA');
    const nodeRef = React.useRef<HTMLDivElement>(null);

    useGSAP(() => {
        gsap.from(nodeRef.current, { scale: 0.8, opacity: 0, duration: 0.5, ease: 'power2.out' });
    }, { scope: nodeRef });

    return (
        <div ref={nodeRef}>
            <Handle type="target" position={Position.Top} className="!bg-yellow-500 !rounded-none w-3 h-3 !border-none" />
            <Card 
                className={`w-64 bg-black border-yellow-500 rounded-none font-mono relative transition-transform duration-500 origin-center ${data.metrics?.suspicious ? 'ring-2 ring-red-500 !border-red-500' : ''}`}
                style={{ transform: `scale(${1 + (data.metrics?.pagerank || 0) * 0.3})`, zIndex: data.metrics?.suspicious ? 10 : 1 }}
            >
                <CardHeader className="flex flex-col gap-2 pb-2 space-y-0 border-b border-yellow-500 relative">
                    <div className="flex justify-between items-start pr-8">
                        <Badge variant="outline" className="w-fit bg-yellow-950/30 text-yellow-500 border-yellow-500 rounded-none text-xs uppercase">
                            {isEmenda ? '[EMENDA_PARLAMENTAR]' : '[CONTRATO_FEDERAL]'}
                        </Badge>
                        {data.onShare && (
                            <button onClick={(e) => { e.stopPropagation(); data.onShare(data, 'CONTRATO'); }} className="w-10 h-10 flex items-center justify-center absolute top-1 right-1 hover:bg-white/10 transition-colors z-10 rounded-full text-yellow-500">
                                <Share2 className="h-4 w-4 opacity-70" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 text-yellow-500 shrink-0 mt-1" />
                        <CardTitle className="text-sm font-bold uppercase tracking-wider line-clamp-2 text-yellow-500" title={data.label}>
                            {data.label}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-2">
                    <div>
                        <p className="text-xs text-yellow-500 uppercase font-bold">Objeto / Destinação</p>
                        <p className="text-xs mt-1 text-yellow-400 line-clamp-3" title={data.objeto}>
                            &gt; {data.objeto || "N/A"}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-yellow-500 uppercase font-bold">Valor</p>
                        <p className="text-sm font-bold mt-1 text-yellow-400">
                            R$ {Number(data.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    </div>

                    {data.motivo_ia && data.codigo !== "TSE-BENS" && (
                        <AIProgressBar score={data.score_letalidade} motivo={data.motivo_ia} />
                    )}
                </CardContent>
            </Card>
            <Handle type="source" position={Position.Bottom} className="!bg-yellow-500 !rounded-none w-3 h-3 !border-none" />
        </div>
    );
};
