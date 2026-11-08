import { randomBytes } from "node:crypto";
import { Login } from "../Applications/Identity/Login";
import { RefreshSession } from "../Applications/Identity/RefreshSession";
import { Authenticate } from "../Applications/Identity/Authenticate";
import { GetCurrentUser } from "../Applications/Identity/GetCurrentUser";
import { Logout } from "../Applications/Identity/Logout";
import { LogoutAll } from "../Applications/Identity/LogoutAll";
import type { IClock } from "../Domains/Identity/Ports";
import type { readEnvironment } from "../Infrastructures/Configuration/environment";
import type { Database } from "../Infrastructures/Database/Database";
import { IdentityRepository, IdentityUnitOfWork } from "../Infrastructures/Database/Repositories/IdentityRepository";
import { PasswordHasher } from "../Infrastructures/Security/PasswordHasher";
import { TokenProvider } from "../Infrastructures/Security/TokenProvider";
import { RefreshTokenProvider } from "../Infrastructures/Security/RefreshTokenProvider";
import { LoginThrottle } from "../Infrastructures/Security/LoginThrottle";

export interface IIdentityHttpDependencies
{
    login: Login;
    refresh: RefreshSession;
    authenticate: Authenticate;
    getCurrentUser: GetCurrentUser;
    logout: Logout;
    logoutAll: LogoutAll;
    allowedOrigins: readonly string[];
    cookieSecure: boolean;
    clock: IClock;
}

export async function createIdentityComposition(environment: ReturnType<typeof readEnvironment>, database: Database): Promise<IIdentityHttpDependencies>
{
    const clock: IClock = { Now: () => new Date() };
    const repository = new IdentityRepository(database.connection);
    const unit = new IdentityUnitOfWork(database.connection);
    const passwords = new PasswordHasher();
    const tokens = new TokenProvider(environment.AUTH_JWT_SECRET, clock, environment.AUTH_JWT_ISSUER, environment.AUTH_JWT_AUDIENCE);
    const refreshTokens = new RefreshTokenProvider();
    const dummyHash = await passwords.Hash(randomBytes(32).toString("base64url"));
    return {
        login: new Login(repository, unit, passwords, tokens, refreshTokens, new LoginThrottle(clock), clock, dummyHash),
        refresh: new RefreshSession(repository, unit, tokens, refreshTokens, clock),
        authenticate: new Authenticate(tokens, repository, clock),
        getCurrentUser: new GetCurrentUser(),
        logout: new Logout(repository, unit, refreshTokens, clock),
        logoutAll: new LogoutAll(unit, clock),
        allowedOrigins: environment.AUTH_ALLOWED_ORIGINS,
        cookieSecure: environment.AUTH_COOKIE_SECURE,
        clock,
    };
}
