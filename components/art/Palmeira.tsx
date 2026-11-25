/** Palmeira + sol, desenho original no traço do jogo (contorno tinta, cores chapadas, sombra dura). */
export function Palmeira({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" className={className} role="img" aria-label="Palmeira ao sol">
      <g
        style={{ filter: "url(#traco-tremido)" }}
        stroke="#141414"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* sol */}
        <circle cx="140" cy="60" r="34" fill="#F6E27A" />
        {/* sombra projetada do tronco */}
        <path
          d="M96 210 C104 160 108 120 104 80 L112 80 C118 120 116 160 112 210 Z"
          fill="#141414"
          transform="translate(10 6)"
        />
        {/* tronco */}
        <path d="M90 210 C98 160 102 120 98 80 L108 80 C114 120 110 160 106 210 Z" fill="#FAF6EA" />
        <path
          d="M95 190 l10 -3 M97 165 l9 -3 M99 140 l8 -3 M100 115 l8 -2"
          fill="none"
          strokeWidth="3"
        />
        {/* folhas */}
        <path d="M103 82 C80 55 50 55 30 72 C55 68 75 72 103 82 Z" fill="#C2549B" />
        <path d="M103 82 C125 50 160 48 180 66 C150 64 128 70 103 82 Z" fill="#C2549B" />
        <path d="M103 82 C95 50 75 30 55 28 C75 45 88 60 103 82 Z" fill="#C2549B" />
        <path d="M103 82 C120 60 130 40 150 30 C140 50 125 65 103 82 Z" fill="#C2549B" />
        <path d="M103 82 C85 85 60 100 52 120 C72 104 88 96 103 82 Z" fill="#C2549B" />
        {/* areia */}
        <path d="M10 212 C60 200 140 200 192 212" fill="none" />
      </g>
    </svg>
  );
}
