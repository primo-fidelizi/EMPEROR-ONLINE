"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconeRecurso } from "@/components/art/IconeRecurso";
import { Botao } from "@/components/ui/Botao";
import { Cartao } from "@/components/ui/Cartao";
import {
  ERROS_ECONOMIA,
  falta,
  formatarNumero,
  formatarTempo,
  NOME_RECURSO,
  normalizarEstado,
  podePagar,
  preverRecursos,
  proximoEvento,
  RECURSOS,
  type EstadoTerritorio,
  type Negocio,
  type Recursos,
  type Tropa,
} from "@/lib/jogo/economia";
import { SecaoCrew } from "./SecaoCrew";
import { AlertaChegando, SecaoMovimentos } from "./SecaoMovimentos";
import { criarClienteNavegador } from "@/lib/supabase/client";

export function PainelEconomia({ inicial, slug }: { inicial: EstadoTerritorio; slug: string }) {
  const [estado, setEstado] = useState(inicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  // Relógio do servidor = relógio do aparelho + desvio medido a cada foto que chega do banco.
  const [desvio, setDesvio] = useState(() => Date.parse(inicial.agora) - Date.now());
  const [agoraLocal, setAgoraLocal] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgoraLocal(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const agoraServidor = agoraLocal + desvio;
  const buscando = useRef(false);

  const recursos = preverRecursos(estado, agoraServidor - Date.parse(estado.agora));
  const filaCheia = estado.fila.length >= estado.fila_max;

  const chamar = useCallback(
    async (
      fn: "estado_territorio" | "construir" | "subir_tudo" | "recrutar",
      extra: Record<string, unknown> = {},
    ) => {
      const { data, error } = await criarClienteNavegador().rpc(fn, {
        p_territorio: estado.territorio_id,
        ...extra,
      });
      if (error) throw new Error(error.message);
      const novo = normalizarEstado(data);
      setDesvio(Date.parse(novo.agora) - Date.now());
      setEstado(novo);
      return novo;
    },
    [estado.territorio_id],
  );

  // Quando algo termina ou chega (obra, recrutamento, crew), pede a foto nova ao servidor.
  const proximaConclusao = proximoEvento(estado);
  useEffect(() => {
    if (proximaConclusao === null || agoraServidor < proximaConclusao + 500 || buscando.current)
      return;
    buscando.current = true;
    chamar("estado_territorio")
      .catch(() => undefined)
      .finally(() => (buscando.current = false));
  }, [agoraServidor, proximaConclusao, chamar]);

  async function acao(
    chave: string,
    fn: () => Promise<EstadoTerritorio>,
    sucesso: (e: EstadoTerritorio) => string,
  ) {
    setOcupado(chave);
    setAviso(null);
    try {
      const novo = await fn();
      setAviso({ tipo: "ok", texto: sucesso(novo) });
    } catch (e) {
      const codigo = (e as Error).message;
      setAviso({
        tipo: "erro",
        texto: ERROS_ECONOMIA[codigo] ?? "Não deu certo agora. Tente de novo.",
      });
    } finally {
      setOcupado(null);
    }
  }

  const subirTudo = () =>
    acao(
      "tudo",
      () => chamar("subir_tudo"),
      (e) =>
        e.subidos
          ? `${e.subidos} ${e.subidos === 1 ? "obra entrou" : "obras entraram"} na fila.`
          : "Não deu para subir nada agora: falta grana ou a fila está cheia.",
    );

  const construir = (n: Negocio) =>
    acao(
      n.tipo,
      () => chamar("construir", { p_tipo: n.tipo }),
      () => `${n.nome} nível ${n.proximo?.nivel} entrou na fila.`,
    );

  const recrutar = (t: Tropa, quantidade: number) =>
    acao(
      `recrutar-${t.tipo}`,
      () => chamar("recrutar", { p_tipo: t.tipo, p_quantidade: quantidade }),
      () => `${quantidade}× ${t.nome} entrando na fila de recrutamento.`,
    );

  return (
    <div className="space-y-6">
      <AlertaChegando estado={estado} agora={agoraServidor} />
      <BarraRecursos recursos={recursos} estado={estado} />

      <div className="flex flex-wrap items-center gap-4">
        <Botao onClick={subirTudo} disabled={ocupado !== null || filaCheia}>
          {ocupado === "tudo" ? "Subindo…" : "Subir tudo que dá"}
        </Botao>
        <p
          role="status"
          aria-live="polite"
          className={aviso ? "borda-mao-2 bg-papel px-3 py-2 font-bold" : "sr-only"}
        >
          {aviso && (
            <span className={aviso.tipo === "erro" ? "border-neon border-l-8 pl-2" : ""}>
              {aviso.texto}
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section aria-labelledby="titulo-negocios" className="space-y-4 lg:order-1">
          <h2 id="titulo-negocios" className="titulo-carimbo text-sol text-4xl">
            Negócios
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2">
            {estado.negocios.map((n) => (
              <li key={n.tipo}>
                <CartaoNegocio
                  negocio={n}
                  recursos={recursos}
                  filaCheia={filaCheia}
                  ocupado={ocupado}
                  aoSubir={() => construir(n)}
                />
              </li>
            ))}
          </ul>
        </section>

        <Fila estado={estado} agora={agoraServidor} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="lg:order-1">
          <SecaoCrew
            estado={estado}
            recursos={recursos}
            agora={agoraServidor}
            ocupado={ocupado}
            aoRecrutar={recrutar}
          />
        </div>
        <div className="order-first lg:order-2">
          <SecaoMovimentos estado={estado} agora={agoraServidor} slug={slug} />
        </div>
      </div>
    </div>
  );
}

function BarraRecursos({ recursos, estado }: { recursos: Recursos; estado: EstadoTerritorio }) {
  return (
    <Cartao className="sticky top-2 z-10 grid grid-cols-3 gap-2 !p-3 sm:gap-4 sm:!p-4">
      {RECURSOS.map((k) => {
        const cheio = recursos[k] >= estado.capacidade;
        return (
          <div key={k} className="flex flex-col items-center gap-1 sm:flex-row sm:gap-3">
            <IconeRecurso recurso={k} className="size-8 shrink-0" />
            <div className="text-center sm:text-left">
              <p className="text-xs font-bold uppercase">{NOME_RECURSO[k]}</p>
              <p className="text-lg leading-tight font-extrabold tabular-nums sm:text-2xl">
                {formatarNumero(recursos[k])}
              </p>
              <p className={`text-xs tabular-nums ${cheio ? "font-extrabold" : ""}`}>
                {cheio ? "armazém cheio!" : `+${formatarNumero(estado.taxas_h[k])}/h`}
              </p>
            </div>
          </div>
        );
      })}
      <p className="col-span-3 text-center text-xs tabular-nums">
        Armazém: {formatarNumero(estado.capacidade)} de cada
      </p>
    </Cartao>
  );
}

function CartaoNegocio({
  negocio: n,
  recursos,
  filaCheia,
  ocupado,
  aoSubir,
}: {
  negocio: Negocio;
  recursos: Recursos;
  filaCheia: boolean;
  ocupado: string | null;
  aoSubir: () => void;
}) {
  const p = n.proximo;
  const faltando = p ? falta(recursos, p.custo) : {};
  const pode = !!p && !n.requisito && !filaCheia && podePagar(recursos, p.custo);
  const motivo = !p
    ? "Nível máximo"
    : n.requisito
      ? `Precisa de ${n.requisito}`
      : filaCheia
        ? "Fila cheia"
        : !pode
          ? "Falta grana"
          : null;

  return (
    <Cartao className="flex h-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-2xl font-extrabold">{n.nome}</h3>
        <span className="borda-mao bg-sol px-2 font-extrabold tabular-nums">
          nv {n.nivel}
          {n.nivel_planejado > n.nivel && <span className="text-sm"> → {n.nivel_planejado}</span>}
        </span>
      </div>
      <p className="text-sm">{n.descricao}</p>

      {p && (
        <div className="mt-auto space-y-2">
          <p className="text-xs font-bold uppercase">Nível {p.nivel} custa</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {RECURSOS.map((k) => (
              <li key={k} className="flex items-center gap-1 tabular-nums">
                <IconeRecurso recurso={k} className="size-5" />
                <span
                  className={
                    faltando[k] ? "decoration-neon font-extrabold underline decoration-4" : ""
                  }
                >
                  {formatarNumero(p.custo[k])}
                </span>
                <span className="sr-only">{NOME_RECURSO[k]}</span>
              </li>
            ))}
            <li className="tabular-nums">⏱ {formatarTempo(p.tempo_s)}</li>
          </ul>
        </div>
      )}

      <Botao
        variante="secundario"
        className="mt-1 w-full !py-2 !text-base"
        onClick={aoSubir}
        disabled={!pode || ocupado !== null}
      >
        {ocupado === n.tipo ? "…" : (motivo ?? `Subir para ${p?.nivel}`)}
      </Botao>
    </Cartao>
  );
}

function Fila({ estado, agora }: { estado: EstadoTerritorio; agora: number }) {
  const nome = (tipo: string) => estado.negocios.find((n) => n.tipo === tipo)?.nome ?? tipo;
  return (
    <section aria-labelledby="titulo-fila" className="order-first space-y-4 lg:order-2">
      <h2 id="titulo-fila" className="titulo-carimbo text-sol text-4xl">
        Obras
      </h2>
      <Cartao className="space-y-3">
        <p className="font-bold tabular-nums">
          {estado.fila.length} de {estado.fila_max} na fila
        </p>
        {estado.fila.length === 0 && <p>Nenhuma obra rolando. Bora subir alguma coisa!</p>}
        <ol className="space-y-3">
          {estado.fila.map((o, i) => {
            const ini = Date.parse(o.inicia_em);
            const fim = Date.parse(o.termina_em);
            const restante = (fim - agora) / 1000;
            const progresso = Math.min(1, Math.max(0, (agora - ini) / (fim - ini)));
            return (
              <li key={o.id} className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="font-extrabold">
                    {nome(o.tipo)} → {o.nivel_alvo}
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">
                    {restante > 0 ? formatarTempo(restante) : "pronto!"}
                  </span>
                </div>
                {i === 0 && (
                  <div
                    className="borda-mao bg-papel h-4 overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progresso * 100)}
                    aria-label={`Progresso de ${nome(o.tipo)}`}
                  >
                    <div className="bg-sol h-full" style={{ width: `${progresso * 100}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Cartao>
    </section>
  );
}
