import { z } from "zod";

const environmentSchema = z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().min(1).default("127.0.0.1"),
    DATABASE_URL: z.url().refine((value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol)),
});

export function readEnvironment(environment: Record<string, string | undefined> = process.env)
{
    return environmentSchema.parse(environment);
}
