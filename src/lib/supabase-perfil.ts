import { createClient } from "@supabase/supabase-js";

// REGRA DA ARQUITETURA OPEN SOURCE:
// Se as variáveis de perfil não existirem, faz o fallback silencioso para o banco principal.
// Assim, desenvolvedores open source não precisam configurar 2 bancos de dados para rodar o projeto localmente.

const urlPerfil = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL;
const keyPerfil = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY;

const urlPrincipal = process.env.NEXT_PUBLIC_SUPABASE_URL;
const keyPrincipal = process.env.SUPABASE_SERVICE_ROLE_KEY;

const targetUrl = urlPerfil || urlPrincipal;
const targetKey = keyPerfil || keyPrincipal;

if (!targetUrl || !targetKey) {
	console.error(
		"ERRO CRÍTICO: Faltando credenciais administrativas do Supabase.",
		"Nem o banco de perfil nem o banco principal foram encontrados no .env.local",
	);
}

// O Service Role ignora as restrições Row Level Security (RLS)
// MANTENHA ESTE ARQUIVO APENAS NO LADO DO SERVIDOR (API ROUTES / SERVER COMPONENTS)
export const supabasePerfilAdmin = createClient(
	targetUrl || "https://placeholder.supabase.co",
	targetKey || "placeholder",
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	},
);
