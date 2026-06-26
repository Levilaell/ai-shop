/**
 * Worker entrypoint (spec §5). Boots the pgmq consumer: structured logging,
 * service-role Supabase client (bypasses RLS — handlers scope by account_id),
 * the job queue, and the concurrency-bounded runner. Handlers are stubs in T3;
 * Claude (T4), HeyGen (T5), and the feedback loop (T8) fill them in.
 */

import { createServiceClient } from '@ai-shop/db';
import type { ScriptProvider, VideoProvider } from '@ai-shop/shared';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { JobQueue } from './queue.js';
import { Runner } from './runner.js';
import { AnthropicScriptProvider } from './providers/anthropic-script-provider.js';
import { HeygenVideoProvider } from './providers/heygen-video-provider.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger({ component: 'worker' });

  const db = createServiceClient();
  const queue = new JobQueue(db, config.queueName);

  // Script provider (T4) is optional: without a key the worker still runs (other
  // job types work); generate_script jobs fail loudly until the key is set.
  let scriptProvider: ScriptProvider | null = null;
  if (config.anthropicApiKey) {
    scriptProvider = new AnthropicScriptProvider(config.anthropicApiKey);
    log.info('script provider configurado', { model: scriptProvider.model });
  } else {
    log.warn('ANTHROPIC_API_KEY ausente — generate_script vai falhar até configurar (T4)');
  }

  // Video provider (T5) is optional too. Needs the key + an avatar/voice id.
  let videoProvider: VideoProvider | null = null;
  if (config.heygenApiKey && config.heygenAvatarId && config.heygenVoiceId) {
    videoProvider = new HeygenVideoProvider({
      apiKey: config.heygenApiKey,
      avatarId: config.heygenAvatarId,
      voiceId: config.heygenVoiceId,
    });
    log.info('video provider configurado', { provider: videoProvider.name });
  } else {
    log.warn('HeyGen incompleto (KEY/AVATAR_ID/VOICE_ID) — generate_video vai falhar (T5)');
  }

  const runner = new Runner(queue, log, config, {
    db,
    queue,
    config,
    scriptProvider,
    videoProvider,
  });

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    log.info('signal received — shutting down', { signal });
    runner.stop();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await runner.start();
  } catch (err) {
    log.error('fatal: runner crashed', { err });
    process.exitCode = 1;
  }
}

void main();
