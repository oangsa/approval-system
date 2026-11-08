import { isIP } from "node:net";

export function clientSource(request: Request): string | null
{
    const runtime = (request as Request & { runtime?: { node?: { req?: { socket?: { remoteAddress?: unknown } } } } }).runtime;
    const address = runtime?.node?.req?.socket?.remoteAddress;
    if (typeof address !== "string" || address.includes("%") || !isIP(address)) return null;
    if (isIP(address) === 4) return address;
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
    if (!mapped) return normalized;
    const high = Number.parseInt(mapped[1]!, 16);
    const low = Number.parseInt(mapped[2]!, 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}
