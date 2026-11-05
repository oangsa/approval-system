export async function http(path: string, options: RequestInit = {}): Promise<unknown>
{
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || "/api"}${path}`, {
        ...options,
        credentials: "include",
    });
    if (!response.ok)
    {
        throw new Error(`Request failed (${response.status})`);
    }
    if (response.status === 204)
    {
        return undefined;
    }
    return response.json();
}
