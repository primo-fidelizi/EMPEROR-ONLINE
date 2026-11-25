import { cn } from "@/lib/cn";

type Variante = "primario" | "secundario" | "perigo";

const estilos: Record<Variante, string> = {
  primario: "bg-sol text-tinta",
  secundario: "bg-papel text-tinta",
  perigo: "bg-neon text-tinta",
};

export function Botao({
  variante = "primario",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      className={cn(
        "borda-mao carimbo cursor-pointer px-6 py-3 text-lg font-extrabold uppercase",
        "focus-visible:outline-tinta focus-visible:outline-4 focus-visible:outline-offset-4",
        "disabled:bg-concreto disabled:cursor-not-allowed disabled:shadow-none",
        estilos[variante],
        className,
      )}
      {...props}
    />
  );
}
