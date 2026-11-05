import { spawn } from "node:child_process";

const children = ["@workflow/web", "@workflow/api"].map((workspace) =>
{
    return spawn("npm", ["run", "dev", "--workspace", workspace], {
        stdio: "inherit",
        detached: true,
    });
});
let stopping = false;

function stop(exitCode: number): void
{
    if (stopping)
    {
        return;
    }
    stopping = true;
    process.exitCode = exitCode;
    for (const child of children)
    {
        if (child.pid !== undefined)
        {
            try
            {
                process.kill(-child.pid, "SIGTERM");
            }
            catch (error)
            {
                if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH")
                {
                    throw error;
                }
            }
        }
    }
}

for (const child of children)
{
    child.once("error", (error) =>
    {
        console.error(error);
        stop(1);
    });
    child.once("exit", (code) => stop(code ?? 1));
}
process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
