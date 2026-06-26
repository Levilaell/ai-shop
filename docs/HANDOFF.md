# HANDOFF — contexto para continuar (ex.: no MacBook)

Documento de contexto para retomar o desenvolvimento em outra máquina (e para o
Claude Code ter o estado completo do projeto). Leia junto com:

- **[`SPEC.md`](SPEC.md)** — a especificação de build original (o "o quê" e as regras de arquitetura).
- **[`README.md`](README.md)** — visão geral da stack, estrutura e setup.

---

## 1. O que é

Operação semiautomatizada de marketing de afiliados (TikTok Shop Brasil). Painel
de controle + worker que orquestra a pipeline como **máquina de estados**, com
**dois pontos de aprovação humana** e um **portão de compliance** obrigatório.
Publicação é **manual** na v1.

```
Seleção de produto → Roteiro (Claude) → Vídeo (HeyGen) → Compliance
→ Publicação manual → Tracking de vendas → Feedback
```

Princípio mestre: o gargalo não é gerar vídeo — é produzir conteúdo que o
algoritmo do TikTok não rebaixe. Vídeo de IA é insumo dentro de formato variado,
com **custo rastreado por unidade** e conversão medida antes de escalar.

## 2. Status atual

| Tarefa | Estado |
|---|---|
| **T1 — Fundação** | ✅ **Concluída e validada** no Postgres 17 real |
| T2 — Score `scoreProduct` (puro + testes) + ingestão de produtos | ✅ código + 34 testes |
| T3 — Fila pgmq + worker (semáforo de concorrência, handlers, logging) | ✅ código + 5 testes (migration não aplicada) |
| T4 — Roteiro (Claude, N ângulos) | ✅ `ScriptProvider` + adapter Claude (tool-use) |
| T5 — Vídeo (`VideoProvider` + HeyGen, async, custo, retry) | ✅ adapter HeyGen + handlers |
| T6 — Compliance + tela de publicação manual | ✅ gate puro + trigger DB + tela publish |
| T7 — Frontend (board kanban realtime, filas, economia unitária) | ✅ Next.js, 11 rotas, build ok |
| T8 — Tracking/feedback | ✅ entrada de performance + `blendScore` |

> **Validado nesta sessão:** `pnpm typecheck` limpo (4 pacotes), **70 testes**,
> `web build` (11 rotas). **Smoke test ponta-a-ponta no Postgres 17 real:**
> as 8 migrations aplicam (`db:reset`), `gen:types` bate com o código, o trigger
> de enqueue gera o job, o worker consome via wrappers `queue_*`, o **Claude real
> (Opus 4.8) gerou 3 ângulos** e o produto chegou a `script_ready`; o **hard block
> de compliance** rejeitou `ready_to_publish` sem checklist e liberou com; o
> **loop de feedback** subiu o score 40→70 e moveu `published→tracking`.
>
> **2 bugs achados rodando de verdade (corrigidos):** (1) `service_role` sem
> GRANT nas tabelas — adicionado em `*_rls.sql`; (2) worker não achava o `.env`
> da raiz (cwd = apps/worker) — `config.ts` agora busca subindo os diretórios.
>
> **Não testado (custa USD):** submissão real de vídeo no HeyGen. A key foi
> validada (1282 avatares/2350 vozes) e o `.env` está configurado com avatar +
> voz pt-BR (Sofia Brazil) — basta rodar o worker com um roteiro aprovado.

**Disciplina de build (importante):** uma tarefa por vez. Entregar → o operador
revisa → só então avança. **Não construir o que ainda não foi pedido.**

## 3. Bootstrap numa máquina nova (macOS)

Pré-requisitos:

```bash
# Runtime Docker (o stack local do Supabase roda em containers)
#   Docker Desktop para Mac, ou OrbStack, ou Colima. Deixe-o RODANDO.

brew install supabase/tap/supabase     # Supabase CLI
brew install node@22                    # Node 22  (ou use nvm/fnm)
corepack enable && corepack use pnpm@10 # pnpm 10  (ou: npm i -g pnpm)
```

Subir o projeto:

```bash
git clone https://github.com/Levilaell/ai-shop.git
cd ai-shop
pnpm install
pnpm db:start          # sobe Postgres + Auth + Realtime + Studio (precisa do Docker)
pnpm db:reset          # recria o banco: migrations + seed
pnpm gen:types         # gera packages/db/src/database.types.ts a partir do schema
pnpm typecheck         # valida o TypeScript do monorepo (deve passar limpo)
```

Gerar o `.env` (está no `.gitignore`, não vem do git):

```bash
supabase status -o env        # imprime API_URL, ANON_KEY, SERVICE_ROLE_KEY, ...
# crie ai-shop/.env com:
#   SUPABASE_URL=<API_URL>
#   SUPABASE_ANON_KEY=<ANON_KEY>
#   SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
#   ANTHROPIC_API_KEY=        (preencher na T4)
#   HEYGEN_API_KEY=           (preencher na T5)
```

Smoke test do worker (valida wiring + import cross-package):

```bash
pnpm --filter @ai-shop/worker dev
# => "[worker] stub OK — state machine has 13 statuses. Real implementation lands in T3."
```

**Portas:** o projeto usa a faixa **`553xx`** (API 55321, DB 55322, Studio 55323,
Mailpit 55324). Isso foi escolhido no WSL para coexistir com outro projeto
Supabase (`office`) nas portas padrão `543xx`. Num Mac limpo não há conflito —
pode manter `553xx` (já está no `supabase/config.toml`).

**Login de teste (seed):** `operator@local.test` / `password123`.

## 4. Estrutura

