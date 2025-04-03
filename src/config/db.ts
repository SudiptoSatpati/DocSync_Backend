import mongoose from "mongoose";
import logger from "../utils/logger";

const MAX_RETRIES = 5;
const RETRY_INTERVAL = 5000;

const connectDB = async (): Promise<void> => {
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const conn = await mongoose.connect(
        process.env.MONGO_URI ||
          "mongodb://localhost:27017/collaborative-doc-editor"
      );
      logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
      return; // Exit loop on success
    } catch (error) {
      logger.error(`❌ MongoDB Connection Failed: ${(error as Error).message}`);
      retries++;
      logger.warn(
        `🔁 Retrying in ${
          RETRY_INTERVAL / 1000
        } seconds... (${retries}/${MAX_RETRIES})`
      );
      await new Promise((res) => setTimeout(res, RETRY_INTERVAL));
    }
  }
  logger.error("🚨 Maximum retries reached. Exiting process.");
  process.exit(1);
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("🛑 Closing MongoDB connection...");
  await mongoose.connection.close();
  process.exit(0);
});

export default connectDB;
