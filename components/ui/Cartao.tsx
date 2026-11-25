import { cn } from "@/lib/cn";

export function Cartao({
  className,
  destaque = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { destaque?: boolean }) {
  return (
    <div
      className={cn(
        "borda-mao-2 shadow-carimbo-g p-5",
        destaque ? "bg-sol" : "bg-papel",
        className,
      )}
      {...props}
    />
  );
}
