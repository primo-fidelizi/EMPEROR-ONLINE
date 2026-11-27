import Link from "next/link";
import { Palmeira } from "@/components/art/Palmeira";
import { Cartao } from "@/components/ui/Cartao";
import { Titulo } from "@/components/ui/Titulo";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-8 px-5 py-12 text-center">
      <Palmeira className="w-40 sm:w-52" />
      <Titulo nivel={1} className="text-sol">
        Costa Neon
      </Titulo>
      <Cartao className="max-w-md">
        <p className="text-lg font-bold">
          Uma metrópole litorânea, ensolarada e neon. Em breve: negócios, crew, sindicatos e
          temporadas rápidas.
        </p>
        <p className="mt-3 text-sm">Crie sua conta em segundos, só com usuário e senha. 🌴</p>
      </Cartao>
      <div className="flex flex-wrap justify-center gap-5">
        <Link
          href="/cadastro"
          className="borda-mao carimbo bg-sol focus-visible:outline-tinta px-6 py-3 text-lg font-extrabold uppercase focus-visible:outline-4 focus-visible:outline-offset-4"
        >
          Jogar agora
        </Link>
        <Link
          href="/login"
          className="borda-mao carimbo bg-papel focus-visible:outline-tinta px-6 py-3 text-lg font-extrabold uppercase focus-visible:outline-4 focus-visible:outline-offset-4"
        >
          Já tenho conta
        </Link>
      </div>
      <Link href="/estilo" className="text-sm font-bold underline">
        Guia de estilo
      </Link>
    </main>
  );
}
