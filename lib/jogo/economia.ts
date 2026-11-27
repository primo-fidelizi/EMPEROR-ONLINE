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

export type EstadoTerritorio = {
  territorio_id: string;
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
  };
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
  recursos_insuficientes: "Faltam recursos para essa obra.",
  fila_cheia: "A fila de obras está cheia. Espere uma terminar.",
  nivel_maximo: "Esse negócio já está no nível máximo.",
  requisito_pendente: "Ainda falta um requisito para esse negócio.",
  territorio_alheio: "Esse território não é seu.",
  muitas_acoes: "Calma! Espere um segundo e tente de novo.",
  nao_autenticado: "Sua sessão expirou. Entre de novo.",
};
