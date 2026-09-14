"use client";

import { useEffect, useState } from "react";
import ProfileHeader from "@/components/perfil/ProfileHeader";
import VotingHistory from "@/components/perfil/VotingHistory";
import LegislativeProduction from "@/components/perfil/LegislativeProduction";
import GabineteList from "@/components/perfil/GabineteList";
import CotaChart from "@/components/perfil/CotaChart";
import PerfilPatrimonioCard from "@/components/perfil/PerfilPatrimonioCard";
import { Lock, AlertTriangle, ArrowLeft } from "lucide-react";
import { ScrambleText } from "@/components/ui/scramble-text";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

function hasPerfilData(json: any): boolean {
  if (!json) return false;
  if (json.perfil) return true;
  if (Array.isArray(json.votos) && json.votos.length > 0) return true;
  return Boolean(Array.isArray(json.producao) && json.producao.length > 0);
}

function buildFallbackPerfil(idDeputado: string, searchParams?: Record<string, string | string[] | undefined>) {
  const nomeStr = typeof searchParams?.nome === "string" ? searchParams.nome : undefined;
  const partidoStr = typeof searchParams?.partido === "string" ? searchParams.partido : "N/A";
  const ufStr = typeof searchParams?.uf === "string" ? searchParams.uf : "BR";

  return {
    id_deputado: idDeputado,
    nome_civil: nomeStr,
    nome_eleitoral: nomeStr,
    partido: partidoStr,
    uf: ufStr,
    frentes_parlamentares: [],
    comissoes: [],
    profissoes: []
  };
}

function enrichPerfilFallback(json: any, idDeputado: string, searchParams?: Record<string, string | string[] | undefined>) {
  if (!searchParams?.nome) return;
  const nomeStr = typeof searchParams.nome === "string" ? searchParams.nome : "";

  if (!json.perfil) {
    json.perfil = buildFallbackPerfil(idDeputado, searchParams);
    return;
  }
  if (!json.perfil.nome_civil && !json.perfil.nome_eleitoral) {
    json.perfil.nome_civil = nomeStr;
    json.perfil.nome_eleitoral = nomeStr;
  }
}

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
        
        if (!hasPerfilData(json) && !searchParams?.nome) {
          throw new Error(`Nenhum dado encontrado para o Parlamentar (ID: ${idDeputado}). O banco de dados pode ainda não ter sido sincronizado pela inteligência artificial.`);
        }
        
        enrichPerfilFallback(json, idDeputado, searchParams);
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [idDeputado, searchParams]);

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
        <SiteHeader showOnMobile={true} />
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
      <SiteHeader showSearch={false} showOnMobile={true} />

      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Button 
            variant="ghost" 
            className="text-green-500 hover:text-green-400 hover:bg-green-950 px-3 uppercase tracking-widest text-xs"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div className="text-right">
            <p className="text-xs text-green-700 uppercase tracking-widest">Nível de Acesso: CONFIDENCIAL</p>
            <p className="text-xs text-green-600 uppercase">Origem: DADOS ABERTOS DA CÂMARA</p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700">
          {data.perfil && (
            <ProfileHeader 
              perfil={data.perfil} 
              idDeputado={idDeputado} 
              fotoUrl={typeof searchParams?.foto === "string" ? searchParams.foto : undefined} 
            />
          )}

          {data.tse && (
            <div className="mt-8">
              <PerfilPatrimonioCard tse={data.tse} />
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            <VotingHistory votos={data.votos} idDeputado={idDeputado} />
            <LegislativeProduction producao={data.producao} idDeputado={idDeputado} />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
            <CotaChart cota={data.cota} />
            <GabineteList servidores={data.servidores} />
          </div>
        </div>
      </div>
    </div>
  );
}
