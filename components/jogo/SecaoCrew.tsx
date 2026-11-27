"use client";

import { useState } from "react";
import { IconeRecurso } from "@/components/art/IconeRecurso";
import { Botao } from "@/components/ui/Botao";
import { Cartao } from "@/components/ui/Cartao";
import {
  formatarNumero,
  formatarTempo,
  maximoRecrutavel,
  NOME_RECURSO,
  RECURSOS,
  type EstadoTerritorio,
  type Recursos,
  type Tropa,
} from "@/lib/jogo/economia";

export function SecaoCrew({
  estado,
  recursos,
  agora,
  ocupado,
  aoRecrutar,
}: {
  estado: EstadoTerritorio;
  recursos: Recursos;
  agora: number;
  ocupado: string | null;
  aoRecrutar: (t: Tropa, quantidade: number) => void;
}) {
  const filaCheia = estado.recrutamento.length >= estado.recrutamento_max;
  const nome = (tipo: string) => estado.tropas.find((t) => t.tipo === tipo)?.nome ?? tipo;

  return (
    <section aria-labelledby="titulo-crew" className="space-y-4">
      <h2 id="titulo-crew" className="titulo-carimbo text-sol text-4xl">
        Crew
      </h2>

      <Cartao className="space-y-2">
        <p className="text-xs font-bold uppercase">Em casa agora</p>
        <ul className="flex flex-wrap gap-3">
          {estado.tropas.map((t) => (
            <li key={t.tipo} className="borda-mao-2 bg-papel px-3 py-1 font-extrabold tabular-nums">
              {t.nome}: {formatarNumero(estado.unidades[t.tipo] ?? 0)}
            </li>
          ))}
        </ul>
        {estado.recrutamento.length > 0 && (
          <div className="space-y-1 pt-2">
            <p className="text-xs font-bold uppercase">
              Recrutando ({estado.recrutamento.length} de {estado.recrutamento_max})
            </p>
            <ol className="space-y-1">
              {estado.recrutamento.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 tabular-nums">
                  <span className="font-bold">
                    {r.quantidade}× {nome(r.tipo)}
                  </span>
                  <span className="whitespace-nowrap">
                    {formatarTempo((Date.parse(r.termina_em) - agora) / 1000)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Cartao>

      <ul className="grid gap-5 sm:grid-cols-2">
        {estado.tropas.map((t) => (
          <li key={t.tipo}>
            <CartaoTropa
              tropa={t}
              recursos={recursos}
              filaCheia={filaCheia}
              ocupado={ocupado}
              aoRecrutar={(q) => aoRecrutar(t, q)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartaoTropa({
  tropa: t,
  recursos,
  filaCheia,
  ocupado,
  aoRecrutar,
}: {
  tropa: Tropa;
  recursos: Recursos;
  filaCheia: boolean;
  ocupado: string | null;
  aoRecrutar: (quantidade: number) => void;
}) {
  const [qtd, setQtd] = useState(1);
  const max = maximoRecrutavel(recursos, t.custo);
  const valida = Number.isInteger(qtd) && qtd >= 1 && qtd <= max;
  const motivo = !t.liberado
    ? `Precisa de Garagem nível ${t.garagem}`
    : filaCheia
      ? "Fila cheia"
      : max < 1
        ? "Falta grana"
        : null;

  return (
    <Cartao className="flex h-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-2xl font-extrabold">{t.nome}</h3>
        <span className="text-sm tabular-nums">⏱ {formatarTempo(t.tempo_s)} cada</span>
      </div>
      <p className="text-sm">{t.descricao}</p>
      <dl className="grid grid-cols-4 gap-1 text-center text-sm tabular-nums">
        {[
          ["Ataque", t.ataque],
          ["Defesa", t.defesa],
          ["Carga", t.carga],
          ["Min/campo", t.min_por_campo],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="borda-mao bg-papel px-1 py-1">
            <dt className="text-[10px] font-bold uppercase">{rotulo}</dt>
            <dd className="font-extrabold">{valor}</dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {RECURSOS.map((k) => (
          <li key={k} className="flex items-center gap-1 tabular-nums">
            <IconeRecurso recurso={k} className="size-5" />
            {formatarNumero(t.custo[k])}
            <span className="sr-only">{NOME_RECURSO[k]}</span>
          </li>
        ))}
        <li className="text-sm">cada</li>
      </ul>

      {motivo ? (
        <Botao variante="secundario" className="mt-auto w-full !py-2 !text-base" disabled>
          {motivo}
        </Botao>
      ) : (
        <form
          className="mt-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valida) aoRecrutar(qtd);
          }}
        >
          <label className="sr-only" htmlFor={`qtd-${t.tipo}`}>
            Quantidade de {t.nome}
          </label>
          <input
            id={`qtd-${t.tipo}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={qtd}
            onChange={(e) => setQtd(Math.floor(Number(e.target.value)))}
            className="borda-mao bg-papel focus-visible:bg-sol w-20 px-2 py-2 text-center font-extrabold tabular-nums outline-none"
          />
          <button
            type="button"
            onClick={() => setQtd(max)}
            className="borda-mao carimbo bg-papel cursor-pointer px-2 text-sm font-extrabold uppercase"
          >
            Máx {max}
          </button>
          <Botao
            type="submit"
            className="flex-1 !px-3 !py-2 !text-base"
            disabled={!valida || ocupado !== null}
          >
            {ocupado === `recrutar-${t.tipo}` ? "…" : "Recrutar"}
          </Botao>
        </form>
      )}
    </Cartao>
  );
}
