import { describe, expect, it } from "vitest";
import {
  maximoRecrutavel,
  falta,
  formatarTempo,
  normalizarEstado,
  podePagar,
  preverRecursos,
  type EstadoTerritorio,
} from "./economia";

const estado = normalizarEstado({
  territorio_id: "t",
  agora: "2026-11-28T00:00:00Z",
  recursos: { cash: "500", material: "1240", influencia: "1300" },
  taxas_h: { cash: "60", material: "60", influencia: "50" },
  capacidade: "1250",
  negocios: [],
  fila: [],
  fila_max: 5,
}) as EstadoTerritorio;

describe("previsão da economia (espelha o banco)", () => {
  it("converte numeric do Postgres para number", () => {
    expect(estado.recursos.cash).toBe(500);
    expect(estado.capacidade).toBe(1250);
  });

  it("cresce pela taxa, para no armazém e nunca diminui", () => {
    const r = preverRecursos(estado, 3_600_000);
    expect(r.cash).toBeCloseTo(560);
    expect(r.material).toBe(1250); // encheu
    expect(r.influencia).toBe(1300); // já estava acima: fica onde está
    expect(preverRecursos(estado, -5000).cash).toBe(500);
  });

  it("calcula se dá para pagar e quanto falta", () => {
    const custo = { cash: 501, material: 10, influencia: 10 };
    expect(podePagar(estado.recursos, custo)).toBe(false);
    expect(falta(estado.recursos, custo)).toEqual({ cash: 1 });
    expect(podePagar(estado.recursos, { cash: 500, material: 0, influencia: 0 })).toBe(true);
  });

  it("calcula o máximo recrutável", () => {
    const r = { cash: 500, material: 100, influencia: 1000 };
    expect(maximoRecrutavel(r, { cash: 50, material: 30, influencia: 10 })).toBe(3);
    expect(maximoRecrutavel(r, { cash: 600, material: 0, influencia: 0 })).toBe(0);
  });

  it("formata tempos curtos e longos", () => {
    expect(formatarTempo(47)).toBe("47s");
    expect(formatarTempo(125)).toBe("2min 05s");
    expect(formatarTempo(3725)).toBe("1h 02min");
    expect(formatarTempo(-3)).toBe("0s");
  });
});
