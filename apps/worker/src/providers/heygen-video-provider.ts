/**
 * HeyGen implementation of VideoProvider (spec §8). Direct HTTP with the
 * `X-Api-Key` header (NOT MCP, spec §2). Async: submit returns a job id; poll
 * checks status until completion. Cost is computed from the avatar tier and
 * duration (estimated at submit, actual at completion) — never optional (§3).
 */

import {
  heygenCostUsd,
  type VideoPollResult,
  type VideoProvider,
  type VideoSubmitRequest,
  type VideoSubmitResult,
} from '@ai-shop/shared';

export interface HeygenConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  /** Avatar id to animate (HeyGen account-specific). */
  readonly avatarId: string;
  /** Voice id for narration (HeyGen account-specific). */
  readonly voiceId: string;
}

interface HeygenGenerateResponse {
  error?: { message?: string } | string | null;
  data?: { video_id?: string };
}

interface HeygenStatusResponse {
  data?: {
    status?: string; // 'pending' | 'processing' | 'waiting' | 'completed' | 'failed'
    video_url?: string;
    duration?: number; // seconds
    error?: { message?: string } | string | null;
  };
  error?: { message?: string } | string | null;
}

function errMessage(e: { message?: string } | string | null | undefined): string | undefined {
  if (!e) return undefined;
  return typeof e === 'string' ? e : e.message;
}

export class HeygenVideoProvider implements VideoProvider {
  readonly name = 'heygen';
  private readonly baseUrl: string;

  constructor(private readonly config: HeygenConfig) {
    this.baseUrl = config.baseUrl ?? 'https://api.heygen.com';
  }

  private headers(): Record<string, string> {
    return { 'X-Api-Key': this.config.apiKey, 'Content-Type': 'application/json' };
  }

  async submit(req: VideoSubmitRequest): Promise<VideoSubmitResult> {
    // Compose the narration from the approved script (hook leads — it's the
    // strongest ranking signal). The body should drive a product demonstration.
    const inputText = [req.script.hook, req.script.body, req.script.cta]
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n\n');

    const payload = {
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: this.config.avatarId },
          voice: { type: 'text', input_text: inputText, voice_id: this.config.voiceId },
        },
      ],
      dimension: { width: 1080, height: 1920 }, // vertical, TikTok format
    };

    const res = await fetch(`${this.baseUrl}/v2/video/generate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`HeyGen submit HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as HeygenGenerateResponse;
    const apiErr = errMessage(json.error);
    if (apiErr) throw new Error(`HeyGen submit error: ${apiErr}`);
    const jobId = json.data?.video_id;
    if (!jobId) throw new Error('HeyGen submit: resposta sem video_id');

    return {
      jobId,
      costUsdEstimated: heygenCostUsd(req.estimatedDurationSeconds, req.avatarTier),
    };
  }

  async poll(jobId: string): Promise<VideoPollResult> {
    const url = `${this.baseUrl}/v1/video_status.get?video_id=${encodeURIComponent(jobId)}`;
    const res = await fetch(url, { method: 'GET', headers: this.headers() });
    if (!res.ok) {
      throw new Error(`HeyGen poll HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as HeygenStatusResponse;
    const topErr = errMessage(json.error);
    if (topErr) throw new Error(`HeyGen poll error: ${topErr}`);

    const data = json.data ?? {};
    const status = (data.status ?? '').toLowerCase();

    switch (status) {
      case 'completed': {
        const durationSeconds = typeof data.duration === 'number' ? data.duration : 0;
        // Tier is applied by the handler (which knows the row's avatar_tier);
        // here we surface duration so the handler computes the actual cost.
        const out: VideoPollResult = { status: 'completed', durationSeconds };
        return data.video_url ? { ...out, videoUrl: data.video_url } : out;
      }
      case 'failed':
        return { status: 'failed', error: errMessage(data.error) ?? 'HeyGen job failed' };
      case 'pending':
      case 'processing':
      case 'waiting':
      case '':
      default:
        return { status: 'pending' };
    }
  }
}
