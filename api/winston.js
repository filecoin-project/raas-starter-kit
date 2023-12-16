const winston = require("winston")
require("dotenv").config()
const enumerateErrorFormat = winston.format((info) => {
    if (info instanceof Error) {
        Object.assign(info, { message: info.stack })
    }
    return info
})

const logger = winston.createLogger({
    level: process.env.config === "development" ? "debug" : "info",
    format: winston.format.combine(
        enumerateErrorFormat(),
        process.env.config === "development"
            ? winston.format.colorize()
            : winston.format.uncolorize(),
        winston.format.splat(),
        winston.format.printf(
            ({ level, message }) =>
                `${level}: ${
                    typeof message === "object" ? JSON.stringify(message, null, 2) : message
                }`
        )
    ),
    transports: [
        new winston.transports.Console({
            stderrLevels: ["error"],
        }),
    ],
})

module.exports = logger
