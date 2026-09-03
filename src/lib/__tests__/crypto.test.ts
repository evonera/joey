import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, maskKey } from '../crypto';

describe('Crypto Utilities', () => {
  it('should encrypt and decrypt a string correctly without context', () => {
    const originalText = 'my secret api key';
    
    const encrypted = encrypt(originalText);
    expect(encrypted).not.toEqual(originalText);
    expect(encrypted).toContain(':'); // IV and auth tag are appended/prepended

    const decrypted = decrypt(encrypted);
    expect(decrypted).toEqual(originalText);
  });

  it('should bind encryption to tenant context using AAD', () => {
    const originalText = 'sk-proj-testkey1234567890';
    const tenantId = 'tenant_alpha';

    const encrypted = encrypt(originalText, tenantId);
    expect(encrypted).not.toEqual(originalText);

    // Decrypting with the authentic tenant context succeeds
    const decrypted = decrypt(encrypted, tenantId);
    expect(decrypted).toEqual(originalText);

    // Decrypting with wrong context fails
    expect(() => decrypt(encrypted, 'tenant_attacker')).toThrow();

    // Decrypting context-bound ciphertext without providing context throws auth tag mismatch
    expect(() => decrypt(encrypted)).toThrow();

    // Decrypting legacy ciphertext (encrypted without context) while passing a tenantId gracefully falls back and succeeds
    const legacyEncrypted = encrypt(originalText);
    expect(decrypt(legacyEncrypted, tenantId)).toEqual(originalText);
  });

  it('should mask keys safely', () => {
    expect(maskKey('AIzaSyD-1234567890abcdefghijklmnopqrstuvwxyz')).toEqual('AIzaSy••••••••wxyz');
    expect(maskKey('sk-ant-api03-abcdef1234567890')).toEqual('sk-ant••••••••7890');
    expect(maskKey('short')).toEqual('••••••••');
  });
});

