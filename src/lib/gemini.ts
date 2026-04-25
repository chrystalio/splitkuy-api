import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { ParsedReceipt, ParsedReceiptSchema } from "../types/api";
import { GEMINI_SYSTEM_PROMPT } from "./prompt";

export async function parseReceiptImage(
  base64Image: string,
  mimeType: string,
  options?: { signal?: AbortSignal }
): Promise<ParsedReceipt> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: GEMINI_SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const result = await model.generateContent(
    [{ inlineData: { data: base64Image, mimeType } }],
    { signal: options?.signal }
  );

  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[gemini] Failed to parse response:", text);
    throw new Error("The AI returned an unexpected format.");
  }

  return ParsedReceiptSchema.parse(parsed);
}
