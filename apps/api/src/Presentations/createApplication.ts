import { Elysia, type ElysiaAdapter } from "elysia";
import { healthResponseSchema } from "@workflow/contracts";

export function createApplication(adapter?: ElysiaAdapter)
{
    return new Elysia({ adapter })
        .onError(({ code, error, set }) =>
        {
            if (code === "NOT_FOUND")
            {
                set.status = 404;
                return { message: "Not found" };
            }
            if (code === "VALIDATION" || code === "PARSE")
            {
                set.status = 400;
                return { message: "Invalid request" };
            }
            console.error(error);
            set.status = 500;
            return { message: "Internal server error" };
        })
        .get("/health", () => ({ status: "ok" as const }), {
            response: healthResponseSchema,
        });
}
