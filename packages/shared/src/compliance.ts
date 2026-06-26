/**
 * Compliance gate (spec §9) — the non-negotiable checklist before publication.
 *
 * Pure logic, mirrored by a DB trigger (supabase/migrations/*_compliance.sql)
 * so the gate is enforced even if a client tries to skip it (defense in depth).
 *
 * The gate requires, before `compliance_review -> ready_to_publish`:
 *   - `claims_ok === true`   (operator confirmed no exaggerated/forbidden claim)
 *   - the review is recorded  (`reviewed_by` + `reviewed_at`)
 * `ai_label_required` is always true for HeyGen video — it's a hard reminder to
 * flip the TikTok AIGC toggle when posting, surfaced on the publication screen.
 */

/** The subset of a compliance_checks row the gate evaluates. */
export interface ComplianceChecklist {
  readonly ai_label_required: boolean;
  readonly claims_ok: boolean | null;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
}

export interface ComplianceGateResult {
  readonly ok: boolean;
  /** Why the gate is blocked (empty when ok). Shown in the checklist UI. */
  readonly reasons: readonly string[];
}

/** Evaluate whether a video may advance to `ready_to_publish` (§9 hard block). */
export function evaluateComplianceGate(c: ComplianceChecklist | null | undefined): ComplianceGateResult {
  const reasons: string[] = [];
  if (!c) {
    return { ok: false, reasons: ['Checklist de compliance ainda não criado para este vídeo.'] };
  }
  if (c.claims_ok !== true) {
    reasons.push('Confirme que o vídeo não faz claim exagerado nem proibido (claims_ok).');
  }
  if (!c.reviewed_by || !c.reviewed_at) {
    reasons.push('Registre a revisão (quem revisou e quando).');
  }
  return { ok: reasons.length === 0, reasons };
}

/** Always-true reminder shown on the publication screen (spec §9, §10.6). */
export const AI_LABEL_REMINDER =
  'Ative o rótulo de conteúdo de IA (AIGC) ao publicar no TikTok — obrigatório para vídeo HeyGen.';

/** A script as needed to build the caption. */
export interface CaptionScript {
  readonly hook: string;
  readonly body: string;
  readonly cta: string;
}

/**
 * Build the caption/legenda the operator copies when posting manually (§10.6).
 * Hook first (it's the strongest signal), then body, then CTA.
 */
export function buildCaption(script: CaptionScript): string {
  return [script.hook, script.body, script.cta]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n\n');
}
