import ProfileDashboard from "./ProfileDashboard";

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
