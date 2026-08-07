"use client";

import { useEffect, useState } from "react";
import { Loader2, Bot, Link as LinkIcon, Check, Copy, ArrowLeft, AlertTriangle, Users, Activity, ListTree, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { TerminalWindow } from "@/components/ui/terminal";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function BillReaderDashboard({ idDeputado, idProjeto }: { idDeputado: string, idProjeto: string }) {
  const router = useRouter();
  const [projeto, setProjeto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);
  
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  useEffect(() => {
    async function fetchProjeto() {
      try {
        const res = await fetch(`/api/perfil/projeto/${idProjeto}`);
        if (!res.ok) throw new Error("Falha ao buscar projeto.");
        const json = await res.json();
        setProjeto(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchProjeto();
  }, [idProjeto]);

  const handleSummarize = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch(`/api/perfil/projeto/${idProjeto}/resumo`, { method: "POST" });
      if (!res.ok) throw new Error("Falha na geração do resumo.");
      const json = await res.json();
      setAiSummary(json.resumo);
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopy = () => {
    if (aiSummary) {
      navigator.clipboard.writeText(aiSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-green-500 font-mono flex flex-col items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-green-500" />
          <p className="animate-pulse uppercase tracking-widest text-sm">Descriptografando projeto de lei...</p>
        </div>
      </div>
    );
  }

  if (error || !projeto) {
    return (
      <div className="min-h-screen flex flex-col bg-black text-green-500 font-mono overflow-x-hidden relative">
        <SiteHeader showSearch={false} />
        <div className="p-4 md:p-8 flex-1">
          <div className="max-w-6xl mx-auto mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <Button 
              variant="ghost" 
              className="text-green-500 hover:text-green-400 hover:bg-green-950 px-3 uppercase tracking-widest text-xs"
              onClick={() => router.push(`/perfil/deputado/${idDeputado}`)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Perfil
            </Button>
          </div>
          <div className="max-w-2xl mx-auto border border-red-500 bg-red-950/20 p-6 rounded-none mt-12">
            <h2 className="text-red-500 text-2xl mb-2 flex items-center gap-2 font-bold uppercase">
              <AlertTriangle /> ERRO_CRITICO
            </h2>
            <p className="text-red-400">{error || "Projeto não encontrado"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black text-green-500 font-mono overflow-x-hidden relative">
      <SiteHeader showSearch={false} />
      
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Button 
            variant="ghost" 
            className="text-green-500 hover:text-green-400 hover:bg-green-950 px-3 uppercase tracking-widest text-xs"
            onClick={() => router.push(`/perfil/deputado/${idDeputado}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Perfil
          </Button>
          <div className="text-left sm:text-right">
            <p className="text-[10px] md:text-xs text-green-500 uppercase tracking-widest">Nível de Acesso: RESTRITO</p>
            <p className="text-[10px] md:text-xs text-green-400 uppercase">Processamento IA Ativado</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-700">
          <TerminalWindow className="p-4 md:p-8 border-green-500/50" scanline={false}>
            <h2 className="text-xl md:text-3xl font-bold text-green-400 mb-2 uppercase break-all">&gt; LEITURA_ANALITICA::PROJETO_{idProjeto}</h2>
            <h3 className="text-lg md:text-xl font-bold text-green-500 mb-2">{projeto.titulo}</h3>
            <p className="text-green-400/80 font-mono text-xs md:text-sm mb-6 border-b border-green-500/20 pb-4">
              Apresentado em {new Date(projeto.data_apresentacao).toLocaleDateString("pt-BR")}
            </p>

            {/* Metadados Adicionais (Autores e Status) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="border border-green-500/30 bg-green-950/10 p-4">
                <h3 className="text-green-500 flex items-center gap-2 font-bold uppercase text-xs tracking-widest mb-3">
                  <Users className="w-4 h-4" /> Autoria
                </h3>
                {projeto.autores_json && projeto.autores_json.length > 0 ? (
                  <ul className="space-y-1">
                    {projeto.autores_json.map((autor: any, idx: number) => (
                      <li key={idx} className="text-green-400 text-sm">{autor.nome} {autor.tipo && `(${autor.tipo})`}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-green-400/50 text-sm">Autoria não informada.</p>
                )}
              </div>
              <div className="border border-green-500/30 bg-green-950/10 p-4">
                <h3 className="text-green-500 flex items-center gap-2 font-bold uppercase text-xs tracking-widest mb-3">
                  <Activity className="w-4 h-4" /> Situação Atual
                </h3>
                <div className="space-y-2">
                  <p className="text-green-300 text-sm font-bold">
                    {projeto.situacao || "Desconhecida"}
                  </p>
                  {projeto.despacho && (
                    <p className="text-green-400/80 text-xs italic border-l-2 border-green-500/30 pl-2">
                      {projeto.despacho}
                    </p>
                  )}
                  {projeto.regime && (
                    <p className="text-green-500 text-[10px] uppercase tracking-widest mt-2">
                      Regime: {projeto.regime}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-green-400/80 uppercase text-[10px] md:text-xs mb-2">Ementa Oficial</h3>
              <p className="text-green-300 leading-relaxed text-base md:text-lg">
                {projeto.ementa}
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
              <button 
                onClick={handleSummarize}
                disabled={aiLoading || !!aiSummary}
                className="w-full sm:w-auto flex justify-center items-center gap-2 px-6 py-3 bg-green-500 text-black font-bold uppercase rounded-none hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
              >
                {aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bot className="w-5 h-5" />}
                {aiSummary ? "Resumo Gerado" : "Decodificar com IA"}
              </button>

              {projeto.texto_integral && (
                <a 
                  href={projeto.texto_integral} 
                  target="_blank" 
                  rel="noreferrer"
                  className="w-full sm:w-auto flex justify-center items-center gap-2 px-6 py-3 border border-green-500 text-green-500 font-bold uppercase rounded-none hover:bg-green-500/10 transition-colors text-xs sm:text-sm"
                >
                  <LinkIcon className="w-4 h-4" /> Abrir no Site da Câmara
                </a>
              )}
            </div>
          </TerminalWindow>

          {/* AI Summary Section - Appears exactly between buttons and the Inteiro Teor */}
          {aiError && (
            <div className="p-4 border border-red-500/50 bg-red-950/20 text-red-500 text-sm rounded-none">
              Falha na conexão com a IA: {aiError}
            </div>
          )}

          {aiSummary && (
            <div className="animate-in slide-in-from-bottom-4">
              <TerminalWindow 
                title="Resumo Descomplicado"
                icon={<Bot className="text-green-500 w-5 h-5 md:w-6 md:h-6" />}
                className="p-4 md:p-8 bg-green-950/20"
                scanline={false}
              >
                <div className="absolute right-0 top-0 mt-4 mr-4 md:mt-8 md:mr-8 z-20">
                  <button 
                    onClick={handleCopy}
                    className="p-2 border border-green-500/30 hover:bg-green-500/20 rounded-none text-green-500 transition-colors flex items-center gap-2 text-xs font-bold uppercase"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="prose prose-invert prose-p:text-green-300 prose-headings:text-green-400 prose-strong:text-green-400 prose-ul:text-green-300 max-w-none mt-4">
                  <div dangerouslySetInnerHTML={{ __html: aiSummary }} />
                </div>
              </TerminalWindow>
            </div>
          )}

          {/* Histórico de Tramitação */}
          {projeto.tramitacoes_json && projeto.tramitacoes_json.length > 0 && (
            <TerminalWindow 
              title="Log de Tramitação"
              icon={<ListTree className="text-green-500 w-5 h-5" />}
              className="p-4 md:p-6 border-green-500/40"
              scanline={false}
            >
              <div className="relative space-y-8 py-4">
                {/* Linha vertical central (desktop) ou esquerda (mobile) */}
                <div className="absolute left-[1.35rem] md:left-1/2 top-0 bottom-0 w-0.5 bg-green-500/20 md:-translate-x-1/2" />

                {[...projeto.tramitacoes_json]
                  .reverse()
                  .slice(0, showFullTimeline ? undefined : 3)
                  .map((tram: any, idx: number) => (
                  <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group py-2">
                    {/* Bolinha */}
                    <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-green-500 bg-black text-green-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_10px_rgba(34,197,94,0.5)] z-10 ml-3 md:ml-0">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    </div>
                    {/* Card de Conteúdo */}
                    <div className="w-[calc(100%-3.5rem)] md:w-[calc(50%-2rem)] border border-green-500/20 bg-black/80 p-4 hover:bg-green-950/40 hover:border-green-500/50 transition-colors z-10">
                      <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-2 gap-2">
                        <span className="font-bold text-green-400 text-sm">{tram.descricaoTramitacao}</span>
                        <span className="text-green-500/60 text-xs font-mono flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          {new Date(tram.dataHora).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <div className="text-green-500/80 text-[10px] mb-3 uppercase tracking-widest font-bold">
                        ÓRGÃO: {tram.siglaOrgao}
                      </div>
                      <p className="text-green-300/90 text-xs leading-relaxed">
                        {tram.despacho}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              {projeto.tramitacoes_json.length > 3 && (
                <div className="flex justify-center mt-6 pt-4 border-t border-green-500/20 relative z-20">
                  <Button
                    variant="ghost"
                    className="text-green-500 hover:text-green-400 hover:bg-green-500/10 uppercase tracking-widest text-xs"
                    onClick={() => setShowFullTimeline(!showFullTimeline)}
                  >
                    {showFullTimeline ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Minimizar Log
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Carregar mais ({projeto.tramitacoes_json.length - 3})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TerminalWindow>
          )}

          {/* Original Full Text in Iframe */}
          {projeto.texto_integral && (
            <section className="p-0 border border-green-500/30 bg-white rounded-none relative overflow-hidden h-200">
              <div className="bg-black border-b border-green-500/30 p-3 flex justify-between items-center">
                <h3 className="text-green-500/80 uppercase text-xs tracking-widest font-bold">Inteiro Teor do Projeto</h3>
              </div>
              <iframe 
                src={projeto.texto_integral} 
                className="w-full h-full border-none bg-white" 
                title="Texto Integral do Projeto"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
