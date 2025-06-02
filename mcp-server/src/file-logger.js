import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Log file path
const logFile = path.join(logsDir, 'mcp-server.log');

// Ensure log file exists
if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '');
}

/**
 * Write a log entry to file
 */
function writeLog(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        args: args.length > 0 ? args : undefined
    };
    
    try {
        // Append to log file
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
        // Fallback to console if file writing fails
        console.error('Failed to write to log file:', error);
    }
}

/**
 * Create a file logger that writes to both file and wraps the original logger
 */
export function createFileLogger(originalLogger) {
    return {
        debug: (message, ...args) => {
            writeLog('debug', message, ...args);
            if (originalLogger?.debug) originalLogger.debug(message, ...args);
        },
        info: (message, ...args) => {
            writeLog('info', message, ...args);
            if (originalLogger?.info) originalLogger.info(message, ...args);
        },
        warn: (message, ...args) => {
            writeLog('warn', message, ...args);
            if (originalLogger?.warn) originalLogger.warn(message, ...args);
        },
        error: (message, ...args) => {
            writeLog('error', message, ...args);
            if (originalLogger?.error) originalLogger.error(message, ...args);
        },
        success: (message, ...args) => {
            writeLog('success', message, ...args);
            if (originalLogger?.success) originalLogger.success(message, ...args);
        }
    };
}

/**
 * Clear the log file
 */
export function clearLogFile() {
    try {
        fs.writeFileSync(logFile, '');
    } catch (error) {
        console.error('Failed to clear log file:', error);
    }
}

export { logFile };