"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { criarClienteNavegador } from "@/lib/supabase/client";

const ERROS: Record<string, string> = {
  mundo_encerrado: "Essa temporada já acabou.",
  mundo_inexistente: "Esse mundo não existe mais.",
  sem_territorio: "Você perdeu todos os territórios nesta temporada. Espere a próxima!",
  mapa_cheio: "O mapa lotou. Tente outro mundo.",
  muitas_acoes: "Calma! Espere um segundo e tente de novo.",
};

export function BotaoEntrarMundo({
  worldId,
  slug,
  jaJoga,
}: {
  worldId: string;
  slug: string;
  jaJoga: boolean;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar() {
    setCarregando(true);
    setErro(null);
    const { error } = await criarClienteNavegador().rpc("entrar_no_mundo", { p_world_id: worldId });
    if (error) {
      setErro(ERROS[error.message] ?? "Não deu para entrar agora. Tente de novo.");
      setCarregando(false);
      return;
    }
    router.push(`/jogo/${slug}`);
  }

  return (
    <div className="space-y-2">
      <Botao onClick={entrar} disabled={carregando}>
        {carregando ? "Abrindo o mapa…" : jaJoga ? "Continuar" : "Entrar no mundo"}
      </Botao>
      {erro && (
        <p role="alert" className="text-neon font-bold">
          {erro}
        </p>
      )}
    </div>
  );
}
