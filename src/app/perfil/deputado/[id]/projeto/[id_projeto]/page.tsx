import BillReaderDashboard from "./BillReaderDashboard";

export default async function ProjetoDeLeiPage(props: {
  params: Promise<{ id: string; id_projeto: string }>;
}) {
  const params = await props.params;
  return <BillReaderDashboard idDeputado={params.id} idProjeto={params.id_projeto} />;
}
