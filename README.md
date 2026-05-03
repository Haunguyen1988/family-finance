# Family Finance

Internal family finance app — track household income, expenses, wallets, and members.

## Stack

- **Client**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + Wouter (hash routing) + Recharts
- **Server**: Express 5 + TypeScript (tsx in dev, esbuild bundle in prod)
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM
- **Locale**: Vietnamese, VND currency

## Getting started

```bash
npm install
npm run dev      # starts express + vite middleware on :5000
```

Open http://localhost:5000

The first run seeds a demo family ("Gia đình Hậu") with members, wallets, categories, and a few sample transactions. The SQLite file (`data.db`) is created next to `package.json` and is gitignored.

## Scripts

- `npm run dev` — dev server (Vite middleware + Express)
- `npm run build` — bundle client (`dist/public`) + server (`dist/index.cjs`)
- `npm run start` — run the bundled production server
- `npm run check` — TypeScript typecheck
- `npm run db:push` — push Drizzle schema to SQLite

## Project layout

```
client/          # React app (Vite root)
server/          # Express API + storage
shared/schema.ts # Drizzle schema + Zod insert schemas
script/build.ts  # production bundler (vite + esbuild)
```

## Status

Internal MVP. See PRs for ongoing work (auth, mobile UX, PWA, recurring transactions, budgets, etc.).
