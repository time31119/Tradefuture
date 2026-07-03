import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// Validation schemas
export const schemas = {
  // Swap schemas
  swapExecute: z.object({
    fromToken: z.enum(['TFT', 'USDT']),
    toToken: z.enum(['TFT', 'USDT']),
    amount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid amount format'),
  }),
  addLiquidity: z.object({
    tftAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid TFT amount format'),
    usdtAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid USDT amount format'),
  }),
  removeLiquidity: z.object({
    lpAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid LP amount format'),
  }),
  
  // Node schemas
  acquireNode: z.object({
    method: z.enum(['burn', 'lp']),
    tftAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid TFT amount format'),
  }),
  withdrawLp: z.object({
    lpAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid LP amount format'),
  }),
  
  // Prediction schemas
  createPrediction: z.object({
    direction: z.enum(['up', 'down']),
    amount: z.string().regex(/^\d+(\.\d+)?$/, 'Invalid amount format'),
  }),
};

// Validation middleware
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

// Address validation helper
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Amount validation helper
export function isValidAmount(amount: string): boolean {
  return /^\d+(\.\d+)?$/.test(amount) && parseFloat(amount) > 0;
}
