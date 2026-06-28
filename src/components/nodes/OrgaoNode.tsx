"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { AIProgressBar } from "./AIProgressBar";

export const OrgaoNode = ({ data }: { data: any }) => {
    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-emerald-500 !rounded-none w-3 h-3 !border-none" />
            <Card className="w-72 bg-black border-emerald-500 rounded-none font-mono text-emerald-400">
                <CardHeader className="flex flex-col gap-2 pb-2 border-b border-emerald-900">
                    <Badge variant="outline" className="w-fit bg-emerald-950/30 text-emerald-400 border-emerald-500 rounded-none text-xs uppercase">
                        INSTITUIÇÃO PÚBLICA
                    </Badge>
                    <div className="flex items-start gap-2">
                        <Building2 className="h-4 w-4 shrink-0 mt-1" />
                        <CardTitle className="text-sm font-bold uppercase tracking-wider line-clamp-2" title={data.label}>{data.label}</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="pt-3 space-y-2">
                    <div><p className="text-xs uppercase font-bold text-emerald-600">Esfera</p><p className="text-xs uppercase">{data.esfera}</p></div>

                    {data.motivo_ia && (
                        <AIProgressBar score={data.score_letalidade} motivo={data.motivo_ia} />
                    )}

                    {data.isSearching ? (
                        <div className="mt-4 pt-3 border-t border-emerald-900/50">
                            <p className="text-xs text-emerald-500 mb-1 uppercase animate-pulse flex justify-between">
                                <span>Interceptando Notas...</span>
                                <span>[■■■■]</span>
                            </p>
                            <div className="w-full h-1 bg-emerald-950 overflow-hidden">
                                <div className="h-full bg-emerald-500 w-1/3 animate-[slide_1.5s_ease-in-out_infinite]" style={{ animationName: 'slideRight' }}></div>
                            </div>
                        </div>
                    ) : (
                        data.hasDeepDive && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); data.onDeepDive?.(data.id, data.nomePolitico, data.casa); }}
                                className="w-full mt-3 bg-emerald-950/30 border-emerald-500/50 text-emerald-500 hover:bg-emerald-900/50 hover:text-emerald-400 text-xs uppercase tracking-wider rounded-none font-mono"
                            >
                                [ Aprofundar Buscas ]
                            </Button>
                        )
                    )}
                </CardContent>
            </Card>
            <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !rounded-none w-3 h-3 !border-none" />
        </>
    );
};
