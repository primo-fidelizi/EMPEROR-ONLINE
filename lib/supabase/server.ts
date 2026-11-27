import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** Cliente Supabase para Server Components e Route Handlers. Um por requisição. */
export async function criarClienteServidor() {
  // cookies() primeiro: marca a rota como dinâmica (nunca pré-renderizada no build).
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesParaSalvar) {
        try {
          cookiesParaSalvar.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chamado de um Server Component: o proxy.ts já renova a sessão.
        }
      },
    },
  });
}

/** Usuário logado e seu username, ou null. Valida o token no servidor do Supabase. */
export async function usuarioAtual() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, usuario: null };

  const { data: perfil } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", data.user.id)
    .single();

  return {
    supabase,
    usuario: { id: data.user.id, username: perfil?.username ?? "jogador" },
  };
}
