"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Widget do Cloudflare Turnstile. Só aparece se NEXT_PUBLIC_TURNSTILE_SITE_KEY estiver definida.
 * O token vai para o Supabase Auth (captchaToken), que confere com a chave secreta configurada lá.
 */
export function Turnstile({
  aoValidar,
  versao,
}: {
  aoValidar: (token: string | null) => void;
  versao: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelado = false;

    const montar = () => {
      if (cancelado || !ref.current || !window.turnstile) return false;
      if (widgetId.current) window.turnstile.remove(widgetId.current);
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: "pt-br",
        callback: (token: string) => aoValidar(token),
        "expired-callback": () => aoValidar(null),
        "error-callback": () => aoValidar(null),
      });
      return true;
    };

    if (!montar()) {
      const timer = setInterval(() => montar() && clearInterval(timer), 200);
      return () => {
        cancelado = true;
        clearInterval(timer);
      };
    }
    return () => {
      cancelado = true;
    };
    // `versao` muda quando o formulário precisa de um token novo (tokens valem uma vez só).
  }, [aoValidar, versao]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div ref={ref} className="min-h-[65px]" />
    </>
  );
}
