import type { Metadata } from "next";
import ProfileDashboard from "./ProfileDashboard";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const searchParams = await props.searchParams;

  const nome = typeof searchParams.nome === "string" ? searchParams.nome : undefined;
  const partido = typeof searchParams.partido === "string" ? searchParams.partido : undefined;
  const uf = typeof searchParams.uf === "string" ? searchParams.uf : undefined;
  const foto = typeof searchParams.foto === "string" ? searchParams.foto : undefined;

  const title = nome
    ? `Dossiê: ${nome}${partido && uf ? ` (${partido}-${uf})` : ""} | Polígrafo`
    : `Perfil de Deputado | Polígrafo`;

  const description = nome
    ? `Perfil completo de ${nome}${partido && uf ? ` (${partido}-${uf})` : ""}: cota parlamentar (CEAP), secretários de gabinete, assiduidade e histórico de votações.`
    : `Auditoria de cota parlamentar, gastos e votos de Deputados Federais no Polígrafo.`;

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
