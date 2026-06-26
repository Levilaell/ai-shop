/**
 * pgmq client. Drives the queue through the SECURITY DEFINER RPC wrappers
 * created in supabase/migrations/*_queue.sql, using the service-role Supabase
 * client (bypasses RLS — the worker scopes by account_id in handlers).
 */

import type { AiShopClient, Json } from '@ai-shop/db';
import type { PipelineJob } from '@ai-shop/shared';

/** A message as returned by pgmq.read (via the queue_read wrapper). */
export interface QueueMessage<T = unknown> {
  readonly msgId: number;
  /** Delivery attempt count — drives the dead-letter cutoff. */
  readonly readCt: number;
  readonly enqueuedAt: string;
  readonly vt: string;
  readonly message: T;
}

// Raw shape of pgmq.message_record as PostgREST serializes it.
interface RawMessageRecord {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: unknown;
}

export class JobQueue {
  constructor(
    private readonly db: AiShopClient,
    private readonly queueName: string,
  ) {}

  /** Enqueue a job, optionally invisible for `delaySeconds`. Returns the msg id. */
  async send(job: PipelineJob, delaySeconds = 0): Promise<number> {
    const { data, error } = await this.db.rpc('queue_send', {
      p_queue: this.queueName,
      p_msg: job as unknown as Json,
      p_delay: delaySeconds,
    });
    if (error) throw new Error(`queue_send failed: ${error.message}`);
    return data as number;
  }

  /** Read up to `qty` messages, hiding them for `vtSeconds`. */
  async read(vtSeconds: number, qty: number): Promise<QueueMessage[]> {
    const { data, error } = await this.db.rpc('queue_read', {
      p_queue: this.queueName,
      p_vt: vtSeconds,
      p_qty: qty,
    });
    if (error) throw new Error(`queue_read failed: ${error.message}`);
    const rows = (data ?? []) as RawMessageRecord[];
    return rows.map((r) => ({
      msgId: r.msg_id,
      readCt: r.read_ct,
      enqueuedAt: r.enqueued_at,
      vt: r.vt,
      message: r.message,
    }));
  }

  /** Acknowledge a successfully handled job (removes it from the queue). */
  async delete(msgId: number): Promise<void> {
    const { error } = await this.db.rpc('queue_delete', {
      p_queue: this.queueName,
      p_msg_id: msgId,
    });
    if (error) throw new Error(`queue_delete failed: ${error.message}`);
  }

  /** Move a job to the pgmq archive (dead-letter) after exhausting retries. */
  async archive(msgId: number): Promise<void> {
    const { error } = await this.db.rpc('queue_archive', {
      p_queue: this.queueName,
      p_msg_id: msgId,
    });
    if (error) throw new Error(`queue_archive failed: ${error.message}`);
  }
}
