import { type Logger, createLogger, format, transports } from "winston";
import type TransportStream from "winston-transport";

export const orderedJsonFormat = format.printf((info) => {
  const { timestamp, level, message, module, component, ...rest } = info;

  const ordered: Record<string, unknown> = {};

  if (timestamp) ordered.timestamp = timestamp;
  if (level) ordered.level = level;
  if (module) ordered.module = module;
  if (component) ordered.component = component;
  if (message) ordered.message = message;

  const sortedKeys = Object.keys(rest).sort();
  for (const key of sortedKeys) {
    ordered[key] = rest[key];
  }

  return JSON.stringify(ordered);
});

export function createOrderedLogger(
  consoleLevel: string = "info",
  fileLevel?: string,
  filePath?: string,
): Logger {
  const loggerTransports: TransportStream[] = [
    new transports.Console({
      level: consoleLevel,
    }),
  ];

  if (fileLevel && filePath) {
    loggerTransports.push(
      new transports.File({
        filename: filePath,
        level: fileLevel,
      }),
    );
  }

  return createLogger({
    level: "silly", // Set to lowest level, let transports filter
    format: format.combine(format.timestamp(), orderedJsonFormat),
    transports: loggerTransports,
  });
}
