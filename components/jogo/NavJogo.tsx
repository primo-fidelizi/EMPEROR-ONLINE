import Link from "next/link";

type Aba = "territorio" | "mapa" | "relatorios";

export function NavJogo({
  slug,
  ativa,
  naoLidos = 0,
}: {
  slug: string;
  ativa: Aba;
  naoLidos?: number;
}) {
  const abas: Array<{ id: Aba; rotulo: string; href: string }> = [
    { id: "territorio", rotulo: "Território", href: `/jogo/${slug}` },
    { id: "mapa", rotulo: "Mapa", href: `/jogo/${slug}/mapa` },
    { id: "relatorios", rotulo: "Relatórios", href: `/jogo/${slug}/relatorios` },
  ];
  return (
    <nav aria-label="Seções do jogo" className="flex flex-wrap gap-3">
      {abas.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          aria-current={a.id === ativa ? "page" : undefined}
          className={`borda-mao carimbo focus-visible:outline-tinta relative px-4 py-2 font-extrabold uppercase focus-visible:outline-4 focus-visible:outline-offset-4 ${
            a.id === ativa ? "bg-sol" : "bg-papel"
          }`}
        >
          {a.rotulo}
          {a.id === "relatorios" && naoLidos > 0 && (
            <span className="borda-mao bg-neon text-papel absolute -top-3 -right-3 px-2 text-sm tabular-nums">
              {naoLidos}
              <span className="sr-only"> não lidos</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
