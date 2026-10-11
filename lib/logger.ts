type Level = 'debug' | 'info' | 'warn' | 'error'
type Context = Record<string, unknown>

/**
 * Structured JSON logs (one line per event) so Vercel/Datadog/CloudWatch can index fields.
 * Swap `emit` for a Sentry/Datadog client to forward errors to monitoring.
 */
function emit(level: Level, message: string, context: Context = {}): void {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...context })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, context?: Context): void => {
    if (process.env.LOG_LEVEL === 'debug') emit('debug', message, context)
  },
  info: (message: string, context?: Context): void => emit('info', message, context),
  warn: (message: string, context?: Context): void => emit('warn', message, context),
  error: (message: string, context?: Context): void => emit('error', message, context)
}

export function logError(error: unknown, context: Context = {}): void {
  const err = error instanceof Error ? error : new Error(String(error))
  emit('error', err.message, { ...context, name: err.name, stack: err.stack })
}
