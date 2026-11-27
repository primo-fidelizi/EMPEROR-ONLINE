/** Regras de conta (seção 5 do CLAUDE.md). Valem no servidor; o formulário só repete para dar feedback. */

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
export const SENHA_MINIMA = 8;
export const SENHA_MAXIMA = 72; // limite do bcrypt

const PROIBIDOS = [
  "admin",
  "administrador",
  "root",
  "suporte",
  "support",
  "moderador",
  "mod",
  "sistema",
  "system",
  "staff",
  "oficial",
  "costaneon",
  "costa_neon",
  "anthropic",
  "claude",
];

// Filtro básico de palavrões. Os longos são barrados em qualquer trecho; os curtos só como
// nome inteiro, para não pegar palavras inocentes ("computador" contém "puta").
const PALAVROES_TRECHO = ["porra", "caralho", "buceta", "merda", "cuzao", "arrombado"];
const PALAVROES_EXATOS = ["puta", "foda", "viado", "fdp", "cu", "pau"];

export function normalizarUsername(bruto: string): string {
  return bruto.trim().toLowerCase();
}

export type ErroConta =
  | "username_formato"
  | "username_proibido"
  | "username_em_uso"
  | "senha_curta"
  | "senha_longa"
  | "credenciais"
  | "captcha"
  | "limite"
  | "servidor";

export function validarUsername(username: string): ErroConta | null {
  if (!USERNAME_REGEX.test(username)) return "username_formato";
  const semSeparador = username.replace(/_/g, "");
  const proibido = PROIBIDOS.some((p) => {
    const base = p.replace(/_/g, "");
    // Nomes reservados curtos ("mod", "root") só barram o nome exato; longos barram variações ("admin_2").
    return semSeparador === base || (base.length >= 5 && semSeparador.startsWith(base));
  });
  if (proibido) return "username_proibido";
  if (PALAVROES_TRECHO.some((p) => semSeparador.includes(p))) return "username_proibido";
  if (PALAVROES_EXATOS.includes(semSeparador.replace(/\d+$/, ""))) return "username_proibido";
  return null;
}

export function validarSenha(senha: string): ErroConta | null {
  if (senha.length < SENHA_MINIMA) return "senha_curta";
  if (senha.length > SENHA_MAXIMA) return "senha_longa";
  return null;
}

/** O Supabase Auth exige e-mail: usamos um sintético num domínio que nunca recebe nada. */
export function emailSintetico(username: string): string {
  return `${username}@players.costaneon.invalid`;
}

export const MENSAGENS: Record<ErroConta, string> = {
  username_formato: "Use de 3 a 20 caracteres: letras minúsculas, números ou _.",
  username_proibido: "Esse nome não pode ser usado. Escolha outro.",
  username_em_uso: "Esse nome já tem dono. Tente outro.",
  senha_curta: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`,
  senha_longa: `A senha pode ter no máximo ${SENHA_MAXIMA} caracteres.`,
  credenciais: "Usuário ou senha incorretos.",
  captcha: "Não conseguimos confirmar que você é humano. Recarregue a página e tente de novo.",
  limite: "Muitas tentativas. Espere um pouco e tente de novo.",
  servidor: "Algo deu errado do nosso lado. Tente de novo em instantes.",
};
