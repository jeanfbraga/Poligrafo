"use client";

import { Check, X, MinusCircle, AlertCircle } from "lucide-react";

export default function VotingHistory({ votos }: { votos: any[] }) {
  if (!votos || votos.length === 0) {
    return (
      <section className="p-6 border border-green-500/30 bg-black/40 rounded-none">
        <h2 className="text-xl font-bold mb-4 uppercase flex items-center gap-2">
          <span className="text-green-500">&gt;</span> Registro_de_Votos
        </h2>
        <p className="text-green-500/50 text-sm">Nenhum voto registrado no período atual.</p>
      </section>
    );
  }

  const getVoteColor = (voto: string) => {
    switch (voto?.toLowerCase()) {
      case "sim": return "text-green-400 bg-green-400/10 border-green-400/30";
      case "não": return "text-red-400 bg-red-400/10 border-red-400/30";
      case "abstenção": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
      default: return "text-neutral-400 bg-neutral-400/10 border-neutral-400/30";
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

  return (
    <section className="p-6 border border-green-500/30 bg-black/40 rounded-none flex flex-col max-h-150">
      <h2 className="text-xl font-bold mb-4 uppercase flex items-center gap-2 shrink-0">
        <span className="text-green-500">&gt;</span> Registro_de_Votos
        <span className="text-xs font-normal bg-green-500/20 px-2 py-0.5 rounded-none text-green-400">
          {votos.length} registros
        </span>
      </h2>
      
      <div className="overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
        {votos.map((v: any) => (
          <div key={v.id_votacao} className="p-3 border border-green-500/10 bg-black/60 hover:border-green-500/40 transition-colors">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <p className="text-sm font-bold text-green-300">{v.projeto_nome}</p>
                {v.projeto_tema && v.projeto_tema !== "Não especificado" && (
                  <p className="text-xs text-green-500/60 mt-1">{v.projeto_tema}</p>
                )}
                <p className="text-[10px] text-green-500/40 mt-2 font-mono">
                  {new Date(v.data_votacao).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 border rounded-none text-sm font-bold uppercase ${getVoteColor(v.voto)}`}>
                {getVoteIcon(v.voto)}
                {v.voto}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
