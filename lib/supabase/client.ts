"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** Cliente Supabase no navegador (chave pública + sessão do jogador nos cookies). */
export function criarClienteNavegador() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
