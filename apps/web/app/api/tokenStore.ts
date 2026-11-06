export interface IAccessToken
{
    token: string;
    generation: number;
}

let activeGeneration = 0;
let current: IAccessToken | null = null;
const listeners = new Set<() => void>();

export function currentGeneration(): number
{
 return activeGeneration;
}
export function readAccessToken(): IAccessToken | null
{
 return current;
}
export function subscribeInvalidation(listener: () => void): () => void
{
    listeners.add(listener);
    return () =>
{
 listeners.delete(listener);
};
}
export function writeAccessToken(token: string, generation: number): boolean
{
    if (generation !== activeGeneration) return false;
    current = { token, generation };
    return true;
}
export function endSession(generation = activeGeneration): boolean
{
    if (generation !== activeGeneration) return false;
    current = null;
    activeGeneration += 1;
    for (const listener of listeners) listener();
    return true;
}
export function beginSession(token: string): void
{
    endSession();
    writeAccessToken(token, activeGeneration);
}
