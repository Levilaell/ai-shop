# Especificação de Build — Pipeline de Afiliados com IA (TikTok Shop Brasil)

> Especificação original do projeto. Descreve **o que** construir e as **regras de
> arquitetura**, não o código pronto. Padrão de revisão tarefa-por-tarefa:
> implementa uma tarefa, o operador revisa, segue. Estado atual em [`HANDOFF.md`](HANDOFF.md).

---

## 1. Contexto e objetivo

Operação semiautomatizada de marketing de afiliados. Fluxo de negócio:

`Seleção de produto (catálogo TikTok Shop) → Roteiro (Claude) → Vídeo (HeyGen API) → Compliance → Publicação manual → Tracking de vendas → Feedback`

O sistema é um **painel de controle + worker** que orquestra essa pipeline como uma máquina de estados, com **dois pontos de aprovação humana** e um **portão de compliance** obrigatório. Publicação é manual na v1 (a API de publicação do TikTok para afiliado é restrita e postar via automação queima contas novas).

**Princípio mestre:** o gargalo do negócio NÃO é gerar vídeo — é produzir conteúdo que o algoritmo do TikTok não rebaixe. Em 2026 o TikTok rebaixa ativamente conteúdo de IA genérico/repetitivo. Portanto o sistema precisa tratar vídeo de IA como insumo dentro de um formato variado, com custo rastreado por unidade, e medir conversão real antes de escalar.

## 2. Stack (fixa — não substituir)

- **Linguagem:** TypeScript puro, end-to-end. Sem n8n.
- **Banco/Auth:** Supabase (Postgres + Auth + RLS + Realtime).
- **Fila:** pgmq (extensão de fila no próprio Postgres).
- **Worker:** processo Node separado (deploy em Railway ou Render). **O worker bypassa RLS — ele DEVE filtrar `tenant_id`/`account_id` explicitamente em toda query.**
- **Frontend:** Next.js (App Router) + React + TypeScript. Realtime via Supabase subscriptions.
- **IA de roteiro:** Anthropic API (Claude). Use a env var `ANTHROPIC_API_KEY`.
- **IA de vídeo:** HeyGen API direta (header `X-Api-Key`, NÃO MCP). Modelo pay-as-you-go, custo em USD. Avatar III ≈ US$1/min (1080p); Avatar IV ≈ US$4/min. Geração é **assíncrona**: submete → recebe ID → faz polling/webhook. Máx. 10 jobs concorrentes.
- **Observabilidade:** logging estruturado desde o dia 1; cada job de vídeo grava custo estimado e real.

## 3. Modelo de dados (Postgres + RLS)

Projete um schema multi-conta (preparado para virar multi-tenant depois, mas v1 pode ser conta única do operador). Tabelas mínimas:

- `accounts` — operador/conta. RLS por `auth.uid()`.
- `products` — candidatos e aprovados do catálogo TikTok Shop. Campos: `id`, `account_id`, `external_ref` (id no catálogo), `affiliate_platform` (enum, default `tiktok_shop`, mas abstraído para Amazon/Shopee futuros), `title`, `price_brl`, `commission_pct`, `category`, `affiliate_link`, `score` (numeric), `score_breakdown` (jsonb), `status` (enum, ver §4), `created_at`, `updated_at`.
- `scripts` — roteiros gerados. Campos: `id`, `product_id`, `account_id`, `angle` (texto do ângulo/abordagem), `hook` (primeiros 2s), `body`, `cta`, `variant_index`, `status`, `model_used`, `created_at`.
- `videos` — jobs e resultados HeyGen. Campos: `id`, `script_id`, `product_id`, `account_id`, `heygen_job_id`, `avatar_tier` (enum `iii`|`iv`), `duration_seconds`, `cost_usd_estimated`, `cost_usd_actual`, `video_url`, `status`, `error`, `retry_count`, `created_at`, `updated_at`.
- `compliance_checks` — registro do portão. Campos: `id`, `video_id`, `ai_label_required` (bool, sempre true para vídeo HeyGen), `claims_ok` (bool), `notes`, `reviewed_by`, `reviewed_at`.
- `publications` — registro de publicação manual. Campos: `id`, `video_id`, `account_id`, `tiktok_post_url`, `published_at`, `affiliate_link_used`.
- `performance` — métricas por publicação. Campos: `id`, `publication_id`, `views`, `clicks`, `orders`, `gmv_brl`, `commission_brl`, `collected_at`. (v1: entrada manual/import; deixe a estrutura pronta para automação futura.)
- `pipeline_events` — log de auditoria de toda transição de estado. Campos: `id`, `entity_type`, `entity_id`, `from_status`, `to_status`, `actor` (`system`|`user`), `payload` (jsonb), `created_at`.

