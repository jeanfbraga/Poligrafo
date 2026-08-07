"use client";

import { useState } from "react";
import { Users, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { TerminalWindow, TerminalBadge } from "@/components/ui/terminal";

export default function GabineteList({ servidores }: { servidores: any[] }) {
  const [filter, setFilter] = useState<"TODOS" | "ATIVOS" | "EXONERADOS">("TODOS");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const getStatus = (periodo: string) => {
    if (periodo && periodo.includes("até")) {
      const parts = periodo.split("até");
      const endStr = parts[1].trim();
      const [day, month, year] = endStr.split("/");
      const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const today = new Date();
      today.setHours(0,0,0,0);
      if (endDate < today) return { badge: "EXONERADO", color: "red" as const };
    }
    return { badge: "ATIVO", color: "green" as const };
  };

  const filteredServidores = servidores?.filter(serv => {
    if (filter === "TODOS") return true;
    const status = getStatus(serv.periodo).badge;
    if (filter === "ATIVOS") return status === "ATIVO";
    if (filter === "EXONERADOS") return status === "EXONERADO";
    return true;
  }) || [];

  if (!servidores || servidores.length === 0) {
    return (
      <TerminalWindow 
        title="Servidores do Gabinete"
        icon={<Users className="w-5 h-5" />}
      >
        <p className="text-green-400/80">Nenhum servidor encontrado na base de dados.</p>
      </TerminalWindow>
    );
  }

  return (
    <TerminalWindow 
      title="Servidores do Gabinete"
      icon={<Users className="w-5 h-5" />}
    >
      <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-green-500/20 pb-4">
        <button 
          onClick={() => { setFilter("TODOS"); setCurrentPage(1); }}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${filter === "TODOS" ? "bg-green-500 text-black border-green-500" : "bg-transparent text-green-400 border-green-500/30 hover:border-green-500"}`}
        >
          Todos ({servidores.length})
        </button>
        <button 
          onClick={() => { setFilter("ATIVOS"); setCurrentPage(1); }}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${filter === "ATIVOS" ? "bg-green-500 text-black border-green-500" : "bg-transparent text-green-400 border-green-500/30 hover:border-green-500"}`}
        >
          Ativos
        </button>
        <button 
          onClick={() => { setFilter("EXONERADOS"); setCurrentPage(1); }}
          className={`px-3 py-1 text-xs font-bold uppercase border transition-colors ${filter === "EXONERADOS" ? "bg-green-500 text-black border-green-500" : "bg-transparent text-green-400 border-green-500/30 hover:border-green-500"}`}
        >
          Exonerados
        </button>
      </div>

      {/* Tabela para Desktop */}
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-green-500/30 text-green-400 text-xs uppercase tracking-widest">
              <th className="pb-3 pr-4 font-normal">Nome</th>
              <th className="pb-3 pr-4 font-normal">Cargo</th>
              <th className="pb-3 pr-4 font-normal">Período / Status</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {filteredServidores.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((serv, index) => (
              <tr 
                key={index} 
                className="border-b border-green-500/10 hover:bg-green-500/5 transition-colors"
              >
                <td className="py-3 pr-4 text-green-400 font-bold uppercase">{serv.nome}</td>
                <td className="py-3 pr-4 text-green-500/80">{serv.cargo || "NÃO INFORMADO"}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-green-400 text-xs">{serv.periodo || "NÃO INFORMADO"}</span>
                    {serv.periodo && (
                      <TerminalBadge color={getStatus(serv.periodo).color as any} className="px-2 py-0.5 text-[10px]">
                        {getStatus(serv.periodo).badge}
                      </TerminalBadge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards para Mobile */}
      <div className="flex flex-col gap-4 md:hidden">
        {filteredServidores.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((serv, index) => (
          <div key={index} className="border border-green-500/20 bg-black/40 p-4 relative overflow-hidden group">
            <div className="flex justify-between items-start gap-2 mb-2">
              <h3 className="text-green-400 font-bold uppercase text-sm">{serv.nome}</h3>
              {serv.periodo && (
                <TerminalBadge color={getStatus(serv.periodo).color as any} className="shrink-0 px-2 py-0.5 text-[10px]">
                  {getStatus(serv.periodo).badge}
                </TerminalBadge>
              )}
            </div>
            <p className="text-green-500/80 text-xs mb-3">{serv.cargo || "NÃO INFORMADO"}</p>
            <div className="text-green-400 text-xs border-t border-green-500/10 pt-2 flex flex-col gap-1">
              <span className="uppercase text-[10px] text-green-500/70">Período</span>
              <span>{serv.periodo || "NÃO INFORMADO"}</span>
            </div>
          </div>
        ))}
      </div>

      {filteredServidores.length === 0 && (
        <p className="text-green-400/80 text-sm mt-4 text-center">Nenhum servidor encontrado para este filtro.</p>
      )}

      {filteredServidores.length > itemsPerPage && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-green-500/20">
          <p className="text-xs text-green-400/80">
            Mostrando {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredServidores.length)} de {filteredServidores.length}
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
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredServidores.length / itemsPerPage), p + 1))}
              disabled={currentPage === Math.ceil(filteredServidores.length / itemsPerPage)}
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
