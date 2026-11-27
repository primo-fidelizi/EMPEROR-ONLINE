/**
 * Tipos e PREVISÕES da economia para a tela. Quem decide é o banco (RPC estado_territorio);
 * aqui só projetamos o que o servidor já disse, para os números andarem a cada segundo.
 */

export const RECURSOS = ["cash", "material", "influencia"] as const;
export type Recurso = (typeof RECURSOS)[number];
export type Recursos = Record<Recurso, number>;

export const NOME_RECURSO: Record<Recurso, string> = {
  cash: "Cash",
  material: "Material",
  influencia: "Influência",
};

export type Negocio = {
  tipo: string;
  ordem: number;
  nome: string;
  descricao: string;
  nivel: number;
  nivel_planejado: number;
  max_nivel: number;
  requisito: string | null;
  proximo: { nivel: number; custo: Recursos; tempo_s: number } | null;
};

export type Obra = {
  id: number;
  tipo: string;
  nivel_alvo: number;
  inicia_em: string;
  termina_em: string;
};

export type Crew = Record<string, number>;

export type Tropa = {
  tipo: string;
  ordem: number;
  nome: string;
  descricao: string;
  custo: Recursos;
  tempo_s: number;
  ataque: number;
  defesa: number;
  carga: number;
  min_por_campo: number;
  garagem: number;
  liberado: boolean;
};

export type Ficha = { id: string; nome: string; x: number; y: number; dono: string | null };

export type Movimento = {
  id: number;
  tipo: "ataque" | "espionagem" | "retorno";
  unidades: Crew;
  saque: Recursos;
  sai_em: string;
  chega_em: string;
  alvo: Ficha;
};

export type Lote = {
  id: number;
  tipo: string;
  quantidade: number;
  inicia_em: string;
  termina_em: string;
};

export type EstadoTerritorio = {
  territorio_id: string;
  world_id: string;
  posicao: { x: number; y: number };
  unidades: Crew;
  recrutamento: Lote[];
  recrutamento_max: number;
  tropas: Tropa[];
  movimentos: Movimento[];
  chegando: Array<{ chega_em: string; origem: Ficha }>;
  relatorios_nao_lidos: number;
  agora: string;
  recursos: Recursos;
  taxas_h: Recursos;
  capacidade: number;
  negocios: Negocio[];
  fila: Obra[];
  fila_max: number;
  subidos?: number;
};

/** Converte números que chegam como string (numeric do Postgres) para number. */
export function normalizarEstado(bruto: unknown): EstadoTerritorio {
  const e = bruto as EstadoTerritorio;
  const num = (r: Recursos): Recursos => ({
    cash: Number(r.cash),
    material: Number(r.material),
    influencia: Number(r.influencia),
  });
  return {
    ...e,
    recursos: num(e.recursos),
    taxas_h: num(e.taxas_h),
    capacidade: Number(e.capacidade),
    negocios: e.negocios.map((n) => ({
      ...n,
      proximo: n.proximo ? { ...n.proximo, custo: num(n.proximo.custo) } : null,
    })),
    unidades: e.unidades ?? {},
    recrutamento: e.recrutamento ?? [],
    tropas: (e.tropas ?? []).map((t) => ({ ...t, custo: num(t.custo) })),
    movimentos: (e.movimentos ?? []).map((m) => ({ ...m, saque: num(m.saque) })),
    chegando: e.chegando ?? [],
    relatorios_nao_lidos: Number(e.relatorios_nao_lidos ?? 0),
  };
}

/** Próximo instante em que algo muda no servidor (obra, recrutamento, chegada). */
export function proximoEvento(e: EstadoTerritorio): number | null {
  const tempos = [
    ...e.fila.map((o) => o.termina_em),
    ...e.recrutamento.map((r) => r.termina_em),
    ...e.movimentos.map((m) => m.chega_em),
    ...e.chegando.map((c) => c.chega_em),
  ].map((t) => Date.parse(t));
  return tempos.length ? Math.min(...tempos) : null;
}

/** Quantas unidades dá para recrutar com os recursos atuais. */
export function maximoRecrutavel(recursos: Recursos, custo: Recursos): number {
  return Math.max(
    0,
    Math.min(
      ...RECURSOS.map((k) => (custo[k] > 0 ? Math.floor(recursos[k] / custo[k]) : Infinity)),
    ),
  );
}

/**
 * Previsão dos recursos `msDepois` milissegundos depois da foto do servidor, com as taxas atuais.
 * Mesma regra do banco: cresce até o armazém e nunca diminui.
 */
export function preverRecursos(e: EstadoTerritorio, msDepois: number): Recursos {
  const horas = Math.max(0, msDepois) / 3_600_000;
  const r = {} as Recursos;
  for (const k of RECURSOS) {
    const base = e.recursos[k];
    r[k] = Math.max(base, Math.min(e.capacidade, base + e.taxas_h[k] * horas));
  }
  return r;
}

export function podePagar(recursos: Recursos, custo: Recursos): boolean {
  return RECURSOS.every((k) => Math.floor(recursos[k]) >= custo[k]);
}

/** Quanto falta de cada recurso (só os que faltam). */
export function falta(recursos: Recursos, custo: Recursos): Partial<Recursos> {
  const f: Partial<Recursos> = {};
  for (const k of RECURSOS) {
    const d = custo[k] - Math.floor(recursos[k]);
    if (d > 0) f[k] = d;
  }
  return f;
}

export function formatarNumero(n: number): string {
  return Math.floor(n).toLocaleString("pt-BR");
}

/** 47 → "47s", 125 → "2min 05s", 3725 → "1h 02min". */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (m > 0) return `${m}min ${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}

export const ERROS_ECONOMIA: Record<string, string> = {
  crew_vazia: "Escolha pelo menos uma unidade.",
  crew_invalida: "Quantidade de crew inválida.",
  crew_insuficiente: "Você não tem essa crew toda em casa.",
  alvo_proprio: "Esse território é seu.",
  alvo_protegido: "Esse jogador ainda está sob proteção de iniciante.",
  alvo_inexistente: "Esse território não existe mais.",
  so_olheiros: "Para espionar, mande só olheiros.",
  quantidade_invalida: "Quantidade inválida.",
  unidade_inexistente: "Essa unidade não existe.",
  recursos_insuficientes: "Faltam recursos para essa obra.",
  fila_cheia: "A fila de obras está cheia. Espere uma terminar.",
  nivel_maximo: "Esse negócio já está no nível máximo.",
  requisito_pendente: "Ainda falta um requisito para esse negócio.",
  territorio_alheio: "Esse território não é seu.",
  muitas_acoes: "Calma! Espere um segundo e tente de novo.",
  nao_autenticado: "Sua sessão expirou. Entre de novo.",
};
