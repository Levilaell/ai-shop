import { describe, it, expect } from 'vitest';
import { parseCsv, parseProductsCsv, buildProductInsert } from './ingestion.js';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
  it('handles quoted fields with commas and escaped quotes', () => {
    const out = parseCsv('title,note\n"Cortador, 8 em 1","diz ""olá"""');
    expect(out[1]).toEqual(['Cortador, 8 em 1', 'diz "olá"']);
  });
  it('handles quoted newlines', () => {
    const out = parseCsv('a,b\n"line1\nline2",x');
    expect(out[1]).toEqual(['line1\nline2', 'x']);
  });
  it('strips a UTF-8 BOM', () => {
    const out = parseCsv('﻿a,b\n1,2');
    expect(out[0]).toEqual(['a', 'b']);
  });
});

const HEADER = 'external_ref,title,price_brl,commission_pct,category,affiliate_link';

describe('parseProductsCsv', () => {
  it('parses valid rows and reports none in error', () => {
    const csv = `${HEADER}\nTT-1,Cortador 8 em 1,79.90,18,cozinha,https://shop.tiktok.com/aff/TT-1`;
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      external_ref: 'TT-1',
      title: 'Cortador 8 em 1',
      price_brl: 79.9,
      commission_pct: 18,
      category: 'cozinha',
      affiliate_platform: 'tiktok_shop',
    });
  });

  it('accepts pt-BR formatted numbers', () => {
    const csv = `${HEADER}\nTT-2,Organizador,"1.234,56",22,tech_acessorios,`;
    const { rows } = parseProductsCsv(csv);
    expect(rows[0]!.price_brl).toBeCloseTo(1234.56, 2);
    expect(rows[0]!.affiliate_link).toBeNull();
  });

  it('is header-order independent and case-insensitive', () => {
    const csv = 'Title,Commission_Pct,Price_BRL\nProduto,15,49.90';
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({ title: 'Produto', price_brl: 49.9, commission_pct: 15 });
  });

  it('reports missing required headers without throwing', () => {
    const { rows, errors } = parseProductsCsv('foo,bar\n1,2');
    expect(rows).toHaveLength(0);
    expect(errors[0]!.message).toMatch(/Cabeçalhos obrigatórios ausentes/);
  });

  it('collects per-row errors and skips bad rows', () => {
    const csv = [
      HEADER,
      'TT-1,Bom,79.90,18,cozinha,', // ok
      'TT-2,,49.90,10,casa,', // empty title
      'TT-3,Ruim,abc,10,casa,', // bad price
      'TT-4,Comissao,50,150,casa,', // commission > 100
      'TT-5,Plataforma,50,10,casa,,facebook', // bad platform (extra col)
    ].join('\n');
    const csvWithPlatformHeader = `${HEADER},affiliate_platform\n` + csv.split('\n').slice(1).join('\n');
    const { rows, errors } = parseProductsCsv(csvWithPlatformHeader);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.external_ref).toBe('TT-1');
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 5]);
  });

  it('drops fully blank lines', () => {
    const csv = `${HEADER}\n\nTT-1,Produto,50,10,casa,\n\n`;
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });
});

describe('buildProductInsert', () => {
  it('attaches a computed score, breakdown, and candidate status', () => {
    const { rows } = parseProductsCsv(`${HEADER}\nTT-1,Cortador 8 em 1,79.90,18,cozinha,`);
    const insert = buildProductInsert(rows[0]!, 'acc-123');
    expect(insert.account_id).toBe('acc-123');
    expect(insert.status).toBe('product_candidate');
    expect(insert.score).toBeGreaterThan(0);
    expect(insert.score_breakdown.blocked).toBe(false);
  });

  it('scores a blocked product to 0', () => {
    const { rows } = parseProductsCsv(`${HEADER}\nTT-9,Serum clareador,89.90,25,beleza,`);
    const insert = buildProductInsert(rows[0]!, 'acc-123');
    expect(insert.score).toBe(0);
    expect(insert.score_breakdown.blocked).toBe(true);
  });
});
