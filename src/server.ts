import dotenv from "dotenv";
import express, { Request, Response, NextFunction } from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
// import rateLimit from "express-rate-limit";
import { initSocketService } from "./services/socketService";
import logger from "./utils/logger";

// Import routes
import authRoutes from "./routes/authRoutes";
import documentRoutes from "./routes/documentRoutes";
import userRoutes from "./routes/userRoutes";

// Import middleware
import { errorHandler } from "./middleware/errorHandler";

// Connect to MongoDB
import connectDB from "./config/db";

dotenv.config();

const app = express();
const server = http.createServer(app);

const FRONTEND_URL: string =
  process.env.FRONTEND_URL || "http://localhost:5173";
const PORT: number = parseInt(process.env.PORT || "5000", 10);

// ✅ Enable trust proxy for Vercel
app.set("trust proxy", 1);

connectDB();
logger.info(`🚀 Server running on http://localhost:${PORT}`);
logger.info(`✅ WebSocket server running on ws://localhost:${PORT}`);
logger.info(`🌐 Allowed frontend origin: ${FRONTEND_URL}`);

// Middleware
app.use(express.json());
app.use(helmet());

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 1000, // Limit each IP to 100 requests per windowMs
//   message: "Too many requests, please try again later.",
// });

// app.use(limiter);

// CORS configuration
app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// Setup WebSocket with CORS
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
});

// Initialize socket service
initSocketService(io);

// ✅ Debugging WebSocket Connections
io.on("connection", (socket) => {
  logger.info(`🟢 WebSocket connected: ${socket.id}`);

  socket.on("disconnect", () => {
    logger.info(`🔴 WebSocket disconnected: ${socket.id}`);
  });
});

process.on("SIGINT", () => {
  logger.info("🛑 Server shutting down...");
  io.close(() => {
    logger.info("🟡 WebSocket server closed.");
    process.exit(0);
  });
});

// Root route for API health check
app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "API is running successfully!" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/users", userRoutes);

// Handle unknown routes
app.use((_req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Server is live at http://localhost:${PORT}`);
});
