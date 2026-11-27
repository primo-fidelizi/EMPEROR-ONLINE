import Link from "next/link";
import { Cartao } from "@/components/ui/Cartao";
import { formatarNumero, formatarTempo, type EstadoTerritorio } from "@/lib/jogo/economia";

const ROTULO = { ataque: "Ataque", espionagem: "Espionagem", retorno: "Voltando de" } as const;

/** Alerta de ataque chegando: vai no topo, em neon, porque é o que mais importa. */
export function AlertaChegando({ estado, agora }: { estado: EstadoTerritorio; agora: number }) {
  if (estado.chegando.length === 0) return null;
  return (
    <div role="alert" className="borda-mao-2 animar-wiggle bg-neon shadow-carimbo-g p-4">
      <p className="titulo-carimbo text-papel text-3xl">Ataque chegando!</p>
      <ul className="mt-2 space-y-1">
        {estado.chegando.map((c, i) => (
          <li key={i} className="borda-mao bg-papel px-3 py-1 font-bold tabular-nums">
            De {c.origem.nome} ({c.origem.x}|{c.origem.y}) em{" "}
            {formatarTempo((Date.parse(c.chega_em) - agora) / 1000)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SecaoMovimentos({
  estado,
  agora,
  slug,
}: {
  estado: EstadoTerritorio;
  agora: number;
  slug: string;
}) {
  const nome = (tipo: string) => estado.tropas.find((t) => t.tipo === tipo)?.nome ?? tipo;

  return (
    <section aria-labelledby="titulo-mov" className="space-y-4">
      <h2 id="titulo-mov" className="titulo-carimbo text-sol text-4xl">
        Na rua
      </h2>
      <Cartao className="space-y-3">
        {estado.movimentos.length === 0 ? (
          <p>
            Nenhuma crew na rua. Abra o{" "}
            <Link href={`/jogo/${slug}/mapa`} className="font-extrabold underline">
              mapa
            </Link>{" "}
            e escolha um alvo.
          </p>
        ) : (
          <ol className="space-y-3">
            {estado.movimentos.map((m) => {
              const restante = (Date.parse(m.chega_em) - agora) / 1000;
              const saque = m.saque.cash + m.saque.material + m.saque.influencia;
              return (
                <li
                  key={m.id}
                  className="border-tinta/30 space-y-1 border-b-2 border-dashed pb-2 last:border-0"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-extrabold">
                      {ROTULO[m.tipo]} {m.alvo.nome}{" "}
                      <span className="font-normal tabular-nums">
                        ({m.alvo.x}|{m.alvo.y})
                      </span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">
                      {restante > 0 ? formatarTempo(restante) : "chegando…"}
                    </span>
                  </div>
                  <p className="text-sm tabular-nums">
                    {Object.entries(m.unidades)
                      .map(([k, q]) => `${q}× ${nome(k)}`)
                      .join(" · ")}
                    {m.tipo === "retorno" &&
                      saque > 0 &&
                      ` · trazendo ${formatarNumero(saque)} de saque`}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </Cartao>
    </section>
  );
}
