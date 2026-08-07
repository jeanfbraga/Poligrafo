"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { TerminalWindow } from "@/components/ui/terminal";

export default function LegislativeProduction({ producao, idDeputado }: { producao: any[]; idDeputado: string }) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  if (!producao || producao.length === 0) {
    return (
      <TerminalWindow 
        title="Producao_Legislativa"
        icon={<span className="text-green-500">&gt;</span>}
      >
        <p className="text-green-400/80 text-sm">Nenhuma proposição encontrada no período.</p>
      </TerminalWindow>
    );
  }

  return (
    <TerminalWindow 
      title="Producao_Legislativa"
      icon={<span className="text-green-500">&gt;</span>}
      badge={`${producao.length} projetos`}
      className="flex flex-col max-h-150"
    >
      <div className="overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
        {producao.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((p: any) => (
          <Link 
            href={`/perfil/deputado/${idDeputado}/projeto/${p.id_proposicao}`}
            key={p.id_proposicao} 
            className="block p-4 border border-green-500/20 bg-black/60 hover:bg-green-950/20 hover:border-green-500/50 transition-all group"
          >
            <div className="flex justify-between items-start gap-3 sm:gap-4">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-green-500" />
                  <p className="text-sm font-bold text-green-300">{p.titulo}</p>
                </div>
                {p.ementa && (
                  <p className="text-xs text-green-400 line-clamp-2 leading-relaxed">
                    {p.ementa}
                  </p>
                )}
                <p className="text-[10px] text-green-500/70 mt-3 font-mono">
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

      {producao.length > itemsPerPage && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-green-500/20 px-2 pb-2">
          <p className="text-xs text-green-400/80 hidden sm:block">
            Mostrando {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, producao.length)} de {producao.length}
          </p>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 border border-green-500/30 text-green-500 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(producao.length / itemsPerPage), p + 1))}
              disabled={currentPage === Math.ceil(producao.length / itemsPerPage)}
              className="p-1 border border-green-500/30 text-green-500 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </TerminalWindow>
  );
}
