import Link from "next/link";
import { BotaoSair } from "./BotaoSair";

export function BarraTopo({ username }: { username: string }) {
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-4">
      <Link href="/mundos" className="titulo-carimbo text-sol text-3xl">
        Costa Neon
      </Link>
      <div className="flex items-center gap-3">
        <span className="borda-mao-2 bg-papel px-3 py-1 font-extrabold">@{username}</span>
        <BotaoSair />
      </div>
    </header>
  );
}
