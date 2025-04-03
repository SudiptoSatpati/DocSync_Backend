import Redis from "ioredis";
import logger from "../utils/logger";

// Creating Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  // Reconnect strategy
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

// Log Redis connection events
redis.on("connect", () => {
  logger.info("✅ Connected to Redis");
});

redis.on("error", (err) => {
  logger.error("❌ Redis connection error:", err);
});

export default redis;
