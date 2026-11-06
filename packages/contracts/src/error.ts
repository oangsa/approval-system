import { z } from "zod";

export const errorDetailSchema = z.strictObject({ field: z.string().min(1), code: z.string().min(1), message: z.string().min(1) });
export const errorResponseSchema = z.strictObject({
    statusCode: z.number().int().min(400).max(599), code: z.string().min(1), message: z.string().min(1),
    error: z.string().min(1), requestId: z.uuid(), details: z.array(errorDetailSchema).optional(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
