import { cn } from "@/lib/cn";

type Nivel = 1 | 2 | 3;

const tamanhos: Record<Nivel, string> = {
  1: "text-5xl sm:text-7xl",
  2: "text-3xl sm:text-4xl",
  3: "text-2xl",
};

/** Título de letreiro desenhado à mão. Sobre o fundo `mar`, use cor `papel` ou `sol` (só títulos grandes). */
export function Titulo({
  nivel = 2,
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { nivel?: Nivel }) {
  const Tag = `h${nivel}` as const;
  return (
    <Tag className={cn("titulo-carimbo leading-none", tamanhos[nivel], className)} {...props} />
  );
}
