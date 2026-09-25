/**
 * Minimal structured logging. Output goes to the host's logs (Vercel
 * captures stdout/stderr). Swap the body of `logError` for an error
 * tracker (e.g. Sentry) when one is set up — see WORK_QUEUE.md.
 */
export function logError(context: string, error: unknown, extra?: Record<string, unknown>) {
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error && typeof error === "object"
        ? // Supabase errors are plain objects ({ message, code, details, hint })
          { message: String((error as { message?: unknown }).message ?? JSON.stringify(error)), error }
        : { message: String(error) };
  console.error(JSON.stringify({ level: "error", context, ...err, ...extra, at: new Date().toISOString() }));
}

export function logInfo(context: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", context, ...extra, at: new Date().toISOString() }));
}
