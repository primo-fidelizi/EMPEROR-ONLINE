import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TelaConta } from "@/components/conta/TelaConta";
import { usuarioAtual } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Entrar · Costa Neon" };

export default async function Login() {
  const { usuario } = await usuarioAtual();
  if (usuario) redirect("/mundos");
  return <TelaConta modo="login" />;
}
