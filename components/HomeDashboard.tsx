"use client";

import React, { useEffect, useState } from "react";
import { Terminal, Users, Landmark, DollarSign, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";
import { Widget } from "@/components/dashboard/Widget";
import { HybridTooltip } from "@/components/ui/hybrid-tooltip";
import { DashboardList } from "@/components/dashboard/DashboardList";
import { CategoriasChart } from "@/components/dashboard/CategoriasChart";

// Tipagens Rigorosas
interface DashboardData {
  ceapTotal: { total_gasto: string }[];
  ceapTop10: { nome: string; total_gasto: number; partido?: string; uf?: string; foto?: string | null; id_deputado?: number; cargo?: string }[];
  faltosos: { nome: string; ausencias_nao_justificadas: number; partido?: string; uf?: string; foto?: string | null; id_deputado?: number; cargo?: string }[];
  votantes: { nome: string; votos_registrados: number; partido?: string; uf?: string; foto?: string | null; id_deputado?: number; cargo?: string }[];
  ceapCategorias: { tipo_despesa: string; total_gasto: number }[];
  emendasTop10: { autor: string; total_pix: number; id_deputado?: number; foto?: string | null; uf?: string; partido?: string; cargo?: string }[];
  emendasUF: { uf_destino: string; total_pix: number }[];
  pesquisas: { termo: string; quantidade: number; partido?: string; uf?: string; foto?: string | null; id_deputado?: number; cargo?: string }[];
  ceapEstados: Record<string, any[]>;
}

export default function HomeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/home")
      .then(res => res.json())
      .then((d: DashboardData) => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setError(true);
        setLoading(false);
      });
  }, []);

  const anoAtual = new Date().getFullYear();
  const totalCeap = data?.ceapTotal?.filter((item: any) => Number(item.ano) === anoAtual).reduce((acc: number, item: { total_gasto: string }) => acc + Number(item.total_gasto), 0) || 0;

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-[#050505] custom-scrollbar" style={{ backgroundImage: "radial-gradient(circle, #002200 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      
      {/* Mobile-only Header */}
      <div className="md:hidden sticky top-0 z-50 h-14 border-b border-green-500/50 bg-black/95 backdrop-blur-sm flex items-center px-4 gap-2">
          <Terminal className="w-5 h-5 text-green-500" />
          <span className="text-base font-bold tracking-widest text-green-500 uppercase">POLÍGRAFO</span>
          <Badge variant="cyber-green" className="ml-1">IA</Badge>
      </div>

      <div className="max-w-[1600px] w-full mx-auto p-4 md:p-8 pt-6 md:pt-10 pb-28 flex flex-col gap-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
          <div>
            <h2 className="text-green-500 font-bold text-xl md:text-2xl tracking-[0.2em] uppercase flex items-center gap-2">
              <Terminal className="w-6 h-6" />
              Central de Inteligência
            </h2>
            <p className="text-green-700 text-xs mt-1 tracking-widest uppercase">
              Monitoramento em Tempo Real do Congresso Nacional
            </p>
          </div>
          
          {/* Main KPI */}
          <div className="border border-green-500/50 bg-green-950/20 p-4 shrink-0 text-left md:text-right">
            <p className="text-xs text-green-600 uppercase tracking-widest mb-1">Gasto em cota parlamentar este ano</p>
            <div className="text-2xl md:text-3xl font-bold text-green-400">
              {loading ? (
                <span className="animate-pulse">CARREGANDO...</span>
              ) : (
                <AnimatedNumber value={totalCeap} prefix="R$ " isCurrency={true} />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 items-start">
          
          {/* COLUNA ESQUERDA - RANKING ESTADUAL */}
          <div className="w-full xl:w-[400px] shrink-0 flex flex-col gap-4">
            <Widget title="Campeonato estadual de gastos" subtitle="Maiores gastos de Deputados federais (desde Jan/ 2025 - atualiza diariamente)" icon={DollarSign} data={data?.ceapEstados} error={error} loading={loading}>
              <div className="max-h-[715px] overflow-y-auto pr-2 custom-scrollbar">
                {data?.ceapEstados && Object.entries(data.ceapEstados).map(([uf, deputados]) => (
                  <div key={uf} className="mb-6 last:mb-0">
                    <h4 className="text-green-500 font-bold mb-2 uppercase tracking-wider sticky top-0 bg-black/95 py-1 z-10 border-b border-green-900/30">{uf}</h4>
                    <DashboardList 
                      items={deputados.map((item: any) => ({ 
                        label: item.nome, 
                        value: item.total_gasto,
                        profile: item.partido && item.partido !== 'N/A' ? {
                          nome: item.nome,
                          partido: item.partido,
                          uf: item.uf,
                          foto: item.foto,
                          id: item.id_deputado,
                          cargo: item.cargo
                        } : null
                      }))} 
                      isCurrency={true} 
                      valuePrefix="R$ " 
                    />
                  </div>
                ))}
              </div>
            </Widget>
          </div>

          {/* DEMAIS WIDGETS */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* Widget: Top 10 Gastos CEAP */}
            <Widget title="Deputados Federais que mais gastaram" icon={DollarSign} data={data?.ceapTop10} error={error} loading={loading}>
              <DashboardList 
                items={data?.ceapTop10?.map(item => ({ 
                  label: item.nome, 
                  value: item.total_gasto,
                  profile: item.partido && item.partido !== 'N/A' ? {
                    nome: item.nome,
                    partido: item.partido,
                    uf: item.uf,
                    foto: item.foto,
                    id: item.id_deputado,
                    cargo: item.cargo
                  } : null
                }))} 
                isCurrency={true} 
                valuePrefix="R$ " 
              />
            </Widget>

            {/* Widget: Top Faltosos */}
            <Widget title="Mais Faltosos" subtitle="Últimos 90 dias" icon={AlertTriangle} data={data?.faltosos} error={error} loading={loading}>
              <DashboardList 
                items={data?.faltosos?.map(item => ({ 
                  label: item.nome, 
                  value: item.ausencias_nao_justificadas,
                  profile: item.partido && item.partido !== 'N/A' ? {
                    nome: item.nome,
                    partido: item.partido,
                    uf: item.uf,
                    foto: item.foto,
                    id: item.id_deputado,
                    cargo: item.cargo
                  } : null
                }))} 
                valueSuffix=" faltas" 
              />
            </Widget>


            {/* Widget: Categorias CEAP */}
            <Widget title="Categorias de gastos" icon={FileText} data={data?.ceapCategorias} error={error} loading={loading}>
              <CategoriasChart data={data?.ceapCategorias || []} />
            </Widget>

            {/* Widget: Top Emendas PIX */}
            <Widget title="Maiores Emendas PIX" icon={Landmark} data={data?.emendasTop10} error={error} loading={loading}>
              <DashboardList 
                items={data?.emendasTop10?.map(item => ({ 
                  label: item.autor, 
                  value: item.total_pix,
                  profile: item.partido && item.partido !== 'N/A' ? {
                    nome: item.autor,
                    partido: item.partido,
                    uf: item.uf,
                    foto: item.foto,
                    id: item.id_deputado,
                    cargo: item.cargo
                  } : null
                }))} 
                isCurrency={true} 
                valuePrefix="R$ " 
              />
            </Widget>

            {/* Widget: Emendas por UF */}
            <Widget title="Emendas PIX por Estado" subtitle="Destinação de Recursos" icon={Users} data={data?.emendasUF} error={error} loading={loading}>
              <DashboardList 
                items={data?.emendasUF?.map(item => ({ 
                  label: item.uf_destino?.toUpperCase() === "MÚLTIPLO" ? (
                    <HybridTooltip content="Destinada a múltiplos municípios ou regiões simultaneamente.">
                      <span className="cursor-help border-b border-dashed border-amber-400/50 hover:text-amber-300 transition-colors">
                        MÚLTIPLO
                      </span>
                    </HybridTooltip>
                  ) : (
                    item.uf_destino
                  ), 
                  value: item.total_pix 
                }))} 
                isCurrency={true} 
                valuePrefix="R$ " 
              />
            </Widget>

            {/* Widget: Mais Pesquisados */}
            <Widget title="Mais Investigados" subtitle="Pelos usuários do Polígrafo" icon={Terminal} data={data?.pesquisas} error={error} loading={loading}>
              <DashboardList 
                items={data?.pesquisas?.map(item => ({ 
                  label: item.termo.toUpperCase(), 
                  value: item.quantidade,
                  profile: item.partido && item.partido !== 'N/A' ? {
                    nome: item.termo.toUpperCase(),
                    partido: item.partido,
                    uf: item.uf,
                    foto: item.foto,
                    id: item.id_deputado,
                    cargo: item.cargo
                  } : null
                }))} 
                valueSuffix=" buscas"
              />
            </Widget>
          </div>
        </div>
      </div>
    </div>
  );
}
