"use client";

import React, { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ShieldAlert, Terminal, LucideIcon } from "lucide-react";

interface WidgetProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  data: any;
  error: boolean;
  loading: boolean;
  children: React.ReactNode;
}

export function Widget({ title, subtitle, icon: Icon, data, error, loading, children }: WidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!loading && containerRef.current) {
      gsap.from(containerRef.current, {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: "power3.out",
        clearProps: "all"
      });
    }
  }, [loading]);

  return (
    <div ref={containerRef} className="border border-green-900/50 bg-black p-4 relative flex flex-col h-full shadow-[0_0_15px_rgba(0,34,0,0.5)]">
      {/* Canto cortado estilo cyberpunk */}
      <div className="absolute top-0 right-0 w-4 h-4 bg-[#050505] border-l border-b border-green-900/50" style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }} />
      
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-green-900/30">
        <Icon className="w-4 h-4 text-green-500 shrink-0" />
        <div className="flex flex-col">
          <h3 className="text-sm font-bold text-green-500 tracking-widest uppercase leading-tight">{title}</h3>
          {subtitle && <span className="text-xs text-green-700 tracking-wider uppercase mt-0.5">{subtitle}</span>}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {loading ? (
          <div className="animate-pulse flex flex-col gap-2 flex-1 justify-center py-4">
            <div className="h-4 bg-green-900/30 w-full" />
            <div className="h-4 bg-green-900/30 w-5/6" />
            <div className="h-4 bg-green-900/30 w-4/6" />
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <ShieldAlert className="w-6 h-6 text-red-500/50 mb-2" />
            <span className="text-xs text-red-400">Falha ao decodificar dados.</span>
          </div>
        ) : !data || (Array.isArray(data) ? data.length === 0 : Object.keys(data).length === 0) ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <Terminal className="w-6 h-6 text-green-900/50 mb-2" />
            <span className="text-xs text-green-700">Sem registros.</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
