import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt } from '../crypto';

describe('Crypto Utilities', () => {
  const mockKey = '01234567890123456789012345678901'; // 32 chars for AES-256

  it('should encrypt and decrypt a string correctly', () => {
    const originalText = 'my secret api key';
    
    const encrypted = encrypt(originalText);
    expect(encrypted).not.toEqual(originalText);
    expect(encrypted).toContain(':'); // IV and auth tag are appended/prepended

    const decrypted = decrypt(encrypted);
    expect(decrypted).toEqual(originalText);
  });
});
