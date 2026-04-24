import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import apiRouter from "./routes/api";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
app.use(cors({ origin: corsOrigin, methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "x-api-key"] }));
app.use(express.json({ limit: "16kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too Many Requests",
    message: "Rate limit exceeded. Try again later.",
    statusCode: 429,
  },
});
app.use("/api", apiLimiter);

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", apiRouter);

app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err.message?.includes("Invalid file type")) {
    res.status(400).json({ error: "Bad Request", message: "Only JPEG, PNG, and WebP images are accepted.", statusCode: 400 });
    return;
  }
  if (err.message?.includes("File too large")) {
    res.status(400).json({ error: "Bad Request", message: "File too large. Maximum size is 5MB.", statusCode: 400 });
    return;
  }
  console.error("[Unhandled Error]", err);
  res.status(500).json({ error: "Internal Server Error", message: "An unexpected error occurred.", statusCode: 500 });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not Found", message: "The requested endpoint does not exist.", statusCode: 404 });
});

const server = app.listen(PORT, () => {
  console.log(`SplitKuy API running on http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is not set. /api/parse-receipt will fail.");
  }
});

function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
