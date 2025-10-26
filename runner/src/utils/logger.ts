import { createLogger, format, transports, Logger } from 'winston';

export const orderedJsonFormat = format.printf((info) => {
  const { timestamp, level, message, module, ...rest } = info;

  const ordered: Record<string, unknown> = {};

  if (timestamp) ordered.timestamp = timestamp;
  if (level) ordered.level = level;
  if (module) ordered.module = module;
  if (message) ordered.message = message;

  const sortedKeys = Object.keys(rest).sort();
  for (const key of sortedKeys) {
    ordered[key] = rest[key];
  }

  return JSON.stringify(ordered);
});

export function createOrderedLogger(level: string = 'info'): Logger {
  return createLogger({
    level,
    format: format.combine(
      format.timestamp(),
      orderedJsonFormat
    ),
    transports: [
      new transports.Console()
    ]
  });
}