import { Request, Response } from "express";
import fileType from "file-type";
import { parseReceiptImage } from "../lib/gemini";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 30_000;

export async function parseReceiptHandler(
  req: Request,
  res: Response
): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: "Bad Request",
      message: "No image file provided. Send a file in the 'image' field.",
      statusCode: 400,
    });
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    res.status(400).json({
      error: "Bad Request",
      message: "File too large. Maximum size is 5MB.",
      statusCode: 400,
    });
    return;
  }

  const detected = await fileType.fromBuffer(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.includes(detected.mime)) {
    res.status(400).json({
      error: "Bad Request",
      message: "File content does not match allowed image types.",
      statusCode: 400,
    });
    return;
  }

  try {
    const base64Image = file.buffer.toString("base64");

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timed out")), GEMINI_TIMEOUT_MS)
    );

    const parsed = await Promise.race([
      parseReceiptImage(base64Image, detected.mime),
      timeoutPromise,
    ]);

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error("[parseReceipt] Gemini API error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to parse receipt image. Please try again.",
      statusCode: 500,
    });
  }
}