Regras:
- RLS habilitada em todas as tabelas, isolando por `account_id` via claim de JWT.
- Toda mutação de status grava um registro em `pipeline_events` (idempotente).
- Custos (`cost_usd_*`) são cidadãos de primeira classe — nunca opcionais nos jobs de vídeo.

## 4. Máquina de estados

Status do produto/vídeo flui assim (cada estágio lê um status e grava o próximo):

```
product_candidate → product_approved → script_generating → script_ready
→ script_approved (HITL) → video_generating → video_ready
→ compliance_review → ready_to_publish → published → tracking → archived
```

Regras de transição:
- `product_approved` exige ação humana (botão no painel).
- `script_approved` exige ação humana — **bloqueia a chamada cara ao HeyGen até aprovação**.
- `compliance_review → ready_to_publish` exige checklist preenchido em `compliance_checks` (rótulo de IA marcado + claims revisados).
- Toda transição é idempotente: reprocessar não duplica jobs nem custo.
- Falha de HeyGen → status fica em `video_generating` com `error` preenchido e `retry_count` incrementado; retry com backoff, máximo configurável. Retry NÃO regenera roteiro.

## 5. Worker (consumidor da fila pgmq)

- Lê mensagens da fila, processa por tipo (`generate_script`, `generate_video`, `poll_video`, `collect_performance`).
- **Respeita o limite de 10 jobs HeyGen concorrentes.** Implemente um semáforo/limite de concorrência.
- `generate_video`: submete ao HeyGen, grava `heygen_job_id` e `cost_usd_estimated`, agenda `poll_video`.
- `poll_video`: consulta status do job; quando pronto, baixa `video_url`, grava `cost_usd_actual` e `duration_seconds`, transiciona para `video_ready`.
- Logging estruturado em cada passo. Nunca silencie erro de custo.

## 6. Score de seleção de produto (codificar como função pura, testável)

Implemente `scoreProduct(product): { score, breakdown }` com estes critérios (pesos ajustáveis via config):

- **Demonstrabilidade** — produto se explica por demonstração funcional em ≤15s? (proxy: categoria; utilidades de casa/cozinha e acessórios tech pontuam alto; beleza/suplemento/moda pontuam baixo ou são bloqueados).
- **Faixa de preço de impulso** — ideal R$30–150. Penaliza fora da faixa.
- **Comissão vs. custo** — `commission_brl_estimada` deve cobrir com folga o custo de produção (custo HeyGen + margem). Produtos com comissão que não cobre CAC unitário recebem score baixo.
- **Sem claim proibido** — categorias que exigem prova de resultado biológico/credibilidade extrema são penalizadas ou bloqueadas (regra de compliance do TikTok contra promessas exageradas).

`breakdown` deve explicar cada componente para auditar no painel. Escreva testes unitários para a função.

## 7. Geração de roteiro (Claude)

- Para cada produto aprovado, gerar **N variações de ângulo** (default N=3) — não um roteiro único. Variedade é defesa contra a regra anti-repetição do TikTok.
- Cada roteiro tem: `hook` (gancho dos 2 primeiros segundos — é o sinal de ranking mais forte), `body`, `cta`.
- O prompt ao Claude deve proibir claims exagerados/proibidos e instruir formato de demonstração de produto, não "avatar elogiando".
- Roteiro feito por IA é isento de rótulo no TikTok — só o vídeo/áudio sintético exige rótulo. Não confundir.

## 8. Geração de vídeo (HeyGen)

- `avatar_tier` configurável por vídeo. **Default III** (barato) para teste de formato; IV só para formatos já validados.
- Submissão assíncrona com polling. Timeout e retry com backoff.
- Gravar custo estimado na submissão e custo real na conclusão.
- O formato do vídeo deve favorecer demonstração real do produto (B-roll do produto físico recebido via Colaboração Aberta) + avatar como parte, não o vídeo inteiro sendo avatar falando.

