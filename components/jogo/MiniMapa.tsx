type Ponto = { id: string; x: number; y: number; meu: boolean };

/**
 * Pedaço do mapa em volta do território (SVG estático no traço do jogo).
 * O mapa de verdade, com pan e zoom em canvas, chega na Fase 3.
 */
export function MiniMapa({
  centro,
  raio,
  pontos,
}: {
  centro: { x: number; y: number };
  raio: number;
  pontos: Ponto[];
}) {
  const lado = raio * 2 + 1;
  const celula = 24;
  const tamanho = lado * celula;

  return (
    <svg
      viewBox={`-6 -6 ${tamanho + 12} ${tamanho + 12}`}
      className="borda-mao-2 bg-mar shadow-carimbo-g w-full max-w-md"
      role="img"
      aria-label={`Mapa em volta de ${centro.x}|${centro.y}: ${pontos.length} territórios por perto`}
    >
      <g stroke="#141414" strokeOpacity="0.15" strokeWidth="1">
        {Array.from({ length: lado + 1 }, (_, i) => (
          <g key={i}>
            <line x1={i * celula} y1={0} x2={i * celula} y2={tamanho} />
            <line x1={0} y1={i * celula} x2={tamanho} y2={i * celula} />
          </g>
        ))}
      </g>
      <g style={{ filter: "url(#traco-tremido)" }} strokeLinejoin="round">
        {pontos.map((p) => {
          const cx = (p.x - centro.x + raio) * celula;
          const cy = (p.y - centro.y + raio) * celula;
          const t = celula - 6;
          return (
            <g key={p.id}>
              <rect x={cx + 6} y={cy + 6} width={t} height={t} fill="#141414" />
              <rect
                x={cx + 3}
                y={cy + 3}
                width={t}
                height={t}
                fill={p.meu ? "#F6E27A" : "#C2549B"}
                stroke="#141414"
                strokeWidth="2.5"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
