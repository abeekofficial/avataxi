// utils/logger.js
const winston = require("winston");
require("winston-daily-rotate-file");
const config = require("../config");

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
});

const transports = [
  new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: "HH:mm:ss" }),
      errors({ stack: true }),
      logFormat,
    ),
    silent: false,
  }),
];

// Production da fayllarga yozish
if (config.isProd) {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "14d",
      format: combine(timestamp(), errors({ stack: true }), logFormat),
    }),
    new winston.transports.DailyRotateFile({
      filename: "logs/combined-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "7d",
      format: combine(timestamp(), errors({ stack: true }), logFormat),
    }),
  );
}

const logger = winston.createLogger({
  level: config.isDev ? "debug" : "info",
  format: combine(timestamp(), errors({ stack: true })),
  transports,
  exitOnError: false,
});

// Qisqa alias metodlar
logger.success = (msg, meta) => logger.info(`✅ ${msg}`, meta);
logger.fail    = (msg, meta) => logger.error(`❌ ${msg}`, meta);

module.exports = logger;
