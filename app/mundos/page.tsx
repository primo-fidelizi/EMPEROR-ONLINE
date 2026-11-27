import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarraTopo } from "@/components/jogo/BarraTopo";
import { BotaoEntrarMundo } from "@/components/jogo/BotaoEntrarMundo";
import { Cartao } from "@/components/ui/Cartao";
import { Titulo } from "@/components/ui/Titulo";
import { usuarioAtual } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mundos · Costa Neon" };

const ROTULO_STATUS = {
  aberto: { texto: "Aberto", classe: "bg-sol" },
  rodando: { texto: "Rodando", classe: "bg-papel" },
  encerrado: { texto: "Encerrado", classe: "bg-concreto" },
} as const;

type Mundo = {
  id: string;
  nome: string;
  slug: string;
  status: keyof typeof ROTULO_STATUS;
  velocidade: number;
  tamanho_mapa: number;
  termina_em: string | null;
};

export default async function Mundos() {
  const { supabase, usuario } = await usuarioAtual();
  if (!usuario) redirect("/login");

  const [{ data: mundos }, { data: meus }] = await Promise.all([
    supabase
      .from("worlds")
      .select("id, nome, slug, status, velocidade, tamanho_mapa, termina_em")
      .order("status")
      .order("inicia_em", { ascending: false })
      .returns<Mundo[]>(),
    supabase.from("world_players").select("world_id").eq("user_id", usuario.id),
  ]);

  const jogoEm = new Set((meus ?? []).map((m) => m.world_id));
  const contagens = await Promise.all(
    (mundos ?? []).map(async (m) => {
      const { count } = await supabase
        .from("world_players")
        .select("*", { count: "exact", head: true })
        .eq("world_id", m.id);
      return [m.id, count ?? 0] as const;
    }),
  );
  const jogadores = new Map(contagens);

  return (
    <>
      <BarraTopo username={usuario.username} />
      <main className="mx-auto max-w-3xl space-y-8 px-5 pb-12">
        <Titulo nivel={1} className="text-sol">
          Escolha seu mundo
        </Titulo>

        {(mundos ?? []).length === 0 && (
          <Cartao>
            <p className="font-bold">Nenhum mundo aberto agora. Volte daqui a pouco!</p>
          </Cartao>
        )}

        <ul className="space-y-6">
          {(mundos ?? []).map((m) => {
            const status = ROTULO_STATUS[m.status];
            return (
              <li key={m.id}>
                <Cartao className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-extrabold">{m.nome}</h2>
                      <span
                        className={`borda-mao px-2 text-sm font-extrabold uppercase ${status.classe}`}
                      >
                        {status.texto}
                      </span>
                    </div>
                    <p className="tabular-nums">
                      {jogadores.get(m.id) ?? 0} jogadores · velocidade {m.velocidade}× · mapa{" "}
                      {m.tamanho_mapa}×{m.tamanho_mapa}
                    </p>
                  </div>
                  {m.status !== "encerrado" && (
                    <BotaoEntrarMundo worldId={m.id} slug={m.slug} jaJoga={jogoEm.has(m.id)} />
                  )}
                </Cartao>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
