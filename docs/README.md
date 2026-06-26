# ai-shop — Pipeline de afiliados com IA (TikTok Shop)

Painel de controle + worker que orquestra a pipeline de marketing de afiliados
como uma máquina de estados, com dois pontos de aprovação humana e um portão de
compliance obrigatório. Publicação é manual na v1.

```
Seleção de produto → Roteiro (Claude) → Vídeo (HeyGen) → Compliance
→ Publicação manual → Tracking de vendas → Feedback
```

> 📄 **Contexto completo:** [`HANDOFF.md`](HANDOFF.md) (estado atual, bootstrap em
> máquina nova, decisões) · [`SPEC.md`](SPEC.md) (especificação de build original).

## Stack

- **TypeScript** end-to-end, monorepo **pnpm workspaces**.
- **Supabase** (Postgres + Auth + RLS + Realtime).
- **pgmq** — fila no próprio Postgres (worker, T3+).
- **Worker** — processo Node separado (bypassa RLS; filtra `account_id` na mão).
- **Next.js** — dashboard realtime (T7).
- **Claude** (roteiro) e **HeyGen** (vídeo) atrás de interfaces trocáveis.

## Estrutura

```
apps/
  web/          # Dashboard Next.js              (T7 — placeholder)
  worker/       # Consumidor da fila pgmq        (T3 — stub)
packages/
  shared/       # Máquina de estados + tipos compartilhados
  db/           # Clientes Supabase + tipos gerados do schema
supabase/
  migrations/   # Schema, RLS, triggers, realtime
  seed.sql      # Conta + usuário de teste + produtos candidatos (local)
  config.toml   # Config do stack local
```

## Modelo de RLS

Isolamento por **membership**: `account_users` mapeia `auth.users → accounts`.
Toda policy checa `public.is_account_member(account_id)`. O worker usa a
`service_role` key (bypassa RLS) e **deve** filtrar `account_id` explicitamente.

## Máquina de estados (§4)

Fonte única em [`packages/shared/src/state-machine.ts`](packages/shared/src/state-machine.ts),
espelhada no enum `pipeline_status`. Toda mudança de status é registrada
automaticamente em `pipeline_events` (auditoria idempotente, via trigger).

## Setup local

Pré-requisito: **Docker Desktop** com integração WSL ativada (o stack local do
Supabase roda em containers). O `ai-shop` usa a faixa de portas **`553xx`** para
coexistir com outros projetos Supabase locais (o padrão `543xx`).

```bash
pnpm install
pnpm db:start                              # sobe Postgres + Auth + Realtime + Studio
pnpm db:reset                              # recria o banco: migrations + seed
pnpm gen:types                             # gera packages/db/src/database.types.ts
supabase status -o env > /dev/null         # (as keys saem aqui)
pnpm typecheck                             # valida o TypeScript do monorepo
```

Gere o `.env` a partir do stack local (já está no `.gitignore`):

```bash
# pegue ANON_KEY / SERVICE_ROLE_KEY / API_URL de `supabase status -o env`
# e preencha SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
```

Endereços locais: **Studio** http://127.0.0.1:55323 · **API** http://127.0.0.1:55321
· **DB** `postgresql://postgres:postgres@127.0.0.1:55322/postgres`.
Login de teste: **`operator@local.test`** / **`password123`**.

Os packages internos (`@ai-shop/shared`, `@ai-shop/db`) servem o TypeScript de
`src` direto (sem build); o worker roda via `tsx` (`pnpm --filter @ai-shop/worker dev`).

### Aplicar num projeto Supabase hospedado (alternativa sem Docker)

```bash
supabase link --project-ref <ref>
pnpm db:push       # aplica as migrations no projeto remoto
```

## Status do build

Construído tarefa por tarefa (revisão entre cada uma):

- [x] **T1** — Fundação: monorepo, schema + RLS + migrations, `pipeline_events`, seed.
- [x] **T2** — Score de produto (`scoreProduct` puro + testes) + ingestão CSV.
- [x] **T3** — Fila pgmq + worker (semáforo de concorrência, handlers, logging).
- [x] **T4** — Roteiro (Claude via tool-use, N ângulos, `ScriptProvider`).
- [x] **T5** — Vídeo (`VideoProvider` + HeyGen, async, custo, retry/backoff).
- [x] **T6** — Compliance (portão hard-block: pura + trigger DB) + publicação manual.
- [x] **T7** — Frontend Next.js (board kanban realtime, filas, economia unitária).
- [x] **T8** — Tracking (entrada manual de performance) + feedback de score.

> **Validação T2–T8:** `pnpm typecheck` limpo (4 pacotes), **70 testes** verdes
> (`pnpm test`), e `pnpm --filter @ai-shop/web build` compila as 11 rotas. As
> migrations novas (T3 fila, T6 compliance, T8 feedback) **ainda não foram
> aplicadas num Postgres real** (sem Docker neste ambiente) — ver HANDOFF §2.
