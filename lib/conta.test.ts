import { describe, expect, it } from "vitest";
import { emailSintetico, normalizarUsername, validarSenha, validarUsername } from "./conta";

describe("regras de conta", () => {
  it("aceita usernames válidos", () => {
    expect(validarUsername("surfista_99")).toBeNull();
    expect(validarUsername("abc")).toBeNull();
  });

  it("recusa formato inválido", () => {
    for (const u of [
      "ab",
      "a".repeat(21),
      "Maiuscula",
      "com espaço",
      "acentuação",
      "ponto.final",
    ]) {
      expect(validarUsername(u)).toBe("username_formato");
    }
  });

  it("recusa nomes reservados e palavrões, mesmo disfarçados com _", () => {
    expect(validarUsername("admin")).toBe("username_proibido");
    expect(validarUsername("admin_2")).toBe("username_proibido");
    expect(validarUsername("costa_neon_oficial")).toBe("username_proibido");
    expect(validarUsername("x_p_o_r_r_a")).toBe("username_proibido");
    expect(validarUsername("puta69")).toBe("username_proibido");
  });

  it("não barra palavras inocentes", () => {
    expect(validarUsername("computador")).toBeNull();
    expect(validarUsername("modesto")).toBeNull();
    expect(validarUsername("desviado")).toBeNull();
  });

  it("normaliza para minúsculas sem espaços nas pontas", () => {
    expect(normalizarUsername("  Brisa_Mar ")).toBe("brisa_mar");
  });

  it("exige senha de 8 a 72 caracteres", () => {
    expect(validarSenha("1234567")).toBe("senha_curta");
    expect(validarSenha("12345678")).toBeNull();
    expect(validarSenha("x".repeat(73))).toBe("senha_longa");
  });

  it("gera e-mail sintético num domínio .invalid", () => {
    expect(emailSintetico("brisa")).toBe("brisa@players.costaneon.invalid");
  });
});
