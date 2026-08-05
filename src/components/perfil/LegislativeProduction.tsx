"use client";

import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";

export default function LegislativeProduction({ producao, idDeputado }: { producao: any[]; idDeputado: string }) {
  if (!producao || producao.length === 0) {
    return (
      <section className="p-6 border border-green-500/30 bg-black/40 rounded-none">
        <h2 className="text-xl font-bold mb-4 uppercase flex items-center gap-2">
          <span className="text-green-500">&gt;</span> Producao_Legislativa
        </h2>
        <p className="text-green-500/50 text-sm">Nenhuma proposição encontrada no período.</p>
      </section>
    );
  }

  return (
    <section className="p-6 border border-green-500/30 bg-black/40 rounded-none flex flex-col max-h-150">
      <h2 className="text-xl font-bold mb-4 uppercase flex items-center gap-2 shrink-0">
        <span className="text-green-500">&gt;</span> Producao_Legislativa
        <span className="text-xs font-normal bg-green-500/20 px-2 py-0.5 rounded-none text-green-400">
          {producao.length} projetos
        </span>
      </h2>
      
      <div className="overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
        {producao.map((p: any) => (
          <Link 
            href={`/perfil/deputado/${idDeputado}/projeto/${p.id_proposicao}`}
            key={p.id_proposicao} 
            className="block p-4 border border-green-500/20 bg-black/60 hover:bg-green-950/20 hover:border-green-500/50 transition-all group"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-green-500" />
                  <p className="text-sm font-bold text-green-300">{p.titulo}</p>
                </div>
                {p.ementa && (
                  <p className="text-xs text-green-500/70 line-clamp-2 leading-relaxed">
                    {p.ementa}
                  </p>
                )}
                <p className="text-[10px] text-green-500/40 mt-3 font-mono">
                  {new Date(p.data_apresentacao).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-none bg-green-500/10 group-hover:bg-green-500 group-hover:text-black transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
