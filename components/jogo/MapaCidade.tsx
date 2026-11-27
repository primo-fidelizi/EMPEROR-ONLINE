"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Botao } from "@/components/ui/Botao";
import { Cartao } from "@/components/ui/Cartao";
import {
  ERROS_ECONOMIA,
  formatarNumero,
  formatarTempo,
  normalizarEstado,
  type Crew,
  type EstadoTerritorio,
} from "@/lib/jogo/economia";
import {
  COR,
  corDoTerritorio,
  distancia,
  limitarZoom,
  pedacosVisiveis,
  preverViagemSegundos,
  TAMANHO_PEDACO,
  type Camera,
  type TerritorioMapa,
} from "@/lib/jogo/mapa";
import { criarClienteNavegador } from "@/lib/supabase/client";

type Props = {
  worldId: string;
  tamanho: number;
  velocidade: number;
  casa: { id: string; x: number; y: number };
  estadoInicial: EstadoTerritorio;
};

export function MapaCidade({ worldId, tamanho, velocidade, casa, estadoInicial }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ x: casa.x + 0.5, y: casa.y + 0.5, zoom: 28 });
  const tamanhoTela = useRef({ l: 600, a: 480 });
  const pedacos = useRef(new Map<string, TerritorioMapa[] | "carregando">());
  const porCasa = useRef(new Map<string, TerritorioMapa>());
  const quadro = useRef<number | null>(null);

  const [estado, setEstado] = useState(estadoInicial);
  const [selecionado, setSelecionado] = useState<TerritorioMapa | null>(null);
  const [carregados, setCarregados] = useState<TerritorioMapa[]>([]);
  const selRef = useRef<TerritorioMapa | null>(null);
  const estadoRef = useRef(estado);

  // ---------- desenho ----------
  const desenhar = useCallback(() => {
    quadro.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { l, a } = tamanhoTela.current;
    const { x: cx, y: cy, zoom: z } = cam.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tela = (gx: number, gy: number) =>
      [(gx - cx) * z + l / 2, (gy - cy) * z + a / 2] as const;

    // fundo: mar dentro da cidade, concreto fora dos limites
    ctx.fillStyle = COR.concreto;
    ctx.fillRect(0, 0, l, a);
    const [bx0, by0] = tela(0, 0);
    ctx.fillStyle = COR.mar;
    ctx.fillRect(bx0, by0, tamanho * z, tamanho * z);

    // grade leve quando aproximado
    if (z >= 14) {
      ctx.strokeStyle = "rgba(20,20,20,0.10)";
      ctx.lineWidth = 1;
      const gx0 = Math.max(0, Math.floor(cx - l / 2 / z));
      const gx1 = Math.min(tamanho, Math.ceil(cx + l / 2 / z));
      const gy0 = Math.max(0, Math.floor(cy - a / 2 / z));
      const gy1 = Math.min(tamanho, Math.ceil(cy + a / 2 / z));
      ctx.beginPath();
      for (let gx = gx0; gx <= gx1; gx++) {
        const [px] = tela(gx, 0);
        ctx.moveTo(px, tela(0, gy0)[1]);
        ctx.lineTo(px, tela(0, gy1)[1]);
      }
      for (let gy = gy0; gy <= gy1; gy++) {
        const [, py] = tela(0, gy);
        ctx.moveTo(tela(gx0, 0)[0], py);
        ctx.lineTo(tela(gx1, 0)[0], py);
      }
      ctx.stroke();
    }

    // rotas da minha crew na rua (tracejado + ponto andando)
    const agora = Date.now();
    ctx.setLineDash([Math.max(3, z / 4), Math.max(3, z / 4)]);
    ctx.lineWidth = Math.max(1.5, z / 12);
    for (const m of estadoRef.current.movimentos) {
      const ini = Date.parse(m.sai_em);
      const fim = Date.parse(m.chega_em);
      const p = Math.min(1, Math.max(0, (agora - ini) / (fim - ini)));
      const indo = m.tipo !== "retorno";
      const de = indo ? casa : m.alvo;
      const para = indo ? m.alvo : casa;
      const [ax, ay] = tela(de.x + 0.5, de.y + 0.5);
      const [bx, by] = tela(para.x + 0.5, para.y + 0.5);
      ctx.strokeStyle = m.tipo === "ataque" ? COR.neon : COR.tinta;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = m.tipo === "retorno" ? COR.sol : COR.papel;
      ctx.strokeStyle = COR.tinta;
      ctx.beginPath();
      ctx.arc(ax + (bx - ax) * p, ay + (by - ay) * p, Math.max(4, z / 5), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([Math.max(3, z / 4), Math.max(3, z / 4)]);
    }
    ctx.setLineDash([]);

    // territórios: recorte chapado com contorno e sombra dura
    const lado = z * 0.78;
    const folga = (z - lado) / 2;
    const sombra = Math.max(1.5, z * 0.12);
    for (const t of porCasa.current.values()) {
      const [px, py] = tela(t.x, t.y);
      if (px < -z || py < -z || px > l + z || py > a + z) continue;
      ctx.fillStyle = COR.tinta;
      ctx.fillRect(px + folga + sombra, py + folga + sombra, lado, lado);
      ctx.fillStyle = corDoTerritorio(t);
      ctx.fillRect(px + folga, py + folga, lado, lado);
      ctx.strokeStyle = COR.tinta;
      ctx.lineWidth = Math.max(1, z * 0.08);
      ctx.strokeRect(px + folga, py + folga, lado, lado);
      if (t.protegido && !t.meu && z >= 10) {
        // escudo de iniciante: risquinhos diagonais
        ctx.lineWidth = Math.max(1, z * 0.05);
        ctx.beginPath();
        ctx.moveTo(px + folga + lado * 0.2, py + folga + lado * 0.8);
        ctx.lineTo(px + folga + lado * 0.8, py + folga + lado * 0.2);
        ctx.stroke();
      }
      if (selRef.current?.id === t.id) {
        ctx.lineWidth = Math.max(3, z * 0.16);
        ctx.strokeRect(px + folga - 4, py + folga - 4, lado + 8, lado + 8);
      }
    }
  }, [casa, tamanho]);

  const pedirDesenho = useCallback(() => {
    if (quadro.current === null) quadro.current = requestAnimationFrame(desenhar);
  }, [desenhar]);

  // ---------- dados por pedaço ----------
  const carregarVisiveis = useCallback(() => {
    const { l, a } = tamanhoTela.current;
    for (const [px, py] of pedacosVisiveis(cam.current, l, a, tamanho)) {
      const chave = `${px}:${py}`;
      if (pedacos.current.has(chave)) continue;
      pedacos.current.set(chave, "carregando");
      const x0 = px * TAMANHO_PEDACO;
      const y0 = py * TAMANHO_PEDACO;
      criarClienteNavegador()
        .rpc("mapa_regiao", {
          p_world: worldId,
          p_x0: x0,
          p_y0: y0,
          p_x1: x0 + TAMANHO_PEDACO - 1,
          p_y1: y0 + TAMANHO_PEDACO - 1,
        })
        .then(({ data, error }) => {
          if (error) {
            pedacos.current.delete(chave); // tenta de novo no próximo movimento
            return;
          }
          const lista = (data ?? []) as TerritorioMapa[];
          pedacos.current.set(chave, lista);
          for (const t of lista) porCasa.current.set(`${t.x}:${t.y}`, t);
          setCarregados([...porCasa.current.values()]);
          pedirDesenho();
        });
    }
  }, [pedirDesenho, tamanho, worldId]);

  const moverCamera = useCallback(
    (nova: Partial<Camera>) => {
      const { l, a } = tamanhoTela.current;
      const c = { ...cam.current, ...nova };
      c.zoom = limitarZoom(c.zoom, l, a);
      c.x = Math.min(tamanho, Math.max(0, c.x));
      c.y = Math.min(tamanho, Math.max(0, c.y));
      cam.current = c;
      pedirDesenho();
      carregarVisiveis();
    },
    [carregarVisiveis, pedirDesenho, tamanho],
  );

  // Refs usados pelo desenho acompanham o estado do React.
  useEffect(() => {
    selRef.current = selecionado;
    estadoRef.current = estado;
    pedirDesenho();
  }, [selecionado, estado, pedirDesenho]);

  const aproximar = useCallback(() => moverCamera({ zoom: cam.current.zoom * 1.4 }), [moverCamera]);
  const afastar = useCallback(() => moverCamera({ zoom: cam.current.zoom / 1.4 }), [moverCamera]);
  const irParaCasa = useCallback(
    () => moverCamera({ x: casa.x + 0.5, y: casa.y + 0.5 }),
    [moverCamera, casa],
  );

  // ---------- tamanho do canvas ----------
  useEffect(() => {
    const caixa = caixaRef.current;
    const canvas = canvasRef.current;
    if (!caixa || !canvas) return;
    const ajustar = () => {
      const l = caixa.clientWidth;
      const a = Math.round(Math.min(640, Math.max(360, window.innerHeight * 0.62)));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(l * dpr);
      canvas.height = Math.round(a * dpr);
      canvas.style.width = `${l}px`;
      canvas.style.height = `${a}px`;
      tamanhoTela.current = { l, a };
      moverCamera({});
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(caixa);
    return () => obs.disconnect();
  }, [moverCamera]);

  // Anima as rotas e atualiza o estado quando alguma crew chega.
  useEffect(() => {
    if (estado.movimentos.length === 0) return;
    const t = setInterval(pedirDesenho, 500);
    return () => clearInterval(t);
  }, [estado.movimentos.length, pedirDesenho]);

  useEffect(() => {
    const proxima = Math.min(...estado.movimentos.map((m) => Date.parse(m.chega_em)));
    if (!Number.isFinite(proxima)) return;
    const espera = Math.max(1000, proxima - Date.now() + 1500);
    const t = setTimeout(async () => {
      const { data } = await criarClienteNavegador().rpc("estado_territorio", {
        p_territorio: casa.id,
      });
      if (data) {
        setEstado(normalizarEstado(data));
        pedacos.current.clear(); // donos podem ter mudado
        porCasa.current.clear();
        setCarregados([]);
        carregarVisiveis();
      }
    }, espera);
    return () => clearTimeout(t);
  }, [estado.movimentos, casa.id, carregarVisiveis]);

  // ---------- gestos: arrastar, pinça, roda, toque ----------
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ moveu: number; dist0: number; zoom0: number } | null>(null);

  const casaNaTela = (ex: number, ey: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { l, a } = tamanhoTela.current;
    const { x, y, zoom } = cam.current;
    return {
      gx: Math.floor((ex - rect.left - l / 2) / zoom + x),
      gy: Math.floor((ey - rect.top - a / 2) / zoom + y),
    };
  };

  const aoApertar = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ponteiros.current.values()];
    gesto.current = {
      moveu: 0,
      dist0: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      zoom0: cam.current.zoom,
    };
  };

  const aoMover = (e: React.PointerEvent) => {
    const antes = ponteiros.current.get(e.pointerId);
    if (!antes || !gesto.current) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ponteiros.current.values()];
    if (pts.length === 2 && gesto.current.dist0 > 0) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      moverCamera({ zoom: gesto.current.zoom0 * (d / gesto.current.dist0) });
      gesto.current.moveu += 10;
      return;
    }
    const dx = e.clientX - antes.x;
    const dy = e.clientY - antes.y;
    gesto.current.moveu += Math.abs(dx) + Math.abs(dy);
    const z = cam.current.zoom;
    moverCamera({ x: cam.current.x - dx / z, y: cam.current.y - dy / z });
  };

  const aoSoltar = (e: React.PointerEvent) => {
    const foiToque = gesto.current && gesto.current.moveu < 6 && ponteiros.current.size === 1;
    ponteiros.current.delete(e.pointerId);
    if (foiToque) {
      const { gx, gy } = casaNaTela(e.clientX, e.clientY);
      setSelecionado(porCasa.current.get(`${gx}:${gy}`) ?? null);
      pedirDesenho();
    }
    if (ponteiros.current.size === 0) gesto.current = null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const { l, a } = tamanhoTela.current;
      const { x, y, zoom } = cam.current;
      const mx = e.clientX - rect.left - l / 2;
      const my = e.clientY - rect.top - a / 2;
      const novo = limitarZoom(zoom * Math.exp(-e.deltaY * 0.0015), l, a);
      // zoom em volta do cursor
      moverCamera({ zoom: novo, x: x + mx / zoom - mx / novo, y: y + my / zoom - my / novo });
    };
    canvas.addEventListener("wheel", roda, { passive: false });
    return () => canvas.removeEventListener("wheel", roda);
  }, [moverCamera]);

  // ---------- lista acessível de alvos próximos ----------
  const proximos = useMemo(
    () =>
      carregados
        .filter((t) => !t.meu)
        .map((t) => ({ t, d: distancia(t, casa) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 8),
    [carregados, casa],
  );

  const focar = (t: TerritorioMapa) => {
    setSelecionado(t);
    moverCamera({ x: t.x + 0.5, y: t.y + 0.5 });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-3">
        <div
          ref={caixaRef}
          className="borda-mao-2 bg-mar shadow-carimbo-g relative overflow-hidden"
        >
          <canvas
            ref={canvasRef}
            className="block cursor-grab touch-none active:cursor-grabbing"
            role="img"
            aria-label={`Mapa da cidade. Seu território em ${casa.x}|${casa.y}. Use a lista de alvos ao lado para navegar pelo teclado.`}
            onPointerDown={aoApertar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
          />
          <div className="absolute top-3 right-3 flex flex-col gap-2">
            <BotaoMapa rotulo="Aproximar" onClick={aproximar}>
              +
            </BotaoMapa>
            <BotaoMapa rotulo="Afastar" onClick={afastar}>
              −
            </BotaoMapa>
            <BotaoMapa rotulo="Voltar para casa" onClick={irParaCasa}>
              ⌂
            </BotaoMapa>
          </div>
        </div>
        <p className="flex flex-wrap gap-4 font-bold">
          {[
            ["bg-sol", "seu"],
            ["bg-concreto", "abandonado"],
            ["bg-neon", "outros jogadores"],
          ].map(([cls, rot]) => (
            <span key={rot} className="flex items-center gap-2">
              <span className={`borda-mao inline-block size-4 ${cls}`} /> {rot}
            </span>
          ))}
          <span className="font-normal">
            Arraste para andar · roda ou pinça para zoom · toque para escolher
          </span>
        </p>
      </div>

      <div className="space-y-5">
        {selecionado ? (
          <PainelAlvo
            alvo={selecionado}
            casa={casa}
            estado={estado}
            velocidade={velocidade}
            aoFechar={() => setSelecionado(null)}
            aoEnviar={setEstado}
          />
        ) : (
          <Cartao>
            <p className="font-bold">
              Toque num quarteirão do mapa para ver quem está lá e mandar sua crew.
            </p>
          </Cartao>
        )}

        <Cartao className="space-y-2">
          <h2 className="text-xl font-extrabold">Alvos perto de você</h2>
          {proximos.length === 0 && <p>Carregando a vizinhança…</p>}
          <ul className="space-y-1">
            {proximos.map(({ t, d }) => (
              <li key={t.id}>
                <button
                  onClick={() => focar(t)}
                  className="hover:bg-sol focus-visible:bg-sol flex w-full cursor-pointer justify-between gap-2 rounded px-2 py-1 text-left focus-visible:outline-2"
                >
                  <span className="font-bold">{t.dono ? `@${t.dono}` : "Abandonado"}</span>
                  <span className="tabular-nums">
                    {t.x}|{t.y} · {d.toFixed(1)} campos
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </div>
  );
}

function BotaoMapa({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className="borda-mao carimbo bg-papel size-11 cursor-pointer text-2xl leading-none font-extrabold"
    >
      {children}
    </button>
  );
}

function PainelAlvo({
  alvo,
  casa,
  estado,
  velocidade,
  aoFechar,
  aoEnviar,
}: {
  alvo: TerritorioMapa;
  casa: { id: string; x: number; y: number };
  estado: EstadoTerritorio;
  velocidade: number;
  aoFechar: () => void;
  aoEnviar: (e: EstadoTerritorio) => void;
}) {
  const [modo, setModo] = useState<"ataque" | "espionagem" | null>(null);
  const [crew, setCrew] = useState<Crew>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(null);

  // Ao trocar de alvo, limpa o formulário.
  const [alvoAnterior, setAlvoAnterior] = useState(alvo.id);
  if (alvoAnterior !== alvo.id) {
    setAlvoAnterior(alvo.id);
    setModo(null);
    setCrew({});
    setAviso(null);
  }

  const dist = distancia(alvo, casa);
  const tropas = estado.tropas.filter((t) => (modo === "espionagem" ? t.tipo === "olheiro" : true));
  const escolhidas = Object.entries(crew).filter(([, q]) => q > 0);
  const maisLento = Math.max(
    0,
    ...escolhidas.map(([k]) => estado.tropas.find((t) => t.tipo === k)?.min_por_campo ?? 0),
  );
  const ataque = escolhidas.reduce(
    (s, [k, q]) => s + q * (estado.tropas.find((t) => t.tipo === k)?.ataque ?? 0),
    0,
  );
  const carga = escolhidas.reduce(
    (s, [k, q]) => s + q * (estado.tropas.find((t) => t.tipo === k)?.carga ?? 0),
    0,
  );
  const bloqueio = alvo.meu ? "É seu." : alvo.protegido ? "Proteção de iniciante." : null;

  async function enviar() {
    if (!modo || escolhidas.length === 0) return;
    setEnviando(true);
    setAviso(null);
    const { data, error } = await criarClienteNavegador().rpc("enviar_crew", {
      p_origem: casa.id,
      p_destino: alvo.id,
      p_tipo: modo,
      p_unidades: Object.fromEntries(escolhidas),
    });
    setEnviando(false);
    if (error) {
      setAviso({
        erro: true,
        texto: ERROS_ECONOMIA[error.message] ?? "Não deu para enviar agora.",
      });
      return;
    }
    const novo = normalizarEstado(data);
    aoEnviar(novo);
    const mov = novo.movimentos.filter((m) => m.alvo.id === alvo.id && m.tipo === modo).at(-1);
    setAviso({
      erro: false,
      texto: mov
        ? `Crew na rua! Chega em ${formatarTempo((Date.parse(mov.chega_em) - Date.parse(novo.agora)) / 1000)}.`
        : "Crew na rua!",
    });
    setCrew({});
    setModo(null);
  }

  return (
    <Cartao className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-2xl font-extrabold">{alvo.nome}</h2>
          <p className="tabular-nums">
            {alvo.x}|{alvo.y} · {dist.toFixed(1)} campos de casa
          </p>
        </div>
        <button
          onClick={aoFechar}
          aria-label="Fechar"
          className="cursor-pointer text-2xl font-extrabold"
        >
          ×
        </button>
      </div>
      <p>
        {alvo.meu
          ? "Seu território."
          : alvo.dono
            ? `De @${alvo.dono} · ${formatarNumero(alvo.pontos ?? 0)} pontos`
            : "Abandonado: ninguém defende muito, e o caixa enche sozinho."}
        {alvo.protegido && !alvo.meu && (
          <span className="borda-mao bg-sol ml-2 px-2 text-sm font-extrabold">iniciante</span>
        )}
      </p>

      {bloqueio ? (
        <p className="font-bold">{bloqueio}</p>
      ) : !modo ? (
        <div className="flex gap-3">
          <Botao variante="perigo" className="flex-1 !px-3" onClick={() => setModo("ataque")}>
            Atacar
          </Botao>
          <Botao
            variante="secundario"
            className="flex-1 !px-3"
            onClick={() => setModo("espionagem")}
          >
            Espionar
          </Botao>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <p className="text-xs font-bold uppercase">
            {modo === "ataque" ? "Quem vai no ataque" : "Olheiros"}
          </p>
          {tropas.map((t) => {
            const disp = estado.unidades[t.tipo] ?? 0;
            return (
              <div key={t.tipo} className="flex items-center gap-2">
                <label htmlFor={`env-${t.tipo}`} className="flex-1 font-bold">
                  {t.nome} <span className="font-normal tabular-nums">({disp})</span>
                </label>
                <input
                  id={`env-${t.tipo}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={disp}
                  disabled={disp === 0}
                  value={crew[t.tipo] ?? 0}
                  onChange={(e) =>
                    setCrew((c) => ({
                      ...c,
                      [t.tipo]: Math.min(disp, Math.max(0, Math.floor(Number(e.target.value)))),
                    }))
                  }
                  className="borda-mao bg-papel focus-visible:bg-sol disabled:bg-concreto w-20 px-2 py-1 text-center font-extrabold tabular-nums outline-none"
                />
                <button
                  type="button"
                  disabled={disp === 0}
                  onClick={() => setCrew((c) => ({ ...c, [t.tipo]: disp }))}
                  className="borda-mao carimbo bg-papel disabled:bg-concreto cursor-pointer px-2 text-sm font-extrabold uppercase"
                >
                  tudo
                </button>
              </div>
            );
          })}
          {escolhidas.length > 0 && (
            <p className="borda-mao-2 bg-sol p-2 text-sm font-bold tabular-nums">
              Viagem: {formatarTempo(preverViagemSegundos(dist, maisLento, velocidade))}
              {modo === "ataque" && ` · ataque ${ataque} · carga ${carga}`}
            </p>
          )}
          {modo === "ataque" && escolhidas.length > 0 && ataque === 0 && (
            <p className="border-neon border-l-8 pl-2 text-sm font-bold">
              Olheiro não briga: com ataque 0 a crew perde. Mande seguranças, pilotos ou blindados.
            </p>
          )}
          <div className="flex gap-3">
            <Botao
              type="submit"
              variante={modo === "ataque" ? "perigo" : "primario"}
              className="flex-1 !px-3"
              disabled={enviando || escolhidas.length === 0}
            >
              {enviando ? "…" : modo === "ataque" ? "Mandar ataque" : "Mandar olheiros"}
            </Botao>
            <Botao
              type="button"
              variante="secundario"
              className="!px-3"
              onClick={() => setModo(null)}
            >
              Voltar
            </Botao>
          </div>
        </form>
      )}

      {aviso && (
        <p role="status" className={`font-bold ${aviso.erro ? "border-neon border-l-8 pl-2" : ""}`}>
          {aviso.texto}
        </p>
      )}
    </Cartao>
  );
}
