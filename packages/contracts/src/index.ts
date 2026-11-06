import { z } from "zod";

// Infrastructure-only contract used to verify workspace integration.
export const healthResponseSchema = z.object({ status: z.literal("ok") });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from "./auth";
export * from "./error";
export * from "./requests";
export * from "./requestSearch";
