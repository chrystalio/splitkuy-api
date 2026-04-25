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

// Normalize field name — accept both "image" (legacy) and "file" (current).
// Prefer "file" if both are present.
function normalizeReceiptUpload(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | Express.Multer.File[]
    | undefined;

  if (!files || Array.isArray(files)) {
    next();
    return;
  }

  const imageFile = (files as { image?: Express.Multer.File[] }).image?.[0];
  const fileFile = (files as { file?: Express.Multer.File[] }).file?.[0];
  const selectedFile = imageFile ?? fileFile;

  if (selectedFile) {
    req.file = selectedFile;
  }

  next();
}

router.post(
  "/parse-receipt",
  requireApiKey,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  normalizeReceiptUpload,
  parseReceiptHandler
);

export default router;
