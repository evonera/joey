import { describe, expect, it } from 'vitest';
import { resolveAuthBaseURL } from '../auth-base-url';

describe('Deployment auth origin', () => {
  it('requires a configured production origin and permits build discovery', () => {
    expect(() => resolveAuthBaseURL({ NODE_ENV: 'production' })).toThrow('public origin');
    expect(resolveAuthBaseURL({ NODE_ENV: 'production' }, true)).toBe('http://localhost:3000');
    expect(resolveAuthBaseURL({ NODE_ENV: 'development' })).toBe('http://localhost:3000');
  });
  it('normalizes matching origins while preserving a custom self-hosted port', () => {
    expect(resolveAuthBaseURL({ BETTER_AUTH_URL: 'http://localhost:3180/', NEXT_PUBLIC_APP_URL: 'http://localhost:3180' })).toBe('http://localhost:3180');
    expect(resolveAuthBaseURL({ BETTER_AUTH_URL: 'https://selfhost.example/', NEXT_PUBLIC_APP_URL: 'https://selfhost.example:443' })).toBe('https://selfhost.example');
  });
  it('rejects a browser/server origin mismatch, including different ports', () => {
    expect(() => resolveAuthBaseURL({ BETTER_AUTH_URL: 'https://auth.example', NEXT_PUBLIC_APP_URL: 'https://app.example' })).toThrow('same origin');
    expect(() => resolveAuthBaseURL({ BETTER_AUTH_URL: 'http://localhost:3000', NEXT_PUBLIC_APP_URL: 'http://localhost:3180' })).toThrow('same origin');
  });
  it.each(['not-a-url', 'ftp://example.com', 'https://user:password@example.com', 'https://example.com/api/auth', 'https://example.com?redirect=elsewhere', 'https://example.com/#fragment'])('rejects invalid configured origin %s even during a build', value => {
    expect(() => resolveAuthBaseURL({ BETTER_AUTH_URL: value }, true)).toThrow('origin');
    expect(() => resolveAuthBaseURL({ NEXT_PUBLIC_APP_URL: value }, true)).toThrow('origin');
  });
  it('selects the active preview host rather than the production host', () => {
    expect(resolveAuthBaseURL({ NODE_ENV: 'production', VERCEL_URL: 'preview.example', VERCEL_PROJECT_PRODUCTION_URL: 'production.example' })).toBe('https://preview.example');
    expect(resolveAuthBaseURL({ NODE_ENV: 'production', DEPLOY_PRIME_URL: 'https://preview.example', URL: 'https://production.example' })).toBe('https://preview.example');
  });
  it('prefers explicit configuration to platform hostnames', () => {
    expect(resolveAuthBaseURL({ NODE_ENV: 'production', BETTER_AUTH_URL: 'https://selfhost.example', VERCEL_URL: 'generated.example' })).toBe('https://selfhost.example');
  });
});
