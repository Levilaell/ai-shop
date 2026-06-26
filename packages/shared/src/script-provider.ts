/**
 * Script generation provider (spec §7, §11). The `ScriptProvider` interface
 * abstracts the LLM behind a swappable boundary — Claude today, anything later.
 * The PROMPT is built by a PURE function here so it can be unit-tested and so
 * the rules (no prohibited claims, demonstration format, N distinct angles) live
 * in `shared`, not buried in the worker adapter.
 */

import type { AffiliatePlatform } from './state-machine.js';

/** What the model needs to know about the product to write angles. */
export interface ScriptProductContext {
  readonly title: string;
  readonly category?: string | null;
  readonly price_brl: number;
  readonly affiliate_platform?: AffiliatePlatform;
}

/** One generated angle: the unit the operator approves in the script queue. */
export interface GeneratedAngle {
  /** Short label for the approach (e.g. "antes/depois", "problema-solução"). */
  readonly angle: string;
  /** The first ~2 seconds — the single strongest ranking signal (spec §7). */
  readonly hook: string;
  /** The demonstration body. */
  readonly body: string;
  /** Call to action. */
  readonly cta: string;
}

export interface ScriptGenerationRequest {
  readonly product: ScriptProductContext;
  /** How many distinct angles to produce (variety is anti-repetition defense). */
  readonly variants: number;
}

export interface ScriptProvider {
  /** Model identifier recorded on each script row (`scripts.model_used`). */
  readonly model: string;
  /** Generate exactly `variants` distinct angles for the product. */
  generate(req: ScriptGenerationRequest): Promise<GeneratedAngle[]>;
}

/** Default number of angles per product (spec §7: N=3). */
export const DEFAULT_SCRIPT_VARIANTS = 3;

/** JSON Schema for the structured output (used by the Claude adapter). */
export const SCRIPT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    angles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          angle: { type: 'string' },
          hook: { type: 'string' },
          body: { type: 'string' },
          cta: { type: 'string' },
        },
        required: ['angle', 'hook', 'body', 'cta'],
      },
    },
  },
  required: ['angles'],
} as const;

export interface BuiltPrompt {
  readonly system: string;
  readonly user: string;
}

/**
 * Build the Claude prompt for N angles. PURE — no I/O. The system prompt encodes
 * the non-negotiable rules from spec §7:
 *  - PROIBIR claims exagerados/proibidos (saúde, resultado biológico, "cura").
 *  - Formato de DEMONSTRAÇÃO do produto, não "avatar elogiando".
 *  - Hook nos 2 primeiros segundos (sinal de ranking mais forte).
 *  - N ângulos DISTINTOS (variedade derrota a regra anti-repetição do TikTok).
 */
export function buildScriptPrompt(req: ScriptGenerationRequest): BuiltPrompt {
  const { product, variants } = req;
  const system = [
    'Você é roteirista de vídeos curtos de afiliado para TikTok Shop Brasil.',
    'Seu objetivo é roteiro que o algoritmo do TikTok NÃO rebaixe: conteúdo variado,',
    'com demonstração funcional real do produto — NÃO um avatar apenas elogiando.',
    '',
    'REGRAS OBRIGATÓRIAS:',
    '- PROIBIDO qualquer claim exagerado, promessa de resultado biológico, cura, emagrecimento,',
    '  clareamento, "milagre", ou superlativos não comprováveis. Sem afirmações de saúde.',
    '- Foque em DEMONSTRAÇÃO: mostre o produto resolvendo um problema concreto em ≤15s.',
    '- O HOOK são os 2 primeiros segundos e é o sinal de ranking mais forte: faça-o específico e visual.',
    `- Gere EXATAMENTE ${variants} ângulos DISTINTOS entre si (abordagens diferentes, não variações do mesmo texto).`,
    '- Português do Brasil, tom natural de criador, frases curtas.',
    '- O roteiro de IA é isento de rótulo; só o vídeo sintético exige rótulo — não mencione rótulo de IA no roteiro.',
    '',
    'Para cada ângulo retorne: angle (rótulo da abordagem), hook, body (demonstração), cta.',
  ].join('\n');

  const user = [
    'Produto:',
    `- Título: ${product.title}`,
    `- Categoria: ${product.category ?? '(não informada)'}`,
    `- Preço: R$${product.price_brl.toFixed(2)}`,
    `- Plataforma: ${product.affiliate_platform ?? 'tiktok_shop'}`,
    '',
    `Gere ${variants} ângulos de roteiro seguindo todas as regras.`,
  ].join('\n');

  return { system, user };
}

/** Validate/normalize the raw model output into GeneratedAngle[] (throws on malformed). */
export function parseAngles(raw: unknown, expected: number): GeneratedAngle[] {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { angles?: unknown }).angles)) {
    throw new Error('Script output missing "angles" array');
  }
  const angles = (raw as { angles: unknown[] }).angles.map((a, i): GeneratedAngle => {
    const o = a as Record<string, unknown>;
    for (const k of ['angle', 'hook', 'body', 'cta'] as const) {
      if (typeof o[k] !== 'string' || (o[k] as string).trim() === '') {
        throw new Error(`Angle ${i} missing field "${k}"`);
      }
    }
    return {
      angle: (o['angle'] as string).trim(),
      hook: (o['hook'] as string).trim(),
      body: (o['body'] as string).trim(),
      cta: (o['cta'] as string).trim(),
    };
  });
  if (angles.length === 0) throw new Error('Script output produced zero angles');
  // The schema can't bound array length; trim to the requested count if the model overshoots.
  return angles.slice(0, expected);
}
