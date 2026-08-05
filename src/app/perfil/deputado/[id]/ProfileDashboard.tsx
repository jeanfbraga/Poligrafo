"use client";

import { useEffect, useState } from "react";
import ProfileHeader from "@/components/perfil/ProfileHeader";
import VotingHistory from "@/components/perfil/VotingHistory";
import LegislativeProduction from "@/components/perfil/LegislativeProduction";
import { Lock, AlertTriangle, ArrowLeft } from "lucide-react";
import { ScrambleText } from "@/components/ui/scramble-text";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function ProfileDashboard({ 
  idDeputado, 
  searchParams 
}: { 
  idDeputado: string,
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/perfil/deputado/${idDeputado}`);
        if (!res.ok) throw new Error("Falha ao buscar dados do perfil.");
        const json = await res.json();
        
        const hasDbData = json && (json.perfil || json.votos?.length > 0 || json.producao?.length > 0);
        
        // Se não houver dados no banco E não houver nome nos searchParams, aí sim quebramos
        if (!hasDbData && !searchParams?.nome) {
          throw new Error(`Nenhum dado encontrado para o Parlamentar (ID: ${idDeputado}). O banco de dados pode ainda não ter sido sincronizado pela inteligência artificial.`);
        }
        
        // Cria um perfil de fallback caso não exista no DB
        if (!json.perfil && searchParams?.nome) {
            json.perfil = {
                id_deputado: idDeputado,
                nome_civil: searchParams.nome,
                nome_eleitoral: searchParams.nome,
                partido: searchParams.partido || "N/A",
                uf: searchParams.uf || "BR",
                frentes_parlamentares: [],
                comissoes: [],
                profissoes: []
            };
        }
        
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [idDeputado, searchParams?.nome, searchParams?.partido, searchParams?.uf]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <Lock className="w-12 h-12 mb-4" />
          <p className="text-base md:text-xl tracking-widest uppercase text-center px-4">
            <ScrambleText text="Acessando base de dados federal..." duration={1500} />
          </p>
          <p className="text-xs md:text-sm mt-2 text-green-700 text-center px-4">
            <ScrambleText text="Decriptando histórico parlamentar" duration={1000} delay={500} />
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col">
        <SiteHeader />
        <div className="p-4 md:p-8 flex-1">
          <div className="max-w-6xl mx-auto mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <Button 
              variant="ghost" 
              className="text-green-500 hover:text-green-400 hover:bg-green-950 px-3 uppercase tracking-widest text-xs"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
          </div>
          <div className="max-w-2xl mx-auto border border-red-500 bg-red-950/20 p-6 rounded-none mt-12">
            <h2 className="text-red-500 text-2xl mb-2 flex items-center gap-2 font-bold uppercase">
              <AlertTriangle /> ACESSO NEGADO / ERRO
            </h2>
            <p className="text-red-400">{error || "Falha desconhecida ao buscar os dados."}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-green-500 font-mono overflow-x-hidden relative">
      {/* Top Bar padronizada */}
      <SiteHeader />

      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Button 
            variant="ghost" 
            className="text-green-500 hover:text-green-400 hover:bg-green-950 px-3 uppercase tracking-widest text-xs"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div className="text-right">
            <p className="text-xs text-green-700 uppercase tracking-widest">Nível de Acesso: CONFIDENCIAL</p>
            <p className="text-xs text-green-600 uppercase">Origem: DADOS ABERTOS DA CÂMARA</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700">
          {data.perfil && <ProfileHeader perfil={data.perfil} idDeputado={idDeputado} />}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <VotingHistory votos={data.votos} />
            <LegislativeProduction producao={data.producao} idDeputado={idDeputado} />
          </div>
        </div>
      </div>
    </div>
  );
}
