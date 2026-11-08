import { z } from "zod";

const databaseUrlSchema = z.url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol));
const originSchema = z.string().transform((value, context) =>
{
    try
    {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || value.includes("*")) throw new Error();
        return url.origin;
    }
    catch
    {
        context.addIssue({ code: "custom", message: "Expected an HTTP(S) origin" });
        return z.NEVER;
    }
});
const environmentSchema = z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().min(1).default("127.0.0.1"),
    DATABASE_URL: databaseUrlSchema,
    NODE_ENV: z.enum(["development", "test", "production"]),
    AUTH_JWT_SECRET: z.string().refine((value) => Buffer.byteLength(value, "utf8") >= 32),
    AUTH_JWT_ISSUER: z.string().min(1), AUTH_JWT_AUDIENCE: z.string().min(1),
    AUTH_ALLOWED_ORIGINS: z.string().transform((value) => value.split(",").map((origin) => origin.trim())).pipe(z.array(originSchema).min(1)),
    AUTH_COOKIE_SECURE: z.enum(["true", "false"]).transform((value) => value === "true"),
}).refine((value) => value.NODE_ENV !== "production" || value.AUTH_COOKIE_SECURE, { path: ["AUTH_COOKIE_SECURE"], message: "Production requires secure cookies" });

export function readEnvironment(environment: Record<string, string | undefined> = process.env)
{
    return environmentSchema.parse(environment);
}

export function readDatabaseUrl(environment: Record<string, string | undefined> = process.env): string
{
    return databaseUrlSchema.parse(environment.DATABASE_URL);
}
