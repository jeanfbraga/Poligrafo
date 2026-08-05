"use client";

import { useEffect, useState } from "react";
import { Loader2, Bot, Link as LinkIcon, Check, Copy } from "lucide-react";
import Link from "next/link";

export default function BillReaderDashboard({ idDeputado, idProjeto }: { idDeputado: string, idProjeto: string }) {
  const [projeto, setProjeto] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);

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
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-green-500" />
        <p className="animate-pulse">Descriptografando projeto de lei...</p>
      </div>
    );
  }

  if (error || !projeto) {
    return (
      <div className="border border-red-500/50 bg-red-950/20 p-6 rounded text-red-500">
        <h2 className="text-xl font-bold mb-2">&gt; ERRO_CRITICO</h2>
        <p>{error || "Projeto não encontrado"}</p>
        <Link href={`/perfil/deputado/${idDeputado}`} className="text-sm mt-4 inline-block hover:underline">
          &lt;- Voltar ao Perfil
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="mb-4">
        <Link href={`/perfil/deputado/${idDeputado}`} className="text-green-500/50 hover:text-green-400 text-sm flex items-center gap-2 transition-colors">
          &lt;- Retornar ao Dossiê do Deputado
        </Link>
      </div>

      <section className="p-6 md:p-8 border border-green-500/50 bg-black/60 rounded-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <FileTextIcon className="w-48 h-48" />
        </div>
        
        <div className="relative z-10">
          <h2 className="text-3xl font-bold text-green-400 mb-2">{projeto.titulo}</h2>
          <p className="text-green-500/60 font-mono text-sm mb-6 border-b border-green-500/20 pb-4">
            Apresentado em {new Date(projeto.data_apresentacao).toLocaleDateString("pt-BR")}
          </p>
          
          <div className="mb-8">
            <h3 className="text-green-500/50 uppercase text-xs mb-2">Ementa Oficial</h3>
            <p className="text-green-300 leading-relaxed text-lg">
              {projeto.ementa}
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <button 
              onClick={handleSummarize}
              disabled={aiLoading || !!aiSummary}
              className="flex items-center gap-2 px-6 py-3 bg-green-500 text-black font-bold uppercase rounded-sm hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bot className="w-5 h-5" />}
              {aiSummary ? "Resumo Gerado" : "Decodificar com IA"}
            </button>

            {projeto.texto_integral && (
              <a 
                href={projeto.texto_integral} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 px-6 py-3 border border-green-500 text-green-500 font-bold uppercase rounded-sm hover:bg-green-500/10 transition-colors"
              >
                <LinkIcon className="w-4 h-4" /> Inteiro Teor Original
              </a>
            )}
          </div>
        </div>
      </section>

      {/* AI Summary Section */}
      {aiError && (
        <div className="p-4 border border-red-500/50 bg-red-950/20 text-red-500 text-sm">
          Falha na conexão com a IA: {aiError}
        </div>
      )}

      {aiSummary && (
        <section className="p-6 md:p-8 border border-green-500 bg-green-950/20 rounded-lg animate-in slide-in-from-bottom-4 relative">
          <div className="flex justify-between items-start mb-6 border-b border-green-500/30 pb-4">
            <h2 className="text-xl font-bold uppercase flex items-center gap-2">
              <Bot className="text-green-500 w-6 h-6" /> 
              Resumo Descomplicado
            </h2>
            <button 
              onClick={handleCopy}
              className="p-2 border border-green-500/30 hover:bg-green-500/20 rounded text-green-500 transition-colors flex items-center gap-2 text-xs font-bold uppercase"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          
          <div className="prose prose-invert prose-p:text-green-300 prose-headings:text-green-400 prose-strong:text-green-400 prose-ul:text-green-300 max-w-none">
            <div dangerouslySetInnerHTML={{ __html: aiSummary }} />
          </div>
        </section>
      )}
    </div>
  );
}

function FileTextIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}
