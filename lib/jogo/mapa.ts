/** Cálculos do mapa (só previsão e desenho; quem decide viagem e batalha é o banco). */

export const TAMANHO_PEDACO = 40; // cada pedaço = uma chamada mapa_regiao de 40×40

export type TerritorioMapa = {
  id: string;
  x: number;
  y: number;
  nome: string;
  bairro: string;
  dono_id: string | null;
  dono: string | null;
  pontos: number | null;
  protegido: boolean;
  meu: boolean;
};

export type Camera = { x: number; y: number; zoom: number };

/** Pedaços (chunks) necessários para cobrir a área visível, dentro dos limites do mapa. */
export function pedacosVisiveis(
  cam: Camera,
  largura: number,
  altura: number,
  tamanho: number,
): Array<[number, number]> {
  const meiaL = largura / 2 / cam.zoom;
  const meiaA = altura / 2 / cam.zoom;
  const x0 = Math.max(0, Math.floor(cam.x - meiaL));
  const y0 = Math.max(0, Math.floor(cam.y - meiaA));
  const x1 = Math.min(tamanho - 1, Math.ceil(cam.x + meiaL));
  const y1 = Math.min(tamanho - 1, Math.ceil(cam.y + meiaA));
  const out: Array<[number, number]> = [];
  for (let cx = Math.floor(x0 / TAMANHO_PEDACO); cx <= Math.floor(x1 / TAMANHO_PEDACO); cx++) {
    for (let cy = Math.floor(y0 / TAMANHO_PEDACO); cy <= Math.floor(y1 / TAMANHO_PEDACO); cy++) {
      out.push([cx, cy]);
    }
  }
  return out;
}

export function distancia(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Mesma fórmula do banco: distância × min/campo da unidade mais lenta × 60 ÷ velocidade. */
export function preverViagemSegundos(
  dist: number,
  minPorCampoMaisLento: number,
  velocidade: number,
): number {
  return Math.max(1, Math.round((dist * minPorCampoMaisLento * 60) / velocidade));
}

export function limitarZoom(zoom: number, largura: number, altura: number): number {
  const minimo = Math.max(4, Math.max(largura, altura) / 120); // no máximo ~120 casas na tela
  return Math.min(56, Math.max(minimo, zoom));
}

export const COR = {
  mar: "#1FB6D5",
  sol: "#F6E27A",
  neon: "#C2549B",
  tinta: "#141414",
  papel: "#FAF6EA",
  concreto: "#D9D5C5",
} as const;

export function corDoTerritorio(t: TerritorioMapa): string {
  if (t.meu) return COR.sol;
  if (!t.dono_id) return COR.concreto;
  return COR.neon;
}
