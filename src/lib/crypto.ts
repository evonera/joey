import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 44) { // 32 bytes base64 encoded is 44 chars
    // Throw in production, but allow app to start without it for dev (it will fail when used)
    if (process.env.NODE_ENV === "production") {
        throw new Error("ENCRYPTION_KEY must be a 32-byte base64 encoded string.");
    }
}

const ALGORITHM = 'aes-256-gcm';

export function encrypt(text: string): string {
    if (!ENCRYPTION_KEY) throw new Error("Missing ENCRYPTION_KEY");
    
    const iv = crypto.randomBytes(12);
    const key = Buffer.from(ENCRYPTION_KEY, 'base64');
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:authTag:encryptedText
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
    if (!ENCRYPTION_KEY) throw new Error("Missing ENCRYPTION_KEY");
    
    const parts = text.split(':');
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted text format");
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = Buffer.from(ENCRYPTION_KEY, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}
