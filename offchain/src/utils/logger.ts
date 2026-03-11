/**
 * Logger utility
 */
import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${message}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'oracle.log' })
  ]
});
