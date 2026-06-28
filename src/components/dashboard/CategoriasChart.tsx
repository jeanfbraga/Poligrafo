"use client";

import React, { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const formatCurrency = (val: number) => {
  return val.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

interface Props {
  data: { tipo_despesa: string; total_gasto: number }[];
}

export function CategoriasChart({ data }: Props) {
  // Process and sort data
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data
      .slice(0, 5) // top 5
      .map(item => ({
        name: item.tipo_despesa 
          ? item.tipo_despesa.charAt(0).toUpperCase() + item.tipo_despesa.slice(1).toLowerCase() 
          : "Outros",
        total: item.total_gasto
      }))
      .sort((a, b) => b.total - a.total); // largest first
  }, [data]);

  if (!data || data.length === 0) return null;

  // Cyberpunk/neon green color scale
  const colors = [
    "#10b981", // Emerald 500
    "#059669", // Emerald 600
    "#047857", // Emerald 700
    "#064e3b", // Emerald 900
    "#022c22", // Emerald 950
  ];

  // Custom Tooltip with Cyberpunk style
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/95 border border-green-500/50 p-3 shadow-[0_0_15px_rgba(34,197,94,0.3)] z-[9999] relative">
          <p className="text-green-500 font-bold mb-1 text-sm">{payload[0].payload.name}</p>
          <p className="text-green-400 font-mono text-lg tracking-wider">
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-full min-h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis 
            dataKey="name" 
            type="category" 
            axisLine={false} 
            tickLine={false} 
            width={140}
            tick={{ fill: "#4ade80", fontSize: 12, fontWeight: 500 }}
            tickFormatter={(value) => {
              // Truncate long category names
              return value.length > 20 ? `${value.substring(0, 18)}...` : value;
            }}
          />
          <Tooltip 
            content={<CustomTooltip />} 
            cursor={{ fill: "rgba(34, 197, 94, 0.1)" }} 
            wrapperStyle={{ zIndex: 1000, outline: 'none' }}
          />
          <Bar 
            dataKey="total" 
            radius={[0, 4, 4, 0]} 
            barSize={24}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
