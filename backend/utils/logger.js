/**
 * Winston 日志工具模块
 * 提供结构化日志输出，包括控制台和文件日志
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保日志目录存在
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 获取今天的日志文件名
const getTodayLogFile = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `app-${year}-${month}-${day}.log`;
};

// 自定义日志格式
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
        let log = `${timestamp} [${module || level.toUpperCase()}] ${message}`;

        // 处理 meta 对象（结构化日志参数）
        const metaKeys = Object.keys(meta).filter(k => k !== 'stack');
        if (metaKeys.length > 0) {
            const metaObj = {};
            metaKeys.forEach(k => metaObj[k] = meta[k]);
            log += ' ' + JSON.stringify(metaObj);
        }

        // 添加 stack 信息
        if (meta.stack) {
            log += `\n  Stack: ${meta.stack}`;
        }

        return log;
    })
);

// 创建带模块标签的logger函数
export function createModuleLogger(moduleName) {
    return {
        info: (message, meta) => logger.info(message, { module: moduleName, ...meta }),
        warn: (message, meta) => logger.warn(message, { module: moduleName, ...meta }),
        error: (message, meta) => logger.error(message, { module: moduleName, ...meta }),
        debug: (message, meta) => logger.debug(message, { module: moduleName, ...meta })
    };
}

// 创建 logger 实例
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    transports: [
        // 控制台输出 - 不使用 colorize() 以避免与 PM2 兼容性问题
        new winston.transports.Console({
            format: customFormat
        }),

        // 文件输出 - 每天一个日志文件
        new winston.transports.File({
            filename: path.join(logDir, getTodayLogFile()),
            maxsize: 10 * 1024 * 1024,  // 10MB
            maxFiles: 7
        }),

        // 错误日志单独文件
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,   // 5MB
            maxFiles: 3
        })
    ]
});

// 启动时记录日志
logger.info('='.repeat(50));
logger.info('厦门非遗展示应用启动');
logger.info(`日志目录: ${logDir}`);
logger.info(`日志级别: ${logger.level}`);
logger.info('='.repeat(50));

export default logger;
