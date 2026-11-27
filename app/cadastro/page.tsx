import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TelaConta } from "@/components/conta/TelaConta";
import { usuarioAtual } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Criar conta · Costa Neon" };

export default async function Cadastro() {
  const { usuario } = await usuarioAtual();
  if (usuario) redirect("/mundos");
  return <TelaConta modo="cadastro" />;
}
