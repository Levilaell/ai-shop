/**
 * Structured logging (spec §2: structured logging from day one; §5: never
 * silence a cost error). One JSON object per line — cheap to ship to any log
 * aggregator. A `child` carries bound fields (e.g. job id) into every line.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bound: Record<string, unknown>): Logger;
}

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function serializeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function createLogger(
  bound: Record<string, unknown> = {},
  minLevel: Level = (process.env['LOG_LEVEL'] as Level) || 'info',
): Logger {
  const threshold = LEVELS[minLevel] ?? LEVELS.info;

  function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
    if (LEVELS[level] < threshold) return;
    const record: Record<string, unknown> = {
      level,
      msg,
      time: new Date().toISOString(),
      ...bound,
      ...fields,
    };
    if (record['err'] !== undefined) record['err'] = serializeError(record['err']);
    const line = JSON.stringify(record);
    if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (extra) => createLogger({ ...bound, ...extra }, minLevel),
  };
}
