"use client";

import { useState } from "react";
import { IconeRecurso } from "@/components/art/IconeRecurso";
import { Cartao } from "@/components/ui/Cartao";
import { formatarNumero, RECURSOS } from "@/lib/jogo/economia";
import { criarClienteNavegador } from "@/lib/supabase/client";

type Crew = Record<string, number>;
type Ficha = { nome: string; x: number; y: number; dono: string | null };

export type Relatorio = {
  id: number;
  tipo: "ataque" | "defesa" | "espionagem";
  titulo: string;
  lido: boolean;
  criado_em: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dados: any;
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function ListaRelatorios({
  relatorios,
  nomes,
}: {
  relatorios: Relatorio[];
  nomes: Record<string, string>;
}) {
  const [aberto, setAberto] = useState<number | null>(null);
  const [lidos, setLidos] = useState(
    () => new Set(relatorios.filter((r) => r.lido).map((r) => r.id)),
  );

  if (relatorios.length === 0) {
    return (
      <Cartao>
        <p className="font-bold">
          Nada por aqui ainda. Mande sua crew para a rua e os relatórios aparecem aqui.
        </p>
      </Cartao>
    );
  }

  function abrir(r: Relatorio) {
    setAberto(aberto === r.id ? null : r.id);
    if (!lidos.has(r.id)) {
      setLidos(new Set(lidos).add(r.id));
      criarClienteNavegador().rpc("marcar_relatorios_lidos", { p_ids: [r.id] });
    }
  }

  return (
    <ul className="space-y-4">
      {relatorios.map((r) => {
        const vitoria =
          r.tipo === "espionagem"
            ? r.dados.sucesso
            : (r.dados.vencedor === "atacante") === (r.tipo === "ataque");
        return (
          <li key={r.id}>
            <Cartao destaque={!lidos.has(r.id)} className="!p-0">
              <button
                onClick={() => abrir(r)}
                aria-expanded={aberto === r.id}
                className="flex w-full cursor-pointer items-center gap-3 p-4 text-left"
              >
                <span
                  className={`borda-mao shrink-0 px-2 text-sm font-extrabold uppercase ${vitoria ? "bg-sol" : "bg-neon text-papel"}`}
                >
                  {r.tipo === "espionagem" ? "espião" : vitoria ? "vitória" : "derrota"}
                </span>
                <span className={`flex-1 ${lidos.has(r.id) ? "font-semibold" : "font-extrabold"}`}>
                  {r.titulo}
                </span>
                <span className="text-sm tabular-nums">{quando(r.criado_em)}</span>
              </button>
              {aberto === r.id && (
                <div className="border-tinta/30 border-t-2 border-dashed p-4">
                  {r.tipo === "espionagem" ? (
                    <DetalheEspionagem dados={r.dados} nomes={nomes} />
                  ) : (
                    <DetalheBatalha dados={r.dados} nomes={nomes} />
                  )}
                </div>
              )}
            </Cartao>
          </li>
        );
      })}
    </ul>
  );
}

function TabelaCrew({
  titulo,
  crew,
  perdas,
  nomes,
}: {
  titulo: string;
  crew: Crew;
  perdas: Crew;
  nomes: Record<string, string>;
}) {
  const tipos = Object.keys(crew);
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold uppercase">{titulo}</p>
      {tipos.length === 0 ? (
        <p className="text-sm">Ninguém.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="font-bold">Unidade</th>
              <th className="text-right font-bold">Tinha</th>
              <th className="text-right font-bold">Perdeu</th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((k) => (
              <tr key={k}>
                <td>{nomes[k] ?? k}</td>
                <td className="text-right">{crew[k]}</td>
                <td className="text-right font-extrabold">{perdas[k] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const lugar = (f: Ficha) => `${f.nome} (${f.x}|${f.y})${f.dono ? ` · @${f.dono}` : ""}`;

function Recursos({ valores }: { valores: Record<string, number> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {RECURSOS.map((k) => (
        <li key={k} className="flex items-center gap-1 font-extrabold tabular-nums">
          <IconeRecurso recurso={k} className="size-5" /> {formatarNumero(valores?.[k] ?? 0)}
        </li>
      ))}
    </ul>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DetalheBatalha({ dados, nomes }: { dados: any; nomes: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="font-extrabold">Atacante: {lugar(dados.atacante)}</p>
          <p className="text-sm tabular-nums">
            Poder de ataque: {formatarNumero(dados.atacante.poder)}
          </p>
          <TabelaCrew
            titulo="Crew"
            crew={dados.atacante.enviados}
            perdas={dados.atacante.perdas}
            nomes={nomes}
          />
        </div>
        <div className="space-y-2">
          <p className="font-extrabold">Defensor: {lugar(dados.defensor)}</p>
          <p className="text-sm tabular-nums">
            Poder de defesa: {formatarNumero(dados.defensor.poder)}
          </p>
          <TabelaCrew
            titulo="Crew"
            crew={dados.defensor.crew}
            perdas={dados.defensor.perdas}
            nomes={nomes}
          />
        </div>
      </div>
      {dados.vencedor === "atacante" && (
        <div className="borda-mao-2 bg-sol space-y-1 p-3">
          <p className="text-xs font-bold uppercase">Saque</p>
          <Recursos valores={dados.saque} />
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DetalheEspionagem({ dados, nomes }: { dados: any; nomes: Record<string, string> }) {
  if (!dados.sucesso) {
    return (
      <p>
        Os olheiros foram pegos em {lugar(dados.alvo)}. Mande mais olheiros do que o alvo tem para
        passar despercebido.
      </p>
    );
  }
  const crew: Crew = dados.crew ?? {};
  return (
    <div className="space-y-3">
      <p className="font-extrabold">{lugar(dados.alvo)}</p>
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase">Recursos no caixa</p>
        <Recursos valores={dados.recursos} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase">Crew em casa</p>
        <p className="tabular-nums">
          {Object.keys(crew).length === 0
            ? "Ninguém. Alvo fácil!"
            : Object.entries(crew)
                .map(([k, q]) => `${q}× ${nomes[k] ?? k}`)
                .join(" · ")}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase">Negócios</p>
        <p className="text-sm tabular-nums">
          {Object.entries(dados.negocios ?? {})
            .map(([k, n]) => `${k.replace("_", " ")} ${n}`)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
}
