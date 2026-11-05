import { z } from "zod";

export const userRoleSchema = z.enum(["REQUESTER", "REVIEWER", "ADMINISTRATOR"]);
export const departmentSummarySchema = z.strictObject({
    id: z.uuid(), code: z.string().min(1), name: z.string().min(1), isActive: z.boolean(),
});
export const userSummarySchema = z.strictObject({
    id: z.uuid(), displayName: z.string().min(1), email: z.email().max(254),
    roles: z.array(userRoleSchema).min(1).refine((roles) => new Set(roles).size === roles.length),
    isActive: z.boolean(), department: departmentSummarySchema.nullable(),
});
export const loginRequestSchema = z.strictObject({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)), password: z.string().min(1).max(1024),
});
export const loginResponseSchema = z.strictObject({ accessToken: z.string().min(1), user: userSummarySchema });
export const refreshResponseSchema = z.strictObject({ accessToken: z.string().min(1) });
export const messageResponseSchema = z.strictObject({ message: z.string().min(1) });
export type UserRole = z.infer<typeof userRoleSchema>;
export type DepartmentSummary = z.infer<typeof departmentSummarySchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
