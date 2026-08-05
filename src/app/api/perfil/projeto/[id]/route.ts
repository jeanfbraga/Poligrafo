import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const idProjeto = params.id;

  if (!idProjeto) {
    return NextResponse.json({ error: "ID do projeto é obrigatório" }, { status: 400 });
  }

  const supabase = supabaseAdmin;
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  try {
    const { data, error } = await supabase
      .from("camara_producao_legislativa")
      .select("*")
      .eq("id_proposicao", idProjeto)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Projeto não encontrado no banco de dados." },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API Projeto] Erro ao buscar dados:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a requisição." },
      { status: 500 }
    );
  }
}
