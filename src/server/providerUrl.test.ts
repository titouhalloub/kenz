import { describe, expect, it } from 'vitest';
import { chatCompletionsEndpoint, resolveOpenAIBaseUrl } from './providerUrl';

const openai = { defaultBaseUrl: 'https://api.openai.com/v1' };
const custom = { defaultBaseUrl: 'http://localhost:11434/v1' };

describe('resolveOpenAIBaseUrl — preset providers', () => {
  it('returns the official URL when none is requested', () => {
    expect(resolveOpenAIBaseUrl('openai', openai, undefined, true)).toBe(openai.defaultBaseUrl);
    expect(resolveOpenAIBaseUrl('openai', openai, '   ', true)).toBe(openai.defaultBaseUrl);
  });

  it('accepts the official URL, with or without a trailing slash', () => {
    expect(resolveOpenAIBaseUrl('openai', openai, 'https://api.openai.com/v1/', true)).toBe(openai.defaultBaseUrl);
  });

  it.each([
    'https://evil.example.com/v1',
    'https://api.openai.com.evil.example.com/v1',
    'http://api.openai.com/v1',
    'https://api.openai.com/other',
    'https://user:pass@api.openai.com/v1',
    'https://api.openai.com/v1?x=1',
    'https://api.openai.com/v1#frag',
    'http://169.254.169.254/latest/meta-data',
    'http://localhost:11434/v1',
    'not a url',
  ])('rejects %s', (requested) => {
    expect(resolveOpenAIBaseUrl('openai', openai, requested, true)).toBeNull();
  });
});

describe('resolveOpenAIBaseUrl — custom provider', () => {
  it('is always rejected in production', () => {
    expect(resolveOpenAIBaseUrl('custom', custom, undefined, true)).toBeNull();
    expect(resolveOpenAIBaseUrl('custom', custom, 'http://localhost:11434/v1', true)).toBeNull();
  });

  it('allows loopback http in development', () => {
    expect(resolveOpenAIBaseUrl('custom', custom, undefined, false)).toBe('http://localhost:11434/v1');
    expect(resolveOpenAIBaseUrl('custom', custom, 'http://127.0.0.1:8080/v1/', false)).toBe('http://127.0.0.1:8080/v1');
  });

  it.each([
    'https://localhost:11434/v1',
    'http://10.0.0.5/v1',
    'http://169.254.169.254/',
    'http://example.com/v1',
    'http://localhost:11434/v1?token=1',
    'http://user@localhost:11434/v1',
  ])('rejects %s even in development', (requested) => {
    expect(resolveOpenAIBaseUrl('custom', custom, requested, false)).toBeNull();
  });
});

describe('chatCompletionsEndpoint', () => {
  it('appends the path once', () => {
    expect(chatCompletionsEndpoint('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions');
    expect(chatCompletionsEndpoint('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions');
    expect(chatCompletionsEndpoint('https://x.test/v1/chat/completions')).toBe('https://x.test/v1/chat/completions');
  });
});
