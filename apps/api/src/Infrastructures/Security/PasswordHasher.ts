import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { IPasswordHasher } from "../../Domains/Identity/Ports";

const derive = promisify(argon2);
const prefix = "argon2id$v=1$m=19456,t=2,p=1";
export class PasswordHasher implements IPasswordHasher
{
    private async Derive(password: string, salt: Buffer): Promise<Buffer>
    {
        return derive("argon2id", { message: password, nonce: salt, memory: 19456, passes: 2, parallelism: 1, tagLength: 32 });
    }
    public async Hash(password: string): Promise<string>
    {
        if (!password || password.length > 1024) throw new Error("Invalid password length");
        const salt = randomBytes(16);
        const tag = await this.Derive(password, salt);
        return `${prefix}$${salt.toString("base64")}$${tag.toString("base64")}`;
    }
    public async Verify(password: string, record: string): Promise<boolean>
    {
        if (!password || password.length > 1024 || record.length > 256) return false;
        const parts = record.split("$");
        if (parts.length !== 5 || parts.slice(0, 3).join("$") !== prefix) return false;
        const saltText = parts[3]; const tagText = parts[4];
        if (!saltText || !tagText) return false;
        const salt = Buffer.from(saltText, "base64"); const tag = Buffer.from(tagText, "base64");
        if (salt.length !== 16 || tag.length !== 32 || salt.toString("base64") !== saltText || tag.toString("base64") !== tagText) return false;
        return timingSafeEqual(await this.Derive(password, salt), tag);
    }
}
