import { Request, Response } from "express";
import { PDFDocument } from "pdf-lib";
import { parseReceiptImage } from "../lib/gemini";
import type { ParsedReceipt, ReceiptItem, ApiFee, ApiDiscount } from "../types/api";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PDF_MIME_TYPE = "application/pdf";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_PAGES = 20; // Safety limit to prevent memory exhaustion
const GEMINI_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// PDF page extraction
// Gemini 2.5 Flash natively supports PDF input (application/pdf).
// We split the PDF into per-page documents using pdf-lib and send each
// page bytes directly to Gemini — no image rendering library needed.
// ---------------------------------------------------------------------------
async function extractPdfPages(
  pdfBytes: Uint8Array
): Promise<{ base64: string; mimeType: string }[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pageCount = pdfDoc.getPageCount();

  if (pageCount > MAX_PDF_PAGES) {
    throw new Error(
      `PDF has ${pageCount} pages, maximum allowed is ${MAX_PDF_PAGES}.`
    );
  }

  const pages: { base64: string; mimeType: string }[] = [];

  for (let i = 0; i < pageCount; i++) {
    // Create a new PDF containing only this single page
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);
    const pageBytes = await newPdf.save();

    pages.push({
      base64: Buffer.from(pageBytes).toString("base64"),
      mimeType: PDF_MIME_TYPE,
    });
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Merge results from multiple pages
// Items are concatenated; numeric totals are summed; fees/discounts are
// deduplicated by name (case-insensitive).
// ---------------------------------------------------------------------------
function mergeReceiptResults(results: ParsedReceipt[]): ParsedReceipt {
  if (results.length === 0) {
    throw new Error("No receipt data to merge");
  }
  if (results.length === 1) {
    return results[0];
  }

  const allItems: ReceiptItem[] = results.flatMap((r) => r.items);
  const subtotal = results.reduce((sum, r) => sum + r.subtotal, 0);
  const tax = results.reduce((sum, r) => sum + r.tax, 0);
  const serviceCharge = results.reduce((sum, r) => sum + r.serviceCharge, 0);
  const discount = results.reduce((sum, r) => sum + r.discount, 0);
  const total = results.reduce((sum, r) => sum + r.total, 0);
  const currency = results[results.length - 1].currency;

  const dedupeByName = <T extends { name: string }>(items: T[]): T[] => {
    const seen = new Map<string, T>();
    for (const item of items) {
      const key = item.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, item);
    }
    return Array.from(seen.values());
  };

  const fees: ApiFee[] = dedupeByName(results.flatMap((r) => r.fees));
  const discounts: ApiDiscount[] = dedupeByName(
    results.flatMap((r) => r.discounts)
  );

  return {
    items: allItems,
    subtotal,
    tax,
    serviceCharge,
    discount,
    fees,
    discounts,
    total,
    currency,
  };
}

// ---------------------------------------------------------------------------
// Core parse — dispatches to image or PDF pipeline
// ---------------------------------------------------------------------------
async function parseFile(
  buffer: Buffer,
  mimeType: string
): Promise<ParsedReceipt> {
  if (mimeType === PDF_MIME_TYPE) {
    const pages = await extractPdfPages(new Uint8Array(buffer));
    const results: ParsedReceipt[] = [];

    for (let i = 0; i < pages.length; i++) {
      const pageResult = await Promise.race([
        parseReceiptImage(pages[i].base64, pages[i].mimeType),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Page ${i + 1} of ${pages.length} timed out after ${GEMINI_TIMEOUT_MS}ms`
                )
              ),
            GEMINI_TIMEOUT_MS
          )
        ),
      ]);
      results.push(pageResult);
    }

    return mergeReceiptResults(results);
  }

  // Image: process directly
  const base64Image = buffer.toString("base64");
  return Promise.race([
    parseReceiptImage(base64Image, mimeType),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Gemini request timed out")),
        GEMINI_TIMEOUT_MS
      )
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Express handler
// ---------------------------------------------------------------------------
export async function parseReceiptHandler(
  req: Request,
  res: Response
): Promise<void> {
  const file = req.file;

  // Security: require file
  if (!file) {
    res.status(400).json({
      error: "Bad Request",
      message: "No file provided. Send a file in the 'file' field.",
      statusCode: 400,
    });
    return;
  }

  // Security: file size limit
  if (file.size > MAX_FILE_SIZE) {
    res.status(400).json({
      error: "Bad Request",
      message: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      statusCode: 400,
    });
    return;
  }

  // Security: validate MIME type via magic bytes (file-type)
  const { fromBuffer } = await import("file-type");
  const detected = await fromBuffer(file.buffer);

  const allowedTypes = [...ALLOWED_IMAGE_TYPES, PDF_MIME_TYPE];
  if (!detected || !allowedTypes.includes(detected.mime)) {
    res.status(400).json({
      error: "Bad Request",
      message:
        "Unsupported file type. Only JPEG, PNG, WebP, and PDF are accepted.",
      statusCode: 400,
    });
    return;
  }

  try {
    const parsed = await parseFile(file.buffer, detected.mime);
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error("[parseReceipt] Error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to parse receipt.";

    const userError =
      message.includes("timed out") ||
      message.includes("out of range") ||
      message.includes("maximum") ||
      message.includes("Unsupported") ||
      message.includes("unexpected");

    res.status(userError ? 400 : 500).json({
      error: userError ? "Bad Request" : "Internal Server Error",
      message,
      statusCode: userError ? 400 : 500,
    });
  }
}
