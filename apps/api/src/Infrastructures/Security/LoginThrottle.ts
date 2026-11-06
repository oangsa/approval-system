import type { IClock, ILoginThrottle } from "../../Domains/Identity/Ports";
const windowMs = 15 * 60 * 1000;
export class LoginThrottle implements ILoginThrottle
{
    // ponytail: process-local limits do not aggregate across instances; use a shared store when scaling out.
    private readonly entries = new Map<string, number[]>();
    constructor(private readonly clock: IClock, private readonly capacity = 10000)
    {}
    private Keys(ip: string | null, email: string): string[]
    {
        const identifier = email.trim().toLowerCase();
        return ip ? [`source:${ip}`, `pair:${JSON.stringify([ip, identifier])}`] : [`identifier:${identifier}`];
    }
    private Clean(): void
    {
        const cutoff = this.clock.Now().getTime() - windowMs;
        for (const [key, values] of this.entries)
        {
            const live = values.filter((value) => value > cutoff);
            if (live.length) this.entries.set(key, live); else this.entries.delete(key);
        }
    }
    public Check(ip: string | null, email: string): boolean
    {
        this.Clean();
        const keys = this.Keys(ip, email);
        const needed = keys.filter((key) => !this.entries.has(key)).length;
        return this.entries.size + needed <= this.capacity && keys.every((key, index) => (this.entries.get(key)?.length ?? 0) < (ip && index === 0 ? 30 : 5));
    }
    public RecordFailure(ip: string | null, email: string): void
    {
        if (!this.Check(ip, email)) return;
        for (const key of this.Keys(ip, email)) this.entries.set(key, [...(this.entries.get(key) ?? []), this.clock.Now().getTime()]);
    }
    public RecordSuccess(ip: string | null, email: string): void
    {
        const keys = this.Keys(ip, email);
        this.entries.delete(keys[keys.length - 1]!);
    }
}
