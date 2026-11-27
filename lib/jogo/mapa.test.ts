import { describe, expect, it } from "vitest";
import { limitarZoom, pedacosVisiveis, preverViagemSegundos } from "./mapa";

describe("mapa", () => {
  it("pede só os pedaços visíveis e dentro do mapa", () => {
    // 400×400 px com zoom 10 = 40×40 casas centradas em 250,250 → casas 230..270
    expect(pedacosVisiveis({ x: 250, y: 250, zoom: 10 }, 400, 400, 500)).toEqual([
      [5, 5],
      [5, 6],
      [6, 5],
      [6, 6],
    ]);
    // canto do mapa: nada de pedaço negativo
    expect(pedacosVisiveis({ x: 0, y: 0, zoom: 10 }, 400, 400, 500)).toEqual([[0, 0]]);
  });

  it("prevê a viagem como o banco", () => {
    expect(preverViagemSegundos(5, 2, 1)).toBe(600);
    expect(preverViagemSegundos(5, 2, 10)).toBe(60);
    expect(preverViagemSegundos(0, 2, 1)).toBe(1);
  });

  it("limita o zoom para nunca carregar a cidade inteira", () => {
    expect(limitarZoom(1, 1200, 800)).toBe(10);
    expect(limitarZoom(999, 1200, 800)).toBe(56);
  });
});
