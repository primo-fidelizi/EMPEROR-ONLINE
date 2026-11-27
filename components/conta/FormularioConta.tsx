"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { Cartao } from "@/components/ui/Cartao";
import {
  emailSintetico,
  MENSAGENS,
  normalizarUsername,
  SENHA_MINIMA,
  validarSenha,
  validarUsername,
  type ErroConta,
} from "@/lib/conta";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { Turnstile, TURNSTILE_SITE_KEY } from "./Turnstile";

type Modo = "cadastro" | "login";

/** Traduz o erro do Supabase Auth para os códigos do jogo. */
function traduzirErro(mensagem: string, modo: Modo): ErroConta {
  const m = mensagem.toLowerCase();
  if (m.includes("username_em_uso") || m.includes("already registered")) return "username_em_uso";
  if (m.includes("username_proibido")) return "username_proibido";
  if (m.includes("username_invalido")) return "username_formato";
  if (m.includes("captcha")) return "captcha";
  if (m.includes("rate limit") || m.includes("too many")) return "limite";
  if (m.includes("password") && m.includes("characters")) return "senha_curta";
  if (modo === "login" && m.includes("invalid login")) return "credenciais";
  // Trigger que falhou por outro motivo chega como "Database error saving new user".
  if (m.includes("database error")) return "username_em_uso";
  return "servidor";
}

export function FormularioConta({ modo }: { modo: Modo }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [versaoCaptcha, setVersaoCaptcha] = useState(0);
  const aoValidar = useCallback((t: string | null) => setCaptcha(t), []);

  const cadastro = modo === "cadastro";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const nome = normalizarUsername(username);
    const erroLocal = cadastro
      ? (validarUsername(nome) ?? validarSenha(senha))
      : nome && senha
        ? null
        : "credenciais";
    if (erroLocal) return setErro(MENSAGENS[erroLocal]);
    if (TURNSTILE_SITE_KEY && !captcha) return setErro("Confirme que você é humano.");

    setEnviando(true);
    try {
      const supabase = criarClienteNavegador();

      if (cadastro) {
        const { data: livre } = await supabase.rpc("username_disponivel", { p_username: nome });
        if (livre === false) {
          setErro(MENSAGENS.username_em_uso);
          return;
        }
      }

      const credenciais = {
        email: emailSintetico(nome),
        password: senha,
        options: {
          ...(captcha ? { captchaToken: captcha } : {}),
          ...(cadastro ? { data: { username: nome } } : {}),
        },
      };
      const { error } = cadastro
        ? await supabase.auth.signUp(credenciais)
        : await supabase.auth.signInWithPassword(credenciais);

      if (error) {
        setErro(MENSAGENS[traduzirErro(error.message, modo)]);
        return;
      }
      router.push("/mundos");
      router.refresh();
    } catch {
      setErro(MENSAGENS.servidor);
    } finally {
      setEnviando(false);
      setCaptcha(null);
      setVersaoCaptcha((v) => v + 1); // token do Turnstile vale uma vez só
    }
  }

  return (
    <Cartao className="w-full max-w-sm">
      <form onSubmit={enviar} className="space-y-5" noValidate>
        <label className="block space-y-1">
          <span className="font-extrabold">Usuário</span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="borda-mao bg-papel focus-visible:bg-sol w-full px-4 py-3 text-lg outline-none"
          />
          {cadastro && (
            <span className="block text-sm">
              3 a 20 caracteres: letras minúsculas, números ou _
            </span>
          )}
        </label>

        <label className="block space-y-1">
          <span className="font-extrabold">Senha</span>
          <input
            name="password"
            type="password"
            autoComplete={cadastro ? "new-password" : "current-password"}
            minLength={cadastro ? SENHA_MINIMA : undefined}
            maxLength={72}
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="borda-mao bg-papel focus-visible:bg-sol w-full px-4 py-3 text-lg outline-none"
          />
          {cadastro && <span className="block text-sm">Mínimo de {SENHA_MINIMA} caracteres.</span>}
        </label>

        {cadastro && (
          <p className="borda-mao-2 bg-sol p-3 text-sm font-semibold">
            Guarde bem sua senha: por enquanto não existe recuperação por e-mail.
          </p>
        )}

        <Turnstile aoValidar={aoValidar} versao={versaoCaptcha} />

        <p role="alert" aria-live="polite" className="text-neon min-h-6 font-bold">
          {erro}
        </p>

        <Botao type="submit" disabled={enviando} className="w-full">
          {enviando ? "Um segundo…" : cadastro ? "Criar conta" : "Entrar"}
        </Botao>

        <p className="text-center">
          {cadastro ? (
            <>
              Já tem conta?{" "}
              <Link href="/login" className="font-extrabold underline">
                Entrar
              </Link>
            </>
          ) : (
            <>
              Primeira vez?{" "}
              <Link href="/cadastro" className="font-extrabold underline">
                Criar conta
              </Link>
            </>
          )}
        </p>
      </form>
    </Cartao>
  );
}
