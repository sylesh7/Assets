"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
/**
 * Logger utility
 */
const winston_1 = require("winston");
exports.logger = (0, winston_1.createLogger)({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.format.combine(winston_1.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.format.printf(({ timestamp, level, message }) => {
        return `${timestamp} ${message}`;
    })),
    transports: [
        new winston_1.transports.Console(),
        new winston_1.transports.File({ filename: 'oracle.log' })
    ]
});
