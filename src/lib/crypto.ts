import crypto from "crypto";

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
    const raw = process.env.ENCRYPTION_KEY;
    // 32 bytes base64 encoded is 44 characters.
    if (!raw || raw.length !== 44) {
        throw new Error(
            "ENCRYPTION_KEY must be a 32-byte base64 encoded string (44 chars). " +
            "Set it in your environment to enable key encryption.",
        );
    }
    return Buffer.from(raw, 'base64');
}

export function encrypt(text: string, context?: string): string {
    const key = getEncryptionKey();

    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    if (context) {
        cipher.setAAD(Buffer.from(context, 'utf8'));
    }
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:authTag:encryptedText
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string, context?: string): string {
    const key = getEncryptionKey();
    
    const parts = text.split(':');
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted text format");
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // If context is provided, try context-bound decryption first
    if (context) {
        try {
            const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            decipher.setAAD(Buffer.from(context, 'utf8'));
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch {
            // Fall back to without context in case data was encrypted prior to context binding
        }
    }
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
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

