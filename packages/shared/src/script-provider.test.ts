import { describe, it, expect } from 'vitest';
import {
  buildScriptPrompt,
  parseAngles,
  DEFAULT_SCRIPT_VARIANTS,
  type ScriptGenerationRequest,
} from './script-provider.js';

const req: ScriptGenerationRequest = {
  product: { title: 'Cortador de legumes 8 em 1', category: 'cozinha', price_brl: 79.9 },
  variants: 3,
};

describe('buildScriptPrompt', () => {
  it('encodes the prohibited-claims and demonstration rules (spec §7)', () => {
    const { system } = buildScriptPrompt(req);
    expect(system).toMatch(/PROIBIDO/);
    expect(system).toMatch(/DEMONSTRAÇÃO/i);
    expect(system).toMatch(/HOOK/);
    expect(system).toMatch(/avatar apenas elogiando/i);
  });
  it('asks for exactly N distinct angles', () => {
    const { system, user } = buildScriptPrompt({ ...req, variants: 5 });
    expect(system).toMatch(/EXATAMENTE 5 ângulos DISTINTOS/);
    expect(user).toMatch(/Gere 5 ângulos/);
  });
  it('includes the product context in the user prompt', () => {
    const { user } = buildScriptPrompt(req);
    expect(user).toMatch(/Cortador de legumes 8 em 1/);
    expect(user).toMatch(/cozinha/);
    expect(user).toMatch(/R\$79\.90/);
  });
  it('default variants constant is 3', () => {
    expect(DEFAULT_SCRIPT_VARIANTS).toBe(3);
  });
});

describe('parseAngles', () => {
  const good = {
    angles: [
      { angle: 'problema-solução', hook: 'Cansado de picar?', body: 'Mostra cortando', cta: 'Link na bio' },
      { angle: 'antes/depois', hook: 'Olha isso', body: 'Demonstra', cta: 'Compra aqui' },
    ],
  };

  it('parses and trims valid angles', () => {
    const out = parseAngles({ angles: [{ angle: ' a ', hook: ' h ', body: ' b ', cta: ' c ' }] }, 3);
    expect(out[0]).toEqual({ angle: 'a', hook: 'h', body: 'b', cta: 'c' });
  });

  it('trims to the requested count if the model overshoots', () => {
    expect(parseAngles(good, 1)).toHaveLength(1);
    expect(parseAngles(good, 5)).toHaveLength(2);
  });

  it('throws when angles is missing or not an array', () => {
    expect(() => parseAngles({}, 3)).toThrow(/angles/);
    expect(() => parseAngles({ angles: 'x' }, 3)).toThrow(/angles/);
    expect(() => parseAngles(null, 3)).toThrow();
  });

  it('throws when an angle is missing a field', () => {
    expect(() => parseAngles({ angles: [{ angle: 'a', hook: 'h', body: 'b' }] }, 3)).toThrow(/cta/);
    expect(() => parseAngles({ angles: [{ angle: '', hook: 'h', body: 'b', cta: 'c' }] }, 3)).toThrow(/angle/);
  });

  it('throws on zero angles', () => {
    expect(() => parseAngles({ angles: [] }, 3)).toThrow(/zero/);
  });
});
