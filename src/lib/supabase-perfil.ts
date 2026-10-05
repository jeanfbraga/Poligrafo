import { createClient } from "@supabase/supabase-js";

// REGRA DA ARQUITETURA OPEN SOURCE:
// Fora da Vercel, se as variáveis de perfil não existirem, usa o banco principal.
// Assim, desenvolvedores open source não precisam configurar 2 bancos de dados para rodar o projeto localmente.

const urlPerfil = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL;
const keyPerfil =
	process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY ||
	process.env.NEXT_PUBLIC_SUPABASE_PERFIL_ANON_KEY ||
	process.env.SUPABASE_PERFIL_ANON_KEY;

const urlPrincipal = process.env.NEXT_PUBLIC_SUPABASE_URL;
const keyPrincipal = process.env.SUPABASE_SERVICE_ROLE_KEY;

// REGRA DE SEGURANÇA E INTEGRIDADE:
// Exige o par completo (URL + Service Key) para usar o banco dedicado de perfis.
// Evita misturar a URL de um projeto com a chave de outro projeto (erro de JWT / 401).
const hasFullPerfil = Boolean(urlPerfil && keyPerfil);

// REGRA DA ARQUITETURA DE PRODUÇÃO:
// No site publicado (Vercel, produção e preview) os dados de perfil ficam SÓ no banco separado
// (limite de armazenamento do principal). Sem a config dele, NÃO cai no principal: as consultas
// falham e o erro aparece no log, em vez de servir dados incompletos de outro banco.
const naVercel = Boolean(process.env.VERCEL_ENV);
const usaPrincipal = !hasFullPerfil && !naVercel;
const targetUrl = hasFullPerfil ? urlPerfil! : usaPrincipal ? urlPrincipal : undefined;
const targetKey = hasFullPerfil ? keyPerfil! : usaPrincipal ? keyPrincipal : undefined;

/** false = site publicado sem o banco de perfil configurado (as consultas de perfil vão falhar). */
export const bancoPerfilConfigurado = hasFullPerfil || usaPrincipal;

if (!hasFullPerfil && naVercel) {
	console.error(
		"[SUPABASE PERFIL] Banco de perfil não configurado neste deploy. Defina NEXT_PUBLIC_SUPABASE_PERFIL_URL e SUPABASE_PERFIL_SERVICE_ROLE_KEY na Vercel.",
	);
} else if (urlPerfil && !keyPerfil) {
	console.warn(
		"[SUPABASE PERFIL] NEXT_PUBLIC_SUPABASE_PERFIL_URL definida sem SUPABASE_PERFIL_SERVICE_ROLE_KEY. Usando banco principal (só fora da Vercel).",
	);
}

if (bancoPerfilConfigurado && (!targetUrl || !targetKey)) {
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
