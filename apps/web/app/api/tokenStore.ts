export interface IAccessToken
{
    token: string;
    /** Identity generation that issued the token; bumped on logout and account switch. */
    generation: number;
}

let activeGeneration = 0;
let current: IAccessToken | null = null;

export function currentGeneration(): number
{
    return activeGeneration;
}

/** Access tokens live in module memory only — never localStorage, sessionStorage, or a cookie. */
export function readAccessToken(): IAccessToken | null
{
    return current;
}

/** Installs a token only for the still-current identity generation; stale installs are refused. */
export function writeAccessToken(token: string, generation: number): boolean
{
    if (generation !== activeGeneration) return false;
    current = { token, generation };
    return true;
}

/** Starts a session for the current identity generation (successful login). */
export function beginSession(token: string): void
{
    current = { token, generation: activeGeneration };
}

/** Ends the local session: drops the token and advances the generation, invalidating in-flight work. */
export function endSession(): void
{
    current = null;
    activeGeneration += 1;
}