```
apps/
  web/          # Dashboard Next.js              (T7 — placeholder)
  worker/       # Consumidor da fila pgmq        (T3 — stub via tsx)
packages/
  shared/       # Máquina de estados + tipos compartilhados (serve src TS direto)
  db/           # Clientes Supabase + tipos gerados do schema
supabase/
  migrations/   # Schema, enums, triggers, RLS, realtime
  seed.sql      # Conta + usuário de teste + produtos candidatos (local)
  config.toml   # Config do stack local (portas 553xx)
SPEC.md         # Especificação de build original
HANDOFF.md      # Este arquivo
```

Packages internos (`@ai-shop/shared`, `@ai-shop/db`) servem o **TypeScript de
`src` direto** (sem etapa de build); o worker roda via **`tsx`** (dev e prod).
No Next (T7) será preciso `transpilePackages: ['@ai-shop/shared','@ai-shop/db']`.

## 5. Decisões de arquitetura travadas na T1

- **Isolamento RLS = tabela de membership.** `account_users` mapeia `auth.users →
  accounts`. Toda policy checa `public.is_account_member(account_id)` (função
  `SECURITY DEFINER`, evita recursão na própria `account_users`). Escolhido em vez
  de `account_id = auth.uid()` e de claim JWT — mais robusto e pronto p/ multi-tenant.
- **`account_id` denormalizado em toda tabela de domínio** (o worker bypassa RLS e
  precisa filtrar `account_id` explicitamente; policies ficam planas/rápidas).
- **Integridade same-account via composite FKs** `(child_id, account_id) →
  parent(id, account_id)` — garante que `child.account_id` sempre é igual ao do
  pai. **Mantenha esse padrão ao criar tabelas-filhas novas.**
- **Auditoria automática:** trigger grava em `pipeline_events` toda mudança de
  status (idempotente: só em mudança real). `actor` derivado do contexto auth
  (`auth.uid()` nulo = worker/`system`; setado = usuário/`user`).
- **Custos são cidadãos de primeira classe:** `videos.cost_usd_estimated` é NOT NULL.
- **Máquina de estados** = fonte única em `packages/shared/src/state-machine.ts`,
  espelhada pelo enum `pipeline_status` (13 estados; `rejected`/`archived` terminais).
- **`account_users` e `pipeline_events` são read-only** para `authenticated`
  (writes revogados); só seed/`service_role` escrevem.
- **Abstrações** previstas (ainda não implementadas): `affiliate_platform`
  (adapter), `VideoProvider` (HeyGen), `ScriptProvider` (Claude).

## 6. O que foi validado na T1 (não é "deve funcionar")

Rodado no Postgres 17 do stack local:

- `supabase db reset` aplica as 6 migrations + seed sem erro;
- seed cria 4 produtos e a auditoria gera 4 eventos `NULL → product_candidate [system]`;
- **login HTTP 200** com `access_token` (GoTrue);
- RLS ativo nas 9 tabelas; enum com 13 labels batendo com `state-machine.ts`;
- composite FK **rejeita** insert cross-account e permite same-account;
- `compliance_checks.reviewed_by` / `pipeline_events.actor_user_id` = `ON DELETE SET NULL`;
- **`@ai-shop/db` (service client) lê os 4 produtos** bypassa-RLS, com colunas tipadas;
- `pnpm typecheck` limpo; worker roda via `tsx`.

### Revisão adversarial — 7 findings corrigidos e verificados

| # | Sev | Resumo | Fix |
|---|-----|--------|-----|
| 1 | HIGH | `account_users` permitia forjar membership `owner` (escalada intra-tenant) | RLS read-only + revoke writes |
| 2 | MED | `account_id` podia divergir do pai | composite FKs `(child,account)→parent(id,account)` |
| 3 | LOW | FK p/ `auth.users` bloqueava deletar usuário | `ON DELETE SET NULL` |
| 4 | LOW | `database.types.ts` placeholder (zero type-safety) | `pnpm gen:types` real |
| 6 | HIGH | login do seed dava 500 (`confirmation_token` NULL no GoTrue) | tokens `=''` no seed |
| 7 | MED | worker via `tsx` não rodava (esbuild + dist) | packages servem `src`; esbuild aprovado |

> #5 (pgmq, marcado "blocker" pela revisão) foi **descartado**: o `create
> extension pgmq` aplicou limpo no Postgres 17 e a extensão está presente.

## 7. Próxima tarefa — T2

`scoreProduct(product): { score, breakdown }` como **função pura e testável**
(`packages/shared`), com pesos configuráveis:

- **Demonstrabilidade** (proxy por categoria: cozinha/casa/tech ↑; beleza/suplemento/moda ↓ ou bloqueado);
- **Faixa de preço de impulso** (ideal R$30–150);
- **Comissão vs. custo** (comissão estimada deve cobrir custo de produção + margem);
- **Sem claim proibido** (categorias de prova biológica/credibilidade extrema penalizadas/bloqueadas).

`breakdown` explica cada componente (auditável no painel). **Escrever testes
unitários.** Mais: ingestão manual de produtos (CSV/form) para popular candidatos.
Ao entrar na T2, vale estabelecer o test runner (ex.: vitest) no `packages/shared`.

## 8. Cheat sheet

```bash
pnpm db:start / db:stop / db:reset / db:status   # stack local
pnpm gen:types                                   # regenerar tipos após mudar schema
pnpm typecheck                                   # checagem de tipos do monorepo
supabase status -o env                           # URLs e keys locais
# psql:  PGPASSWORD=postgres psql -h 127.0.0.1 -p 55322 -U postgres -d postgres
```
