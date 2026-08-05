import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const idDeputado = params.id;

  if (!idDeputado) {
    return NextResponse.json({ error: "ID do deputado é obrigatório" }, { status: 400 });
  }

  const supabase = supabaseAdmin;
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  try {
    // 1. Perfil Básico (frentes, comissões, profissões)
    const { data: perfilData, error: perfilError } = await supabase
      .from("camara_perfil_politico_cache")
      .select("*")
      .eq("id_deputado", idDeputado)
      .single();

    // 2. Votos Detalhados
    const { data: votosData, error: votosError } = await supabase
      .from("camara_votos_detalhados")
      .select("*")
      .eq("id_deputado", idDeputado)
      .order("data_votacao", { ascending: false });

    // 3. Produção Legislativa
    const { data: producaoData, error: producaoError } = await supabase
      .from("camara_producao_legislativa")
      .select("*")
      .eq("id_deputado", idDeputado)
      .order("ano", { ascending: false });

    return NextResponse.json({
      perfil: perfilData || null,
      votos: votosData || [],
      producao: producaoData || []
    });
  } catch (error: any) {
    console.error("[API Perfil Deputado] Erro ao buscar dados:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a requisição." },
      { status: 500 }
    );
  }
}
