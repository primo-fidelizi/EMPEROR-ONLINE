import Link from "next/link";
import { Palmeira } from "@/components/art/Palmeira";
import { Cartao } from "@/components/ui/Cartao";
import { Titulo } from "@/components/ui/Titulo";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 px-5 py-12 text-center">
      <Palmeira className="w-40 sm:w-52" />
      <Titulo nivel={1} className="text-sol">
        Hello Costa Neon
      </Titulo>
      <Cartao className="max-w-md">
        <p className="text-lg font-bold">
          Uma metrópole litorânea, ensolarada e neon. Em breve: negócios, crew, sindicatos e
          temporadas rápidas.
        </p>
        <p className="mt-3 text-sm">Fase 0 no ar. 🌴</p>
      </Cartao>
      <Link
        href="/estilo"
        className="borda-mao carimbo bg-sol focus-visible:outline-tinta px-6 py-3 text-lg font-extrabold uppercase focus-visible:outline-4 focus-visible:outline-offset-4"
      >
        Ver guia de estilo
      </Link>
    </main>
  );
}
