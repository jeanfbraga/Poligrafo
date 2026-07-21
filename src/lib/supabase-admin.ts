import { createClient } from "@supabase/supabase-js";

// REGRA: NUNCA usar valores placeholder/mock para credenciais.
// Se as variáveis de ambiente estiverem ausentes, o sistema deve falhar explicitamente.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error(
		"ERRO CRÍTICO: Faltando credenciais administrativas do Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
		"Nenhuma operação de cache/persistência será executada. Verifique o .env.local ou o painel da Vercel.",
	);
}

// O Service Role ignora as restrições Row Level Security (RLS)
// MANTENHA ESTE ARQUIVO APENAS NO LADO DO SERVIDOR (API ROUTES)
export const supabaseAdmin = createClient(
	supabaseUrl || "https://placeholder.supabase.co",
	supabaseServiceKey || "placeholder",
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	},
);