## 9. Portão de compliance (não-negociável)

Antes de qualquer publicação, o painel força um checklist:
- `ai_label_required` = sempre true para vídeo HeyGen → lembrete de ativar o toggle AIGC ao postar.
- `claims_ok` — operador confirma que o vídeo não faz promessa exagerada nem claim proibido.
- Sem checklist completo, o vídeo não avança para `ready_to_publish`. Hard block.

## 10. Painel frontend (Next.js + React)

Visões mínimas:
1. **Board de pipeline** (estilo kanban) — colunas = estágios da máquina de estados; cards = produtos/vídeos; arrastar/clicar move de estágio onde a transição é manual. Realtime.
2. **Fila de aprovação de produtos** — lista ordenada por score, com `score_breakdown` visível; botões aprovar/rejeitar.
3. **Fila de aprovação de roteiros** — preview dos N ângulos lado a lado; aprovar um, editar, ou rejeitar; só o aprovado dispara vídeo.
4. **Fila de vídeos** — status do job HeyGen, preview quando pronto, custo estimado vs. real por vídeo.
5. **Checklist de compliance** — por vídeo, antes de liberar para publicação.
6. **Tela de publicação manual** — entrega tudo num lugar: vídeo pronto para download, roteiro/legenda, link de afiliado, e checklist de "lembre de ativar o rótulo de IA". Campo para colar a URL do post depois.
7. **Dashboard de economia unitária** — o mais importante: por produto e agregado, mostra custo total de produção vs. comissão acumulada, CAC por vídeo, e ROI. Esta tela responde "o negócio fecha?".

Regras de UI: minimalista, sem over-engineering visual; foco em velocidade de operação. Realtime via Supabase.

## 11. Abstrações para não refazer depois

- **`affiliate_platform`** abstraído (adapter pattern) — TikTok Shop hoje; estrutura permite Amazon/Shopee como fontes futuras sem reescrever pipeline.
- **Provedor de vídeo** abstraído atrás de uma interface (`VideoProvider`) — HeyGen hoje, trocável depois.
- **Provedor de roteiro** abstraído (`ScriptProvider`).

## 12. Ordem de implementação (uma tarefa por vez, com revisão)

- **T1 — Fundação:** projeto TS, Supabase, schema + RLS + migrations, `pipeline_events`, seed de conta de teste.
- **T2 — Score:** função `scoreProduct` pura + testes. Ingestão manual de produtos (CSV/form) para popular candidatos.
- **T3 — Fila + worker esqueleto:** pgmq, worker consumidor com semáforo de concorrência, handler stub de cada tipo de job, logging estruturado.
- **T4 — Roteiro:** integração Claude, geração de N ângulos, transições de estado, testes.
- **T5 — Vídeo:** `VideoProvider` + adapter HeyGen, submissão assíncrona, polling, tracking de custo, retry/backoff.
- **T6 — Compliance + publicação:** portão de checklist, tela de publicação manual.
- **T7 — Frontend:** board kanban realtime, filas de aprovação, dashboard de economia unitária.
- **T8 — Tracking/feedback:** entrada de performance, realimentação do score.

Para cada tarefa: entregue, o operador revisa, só então avança. Não pule estágios. Não construa o que ainda não foi pedido.

## 13. O que NÃO construir na v1

- Publicação automática no TikTok (API restrita + risco de banimento).
- Multi-tenant completo (estruture o schema preparado, mas v1 é conta única).
- Integração de OAuth/ConnectedAccount.
- Coleta automática de performance (deixe manual/import; estrutura pronta para depois).

---

### Notas de implementação (divergências/decisões tomadas na T1)

A T1 seguiu a spec com estes ajustes deliberados (ver `HANDOFF.md` §5):

- **RLS por tabela de membership** (`account_users`), não por claim JWT — mais robusto
  e pronto p/ multi-tenant. O `accounts` continua isolado por usuário, via a membership.
- **`account_id` denormalizado** em todas as tabelas de domínio (necessário porque o
  worker bypassa RLS) + **composite FKs** garantindo `child.account_id == parent.account_id`.
- `pipeline_events` ganhou `account_id` e `actor_user_id`; auditoria é gravada por
  trigger automático (idempotente) e é append-only para clientes.
- Adicionado estado terminal `rejected` (usado pelos botões de rejeição do §10).
