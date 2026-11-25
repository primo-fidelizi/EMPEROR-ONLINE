"use client";

import { useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { Cartao } from "@/components/ui/Cartao";
import { Modal } from "@/components/ui/Modal";

export function DemoInterativa() {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-5">
        <Botao>Subir tudo</Botao>
        <Botao variante="secundario">Coletar</Botao>
        <Botao variante="perigo">Atacar</Botao>
        <Botao disabled>Sem Cash</Botao>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Cartao>
          <p className="text-2xl font-extrabold">Garagem · nível 3</p>
          <p className="tabular-nums">Próximo nível: 1.200 Cash · 800 Material · 4 min</p>
        </Cartao>
        <Cartao destaque>
          <p className="text-2xl font-extrabold">Cartão em destaque</p>
          <p>Para recursos e conquistas.</p>
        </Cartao>
      </div>

      <Botao variante="secundario" onClick={() => setAberto(true)}>
        Abrir modal
      </Botao>
      <Modal aberto={aberto} aoFechar={() => setAberto(false)} titulo="Ataque chegando!">
        <p className="font-semibold">Uma crew inimiga chega ao seu território em 02:14.</p>
      </Modal>
    </div>
  );
}
