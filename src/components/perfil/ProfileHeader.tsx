"use client";

import { MapPin, Briefcase, Users, Hash } from "lucide-react";
import { TerminalWindow } from "@/components/ui/terminal";

export default function ProfileHeader({ perfil, idDeputado }: { perfil: any; idDeputado: string }) {
  if (!perfil) {
    return (
      <TerminalWindow>
        <p className="text-yellow-500">&gt; ALERTA: Ficha base não encontrada na base local.</p>
      </TerminalWindow>
    );
  }

  return (
    <TerminalWindow className="p-4 md:p-8 border-green-500/50">
      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="shrink-0">
          <div className="w-32 h-40 border-2 border-green-500/50 p-1 relative bg-black/80">
            <img 
              src={`https://www.camara.leg.br/internet/deputado/bandep/${idDeputado}.jpg`} 
              alt="Foto Oficial"
              className="w-full h-full object-cover"
            />
            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-green-500"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-green-500"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-green-500"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-green-500"></div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="border-b border-green-500/20 pb-3 mb-3 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold uppercase text-green-400 tracking-wider">
                {perfil.nome_eleitoral || perfil.nome_civil || "NOME NÃO INFORMADO"}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="px-2 py-1 bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold uppercase">
                  {perfil.partido}
                </span>
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <MapPin className="w-4 h-4" /> {perfil.uf}
                </span>
              </div>
            </div>

            <a 
              href={`/?alvo=${encodeURIComponent(perfil.nome_eleitoral || perfil.nome_civil || "")}&ref=${encodeURIComponent(`FEDERAL:CAMARA:${idDeputado}`)}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/50 text-green-400 hover:text-green-300 text-sm font-bold uppercase tracking-wider transition-colors whitespace-nowrap"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              Investigar Político
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {perfil.profissoes && perfil.profissoes.filter((p: any) => p && p.trim() !== "").length > 0 && (
              <div>
                <h3 className="text-green-400/80 uppercase text-xs mb-1 flex items-center gap-1">
                  <Briefcase className="w-3 h-3" /> Formação / Profissão
                </h3>
                <ul className="list-disc list-inside text-green-400">
                  {perfil.profissoes.filter((p: any) => p && p.trim() !== "").map((p: string, i: number) => (
                    <li key={i} title={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {perfil.comissoes && perfil.comissoes.length > 0 && (
              <div>
                <h3 className="text-green-400/80 uppercase text-xs mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Comissões
                </h3>
                <ul className="list-disc list-inside text-green-400">
                  {perfil.comissoes.slice(0, 3).map((c: string, i: number) => (
                    <li key={i} title={c}>{c}</li>
                  ))}
                  {perfil.comissoes.length > 3 && (
                    <li className="text-green-400/80">+ {perfil.comissoes.length - 3} outras</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          
          {perfil.frentes && perfil.frentes.length > 0 && (
            <div className="pt-2 border-t border-green-500/20">
              <h3 className="text-green-400/80 uppercase text-xs mb-2 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Frentes Parlamentares
              </h3>
              <div className="flex flex-wrap gap-2">
                {perfil.frentes.slice(0, 5).map((f: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-black border border-green-500/20 text-green-400 text-xs" title={f}>
                    {f}
                  </span>
                ))}
                 {perfil.frentes.length > 5 && (
                  <span className="px-2 py-1 bg-black border border-green-500/20 text-green-400/80 text-xs">
                    +{perfil.frentes.length - 5}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </TerminalWindow>
  );
}
