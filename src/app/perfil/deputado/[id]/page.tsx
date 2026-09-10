import type { Metadata } from "next";
import ProfileDashboard from "./ProfileDashboard";

function extrairStringParam(val: unknown): string | undefined {
  return typeof val === "string" ? val : undefined;
}

function extrairSufixoPartidoUf(partido?: string, uf?: string): string {
  if (partido && uf) return ` (${partido}-${uf})`;
  return "";
}

function montarTituloDescricao(nome?: string, partido?: string, uf?: string) {
  const sufixo = extrairSufixoPartidoUf(partido, uf);
  if (!nome) {
    return {
      title: "Perfil de Deputado | Polígrafo",
      description: "Auditoria de cota parlamentar, gastos e votos de Deputados Federais no Polígrafo.",
    };
  }
  return {
    title: `Dossiê: ${nome}${sufixo} | Polígrafo`,
    description: `Perfil completo de ${nome}${sufixo}: cota parlamentar (CEAP), secretários de gabinete, assiduidade e histórico de votações.`,
  };
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const nome = extrairStringParam(searchParams.nome);
  const partido = extrairStringParam(searchParams.partido);
  const uf = extrairStringParam(searchParams.uf);
  const foto = extrairStringParam(searchParams.foto);

  const { title, description } = montarTituloDescricao(nome, partido, uf);
  const params = await props.params;

  return {
    title,
    description,
    alternates: {
      canonical: `/perfil/deputado/${params.id}`,
    },
    openGraph: {
      title,
      description,
      type: "profile",
      images: foto ? [{ url: foto }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: foto ? [foto] : undefined,
    },
  };
}

export default async function DeputadoProfilePage(props: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  return (
    <ProfileDashboard idDeputado={params.id} searchParams={searchParams} />
  );
}
