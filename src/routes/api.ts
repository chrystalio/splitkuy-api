import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { parseReceiptHandler } from "../controllers/parse";

const router = Router();

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.API_KEY) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or missing API key.",
      statusCode: 401,
    });
    return;
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB — PDFs can be larger than images
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed."));
    }
  },
});

router.post("/parse-receipt", requireApiKey, upload.single("file"), parseReceiptHandler);

export default router;
