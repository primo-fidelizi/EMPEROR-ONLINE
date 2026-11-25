/**
 * Filtro SVG de "traço tremido" (feTurbulence + feDisplacementMap).
 * Use em formas geradas por código com: style={{ filter: "url(#traco-tremido)" }}
 */
export function FiltroTraco() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <filter id="traco-tremido">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="3" />
      </filter>
    </svg>
  );
}
