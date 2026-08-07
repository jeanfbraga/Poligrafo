"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { TerminalWindow } from "@/components/ui/terminal";
import { useIsMobile } from "@/hooks/use-mobile";

const VERBA_GABINETE_TETO = 125734.51; // Valor aproximado atual

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function CotaChart({ cota }: { cota: any[] }) {
  const isMobile = useIsMobile();

  if (!cota || cota.length === 0) {
    return (
      <TerminalWindow 
        title={`Cota Parlamentar (CEAP) - ${new Date().getFullYear()}`}
      >
        <p className="text-green-400/80">Nenhum dado de cota encontrado para este deputado.</p>
      </TerminalWindow>
    );
  }

  // Prepara os dados do gráfico para os 12 meses
  const anoReferencia = cota[0]?.ano_referencia || new Date().getFullYear();
  const tetoCEAP = cota[0]?.valor_teto || 0;

  const chartData = MESES.map((nomeMes, index) => {
    const mesNum = index + 1;
    const registro = cota.find((c: any) => c.mes_referencia === mesNum);
    return {
      name: nomeMes,
      gasto: registro ? registro.valor_gasto : 0,
      teto: tetoCEAP,
      mesNum
    };
  });

  return (
    <TerminalWindow 
      title={`Cota Parlamentar (CEAP)`}
      badge={`Ano ${anoReferencia}`}
    >
      <div className="flex flex-col h-full w-full">
        <div className="mb-4 text-xs text-green-400/60 uppercase tracking-widest text-center">
          Evolução de Gastos vs Limites (R$)
        </div>

        {/* Gráfico de Barras */}
        <div className="h-64 sm:h-72 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={isMobile ? { top: 20, right: 0, left: -25, bottom: 0 } : { top: 20, right: 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#15803d" vertical={false} opacity={0.3} />
              <XAxis 
                dataKey="name" 
                stroke="#22c55e" 
                fontSize={isMobile ? 10 : 12} 
                tickMargin={isMobile ? 5 : 10}
                tickFormatter={(value) => isMobile ? value.substring(0, 1) : value}
                axisLine={{ stroke: '#15803d' }}
                tickLine={false}
              />
              <YAxis 
                stroke="#22c55e" 
                fontSize={isMobile ? 10 : 10} 
                width={isMobile ? 45 : 55}
                tickFormatter={(value) => isMobile ? `${(value / 1000).toFixed(0)}k` : `R$ ${(value / 1000).toFixed(0)}k`}
                axisLine={{ stroke: '#15803d' }}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value), name === 'gasto' ? 'Gasto CEAP' : name]}
                labelStyle={{ color: '#22c55e', fontWeight: 'bold' }}
                contentStyle={{ backgroundColor: 'black', border: '1px solid #22c55e', color: '#22c55e', fontFamily: 'monospace', fontSize: isMobile ? '10px' : '12px', padding: isMobile ? '4px 8px' : '10px' }}
                cursor={{ fill: 'rgba(34, 197, 94, 0.1)' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              
              <Bar 
                dataKey="gasto" 
                name="Gasto Realizado" 
                fill="#ef4444" 
                radius={[2, 2, 0, 0]}
                maxBarSize={40}
              />

              {/* Linha de referência Teto CEAP */}
              <ReferenceLine 
                y={tetoCEAP} 
                stroke="#3b82f6" 
                strokeDasharray="4 4" 
                label={{ position: 'top', value: 'Teto CEAP', fill: '#3b82f6', fontSize: 10 }} 
              />
              
              {/* Linha de referência Teto Verba Gabinete */}
              <ReferenceLine 
                y={VERBA_GABINETE_TETO} 
                stroke="#eab308" 
                strokeDasharray="4 4" 
                label={{ position: 'top', value: 'Teto Verba Gabinete', fill: '#eab308', fontSize: 10 }} 
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Resumo Rodapé */}
        <div className="mt-6 pt-4 border-t border-green-500/20 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-center">
            <div className="flex flex-row sm:flex-col justify-between sm:justify-center items-center">
                <p className="text-[10px] md:text-xs text-blue-400/80 uppercase tracking-widest">Teto Mensal CEAP</p>
                <p className="font-mono text-blue-400 text-sm md:text-base">{formatCurrency(tetoCEAP)}</p>
            </div>
            <div className="flex flex-row sm:flex-col justify-between sm:justify-center items-center">
                <p className="text-[10px] md:text-xs text-yellow-400/80 uppercase tracking-widest">Teto Verba Gabinete</p>
                <p className="font-mono text-yellow-400 text-sm md:text-base">{formatCurrency(VERBA_GABINETE_TETO)}</p>
            </div>
        </div>
      </div>
    </TerminalWindow>
  );
}
