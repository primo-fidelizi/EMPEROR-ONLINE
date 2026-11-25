"use client";

import { useEffect, useRef } from "react";
import { Botao } from "./Botao";

/** Modal com <dialog> nativo: foco, Esc e acessibilidade já vêm do navegador. */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (aberto && !dialog.open) dialog.showModal();
    if (!aberto && dialog.open) dialog.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      aria-label={titulo}
      className="borda-mao-2 bg-papel text-tinta shadow-carimbo-g backdrop:bg-tinta/60 m-auto w-[min(92vw,28rem)] p-6"
    >
      <h2 className="titulo-carimbo text-neon mb-4 text-3xl">{titulo}</h2>
      <div className="mb-6">{children}</div>
      <Botao variante="secundario" onClick={aoFechar}>
        Fechar
      </Botao>
    </dialog>
  );
}
