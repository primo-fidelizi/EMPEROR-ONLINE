"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";

export function BotaoSair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await criarClienteNavegador().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      disabled={saindo}
      className="borda-mao carimbo bg-papel focus-visible:outline-tinta cursor-pointer px-3 py-1 font-extrabold uppercase focus-visible:outline-4 focus-visible:outline-offset-4"
    >
      Sair
    </button>
  );
}
