import Link from "next/link";
import { Titulo } from "@/components/ui/Titulo";
import { FormularioConta } from "./FormularioConta";

export function TelaConta({ modo }: { modo: "cadastro" | "login" }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-5 py-12">
      <Link href="/" className="self-start font-bold underline">
        ← Início
      </Link>
      <Titulo nivel={1} className="text-sol text-center">
        {modo === "cadastro" ? "Bora jogar" : "De volta à costa"}
      </Titulo>
      <FormularioConta modo={modo} />
    </main>
  );
}
