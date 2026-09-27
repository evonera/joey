import crypto from "crypto";

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
    const raw = process.env.ENCRYPTION_KEY;
    const key = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
    if (!raw || key.length !== 32 || key.toString("base64") !== raw) {
        throw new Error(
            "ENCRYPTION_KEY must be the canonical base64 encoding of exactly 32 bytes. " +
            "Set it in your environment to enable key encryption.",
        );
    }
    return key;
}

export function encrypt(text: string, context: string): string {
    if (!context) throw new Error("Encryption context is required.");
    const key = getEncryptionKey();

    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `v2:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string, context: string): string {
    if (!context) throw new Error("Decryption context is required.");
    const key = getEncryptionKey();

    const parts = text.split(':');
    if (parts[0] === "v2") {
        if (parts.length !== 4) throw new Error("Invalid encrypted text format");
        const [, ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        if (iv.length !== 12 || authTag.length !== 16 || !/^(?:[\da-f]{2})*$/i.test(encryptedHex)) {
            throw new Error("Invalid encrypted text format");
        }
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        decipher.setAAD(Buffer.from(context, "utf8"));
        return decipher.update(encryptedHex, "hex", "utf8") + decipher.final("utf8");
    }
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted text format");
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    if (iv.length !== 12 || authTag.length !== 16 || !/^(?:[\da-f]{2})*$/i.test(encryptedHex)) {
        throw new Error("Invalid encrypted text format");
    }

    try {
        const contextual = crypto.createDecipheriv(ALGORITHM, key, iv);
        contextual.setAuthTag(authTag);
        contextual.setAAD(Buffer.from(context, "utf8"));
        return contextual.update(encryptedHex, "hex", "utf8") + contextual.final("utf8");
    } catch (contextError) {
        if (process.env.ALLOW_LEGACY_UNBOUND_SECRETS === "false") throw contextError;
    }

    const legacy = crypto.createDecipheriv(ALGORITHM, key, iv);
    legacy.setAuthTag(authTag);
    return legacy.update(encryptedHex, "hex", "utf8") + legacy.final("utf8");
}

/**
 * Safely masks a sensitive API key, showing only a small prefix and suffix.
 * Prevents raw secrets from being displayed in UI or returned in client payloads.
 */
export function maskKey(key: string): string {
    if (!key || key.length < 8) return "••••••••";
    const prefixLen = key.length > 20 ? 6 : 3;
    const suffixLen = 4;
    return `${key.slice(0, prefixLen)}••••••••${key.slice(-suffixLen)}`;
}
