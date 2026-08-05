import BillReaderDashboard from "./BillReaderDashboard";

export default function ProjetoDeLeiPage({
  params,
}: {
  params: { id: string; id_projeto: string };
}) {
  return (
    <main className="min-h-screen bg-neutral-950 text-green-500 font-mono p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b border-green-500/30 pb-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight uppercase">
            &gt; LEITURA_ANALITICA::PROJETO_{params.id_projeto}
          </h1>
          <p className="text-green-500/70 text-sm mt-2">
            Acesso Restrito // Processamento IA Ativado
          </p>
        </header>

        <BillReaderDashboard idDeputado={params.id} idProjeto={params.id_projeto} />
      </div>
    </main>
  );
}
