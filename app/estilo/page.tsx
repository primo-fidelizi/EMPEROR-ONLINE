import type { Metadata } from "next";
import Link from "next/link";
import { Cartao } from "@/components/ui/Cartao";
import { Titulo } from "@/components/ui/Titulo";
import { DemoInterativa } from "./DemoInterativa";

export const metadata: Metadata = {
  title: "Guia de estilo · Costa Neon",
  robots: { index: false },
};

const paleta = [
  { token: "mar", hex: "#1FB6D5", uso: "Fundo principal, mapa", classe: "bg-mar" },
  { token: "sol", hex: "#F6E27A", uso: "Destaques, botões primários, recursos", classe: "bg-sol" },
  { token: "neon", hex: "#C2549B", uso: "Alertas, ataques, inimigos", classe: "bg-neon" },
  { token: "tinta", hex: "#141414", uso: "Contornos, sombras, texto", classe: "bg-tinta" },
  { token: "papel", hex: "#FAF6EA", uso: "Painéis, cartões, modais", classe: "bg-papel" },
  { token: "concreto", hex: "#D9D5C5", uso: "Neutros, desabilitados", classe: "bg-concreto" },
];

export default function Estilo() {
  return (
    <main className="mx-auto max-w-5xl space-y-12 px-5 py-10">
      <header className="space-y-3">
        <Link href="/" className="font-bold underline">
          ← Início
        </Link>
        <Titulo nivel={1} className="text-papel">
          Guia de estilo
        </Titulo>
        <p className="bg-papel/90 max-w-xl rounded-md p-3 font-semibold">
          Toda tela nova do Costa Neon deve parecer pertencer a esta página: traço à mão, cores
          chapadas e sombra preta dura.
        </p>
      </header>

      <section className="space-y-4">
        <Titulo nivel={2} className="text-sol">
          Paleta
        </Titulo>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          {paleta.map((cor) => (
            <Cartao key={cor.token} className="space-y-2">
              <div className={`borda-mao h-16 ${cor.classe}`} />
              <p className="text-xl font-extrabold">{cor.token}</p>
              <p className="font-mono text-sm tabular-nums">{cor.hex}</p>
              <p className="text-sm">{cor.uso}</p>
            </Cartao>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Titulo nivel={2} className="text-sol">
          Tipografia
        </Titulo>
        <Cartao className="space-y-3">
          <p className="titulo-carimbo text-neon text-5xl">Caveat Brush</p>
          <p>Títulos: letreiro à mão, caixa alta, sombra sólida deslocada.</p>
          <p className="text-lg">
            Texto corrido em <strong>Nunito</strong>. Números do jogo usam{" "}
            <span className="tabular-nums">tabular-nums: 1.234.567 Cash</span>.
          </p>
        </Cartao>
      </section>

      <section className="space-y-4">
        <Titulo nivel={2} className="text-sol">
          Botões, cartões e modal
        </Titulo>
        <DemoInterativa />
      </section>
    </main>
  );
}
