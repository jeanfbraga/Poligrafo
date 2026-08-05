"use client";

import { MapPin, Briefcase, Users, Hash } from "lucide-react";

export default function ProfileHeader({ perfil, idDeputado }: { perfil: any; idDeputado: string }) {
  if (!perfil) {
    return (
      <section className="p-6 border border-green-500/30 bg-black/50 rounded-none">
        <p className="text-yellow-500">&gt; ALERTA: Ficha base não encontrada na base local.</p>
      </section>
    );
  }

  return (
    <section className="relative p-6 md:p-8 border border-green-500/50 bg-black/60 rounded-none overflow-hidden group">
      {/* Scanline effect */}
      <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(34,197,94,0.05)_50%)] bg-size-[100%_4px] pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity"></div>
      
      <div className="flex flex-col md:flex-row gap-6 items-start relative z-10">
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
          <div className="border-b border-green-500/20 pb-3 mb-3">
            <h1 className="text-2xl font-bold uppercase text-green-400 tracking-wider">
              {perfil.nome_eleitoral || perfil.nome_civil || "NOME NÃO INFORMADO"}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="px-2 py-1 bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold uppercase">
                {perfil.partido}
              </span>
              <span className="flex items-center gap-1 text-green-500/70 text-sm">
                <MapPin className="w-4 h-4" /> {perfil.uf}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {perfil.profissoes && perfil.profissoes.length > 0 && (
              <div>
                <h3 className="text-green-500/50 uppercase text-xs mb-1 flex items-center gap-1">
                  <Briefcase className="w-3 h-3" /> Formação / Profissão
                </h3>
                <ul className="list-disc list-inside text-green-400/90">
                  {perfil.profissoes.map((p: string, i: number) => (
                    <li key={i} title={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {perfil.comissoes && perfil.comissoes.length > 0 && (
              <div>
                <h3 className="text-green-500/50 uppercase text-xs mb-1 flex items-center gap-1">
                  <Users className="w-3 h-3" /> Comissões
                </h3>
                <ul className="list-disc list-inside text-green-400/90">
                  {perfil.comissoes.slice(0, 3).map((c: string, i: number) => (
                    <li key={i} title={c}>{c}</li>
                  ))}
                  {perfil.comissoes.length > 3 && (
                    <li className="text-green-500/50">+ {perfil.comissoes.length - 3} outras</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          
          {perfil.frentes && perfil.frentes.length > 0 && (
            <div className="pt-2 border-t border-green-500/20">
              <h3 className="text-green-500/50 uppercase text-xs mb-2 flex items-center gap-1">
                <Hash className="w-3 h-3" /> Frentes Parlamentares
              </h3>
              <div className="flex flex-wrap gap-2">
                {perfil.frentes.slice(0, 5).map((f: string, i: number) => (
                  <span key={i} className="px-2 py-1 bg-black border border-green-500/20 text-green-500/70 text-xs" title={f}>
                    {f}
                  </span>
                ))}
                 {perfil.frentes.length > 5 && (
                  <span className="px-2 py-1 bg-black border border-green-500/20 text-green-500/50 text-xs">
                    +{perfil.frentes.length - 5}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
