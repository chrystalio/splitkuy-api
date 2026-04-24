import { z } from "zod";

export const ReceiptItemSchema = z.object({
  name: z.string(),
  quantity: z.number().min(0),
  price: z.number().min(0),
});

export const ApiFeeSchema = z.object({
  name: z.string(),
  amount: z.number().min(0),
  type: z.enum(["flat", "percentage"]),
});

export const ApiDiscountSchema = z.object({
  name: z.string(),
  amount: z.number().min(0),
  type: z.enum(["flat", "percentage"]),
  appliesTo: z.enum(["delivery", "subtotal"]),
});

export const ParsedReceiptSchema = z.object({
  items: z.array(ReceiptItemSchema),
  subtotal: z.number().min(0),
  tax: z.number().min(0),
  serviceCharge: z.number().min(0),
  discount: z.number().min(0),
  fees: z.array(ApiFeeSchema).default([]),
  discounts: z.array(ApiDiscountSchema).default([]),
  total: z.number().min(0),
  currency: z.string(),
});

export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;
export type ApiFee = z.infer<typeof ApiFeeSchema>;
export type ApiDiscount = z.infer<typeof ApiDiscountSchema>;
export type ParsedReceipt = z.infer<typeof ParsedReceiptSchema>;

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}
