"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, X, MinusCircle, AlertCircle, ArrowRight, ExternalLink } from "lucide-react";
import { TerminalWindow, TerminalCard, TerminalBadge } from "@/components/ui/terminal";

export default function VotingHistory({ votos, idDeputado }: { votos: any[], idDeputado: string }) {
  const [filter, setFilter] = useState<"TODOS" | "SIM" | "NÃO">("TODOS");

  if (!votos || votos.length === 0) {
    return (
      <TerminalWindow 
        title="Registro_de_Votos" 
        icon={<span className="text-green-500">&gt;</span>}
      >
        <p className="text-green-400/80 text-sm">Nenhum voto registrado no período atual.</p>
      </TerminalWindow>
    );
  }

  const getVoteColor = (voto: string) => {
    switch (voto?.toLowerCase()) {
      case "sim": return "green";
      case "não": return "red";
      case "abstenção": return "yellow";
      default: return "neutral";
    }
  };

  const getVoteIcon = (voto: string) => {
    switch (voto?.toLowerCase()) {
      case "sim": return <Check className="w-4 h-4" />;
      case "não": return <X className="w-4 h-4" />;
      case "abstenção": return <MinusCircle className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const cleanProjetoNome = (nome: string) => {
    if (!nome) return "Votação sem nome";
    // Limpa a string "Sim: 148; não: 292; total: 440."
    return nome.split(/\.\s*Sim:/i)[0];
  };

  const filteredVotos = votos.filter((v: any) => {
    if (filter === "TODOS") return true;
    return v.voto?.toLowerCase() === filter.toLowerCase();
  });

  return (
    <TerminalWindow 
      title="Registro_de_Votos"
      icon={<span className="text-green-500">&gt;</span>}
      badge={`${filteredVotos.length} registros`}
      className="flex flex-col max-h-150"
    >
      <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-green-500/20 pb-4">
        <button 
          onClick={() => setFilter("TODOS")}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${filter === "TODOS" ? "bg-green-500 text-black border-green-500" : "bg-transparent text-green-400 border-green-500/30 hover:border-green-500"}`}
        >
          Todos
        </button>
        <button 
          onClick={() => setFilter("SIM")}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${filter === "SIM" ? "bg-green-500 text-black border-green-500" : "bg-transparent text-green-400 border-green-500/30 hover:border-green-500"}`}
        >
          Sim
        </button>
        <button 
          onClick={() => setFilter("NÃO")}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${filter === "NÃO" ? "bg-red-500 text-black border-red-500" : "bg-transparent text-red-400 border-red-500/30 hover:border-red-500"}`}
        >
          Não
        </button>
      </div>

      <div className="overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
        {filteredVotos.map((v: any) => {
          const content = (
            <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 sm:gap-4">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-bold text-green-300">{cleanProjetoNome(v.projeto_nome)}</p>
                </div>
                {v.projeto_tema && v.projeto_tema !== "Não especificado" && (
                  <p className="text-xs text-green-400 line-clamp-2 leading-relaxed">
                    {v.projeto_tema}
                  </p>
                )}
                <p className="text-[10px] text-green-500/70 mt-3 font-mono">
                  {new Date(v.data_votacao).toLocaleString("pt-BR")}
                </p>
              </div>
              
              <div className="shrink-0 flex items-center gap-3">
                <TerminalBadge color={getVoteColor(v.voto) as any} className="shrink-0">
                  {getVoteIcon(v.voto)}
                  {v.voto}
                </TerminalBadge>
                {v.id_proposicao && (
                  <div className="flex items-center justify-center w-8 h-8 rounded-none bg-green-500/10 group-hover:bg-green-500 group-hover:text-black transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </div>
            </div>
          );

          if (v.id_proposicao) {
            return (
              <Link 
                href={`/perfil/deputado/${idDeputado}/projeto/${v.id_proposicao}`}
                key={v.id_votacao}
                className="block p-4 border border-green-500/20 bg-black/60 hover:bg-green-950/20 hover:border-green-500/50 transition-all group"
              >
                {content}
              </Link>
            );
          }

          return (
            <div key={v.id_votacao} className="block p-4 border border-green-500/20 bg-black/60">
              {content}
            </div>
          );
        })}
        {filteredVotos.length === 0 && (
          <p className="text-green-400/80 text-xs text-center mt-4">Nenhum voto {filter.toLowerCase()} encontrado neste período.</p>
        )}
      </div>
    </TerminalWindow>
  );
}
