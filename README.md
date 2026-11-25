# Costa Neon 🌴

Jogo de estratégia multiplayer online, no estilo Tribal Wars 2, numa metrópole litorânea
ensolarada e neon. Temporadas rápidas, menos "clica e espera", joga no celular.

A fonte da verdade do projeto é o [`CLAUDE.md`](./CLAUDE.md).

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha quando o Supabase existir (fase 1)
npm run dev                  # http://localhost:3000
```

Páginas: `/` (início) e `/estilo` (guia visual).

## Comandos

| Comando             | O que faz                   |
| ------------------- | --------------------------- |
| `npm run dev`       | servidor de desenvolvimento |
| `npm run lint`      | ESLint                      |
| `npm run typecheck` | checagem de tipos           |
| `npm test`          | testes (Vitest)             |
| `npm run format`    | formata o código (Prettier) |
| `npm run build`     | build de produção           |

## Stack

Next.js + TypeScript + Tailwind na Vercel (Hobby) · Supabase (Free) · GitHub Actions. Custo zero.
