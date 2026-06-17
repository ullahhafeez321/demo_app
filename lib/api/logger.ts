type LogLevel = "info" | "warn" | "error";

interface LogContext {
  route: string;
  action: string;
  projectId?: string;
  documentId?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

export function createRequestLogger(route: string) {
  const startedAt = Date.now();

  return {
    info(action: string, context: Omit<LogContext, "route" | "action"> = {}) {
      writeLog("info", { route, action, durationMs: Date.now() - startedAt, ...context });
    },
    warn(action: string, context: Omit<LogContext, "route" | "action"> = {}) {
      writeLog("warn", { route, action, durationMs: Date.now() - startedAt, ...context });
    },
    error(action: string, error: unknown, context: Omit<LogContext, "route" | "action"> = {}) {
      writeLog("error", {
        route,
        action,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown error",
        ...context,
      });
    },
  };
}

function writeLog(level: LogLevel, context: LogContext) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}
