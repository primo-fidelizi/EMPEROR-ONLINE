import type { Recurso } from "@/lib/jogo/economia";

/** Ícones originais no traço do jogo: maço de notas, caixote e aperto de mão. */
export function IconeRecurso({
  recurso,
  className = "size-7",
}: {
  recurso: Recurso;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g
        stroke="#141414"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: "url(#traco-tremido)" }}
      >
        {recurso === "cash" && (
          <>
            <rect x="6" y="11" width="23" height="14" fill="#141414" transform="rotate(-8 17 18)" />
            <rect x="4" y="8" width="23" height="14" fill="#F6E27A" transform="rotate(-8 15 15)" />
            <circle cx="15.5" cy="15" r="3.4" fill="#FAF6EA" />
            <path d="M8 11.5l2 -.3M21 19.5l2 -.3" fill="none" />
          </>
        )}
        {recurso === "material" && (
          <>
            <rect x="8" y="9" width="20" height="18" fill="#141414" />
            <rect x="5" y="6" width="20" height="18" fill="#D9D5C5" />
            <path d="M5 12h20M5 18h20M5 6l20 18" fill="none" />
          </>
        )}
        {recurso === "influencia" && (
          <>
            <path d="M5 19l6-6 5 3 5-5 6 6-8 8z" fill="#141414" transform="translate(2 2)" />
            <path d="M5 19l6-6 5 3 5-5 6 6-8 8z" fill="#C2549B" />
            <path d="M12 21l3 3M15 19l3 3M18 17l3 3" fill="none" />
          </>
        )}
      </g>
    </svg>
  );
}
