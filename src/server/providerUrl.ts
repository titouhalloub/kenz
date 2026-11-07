/**
 * SSRF-safe provider URL resolution for the AI gateway.
 * Kept free of Express/Supabase imports so it can be unit tested.
 */

export interface ProviderPreset {
  defaultBaseUrl: string;
}

export function trimTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}

/**
 * Returns the base URL to call for an OpenAI-compatible provider, or null when
 * the requested URL is not allowed.
 *
 * - `custom` endpoints are allowed only outside production and only on loopback
 *   over plain http (local model servers).
 * - Preset providers are pinned to their official origin and path. A client may
 *   repeat the official URL but can never redirect the server elsewhere.
 */
export function resolveOpenAIBaseUrl(
  provider: string,
  preset: ProviderPreset,
  requestedBaseUrl?: string,
  isProduction: boolean = process.env.NODE_ENV === 'production',
): string | null {
  if (provider === 'custom') {
    if (isProduction) return null;
    try {
      const url = new URL(requestedBaseUrl?.trim() || preset.defaultBaseUrl);
      const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
      if (
        url.protocol !== 'http:' ||
        !localHosts.has(url.hostname) ||
        url.username || url.password || url.search || url.hash
      ) return null;
      return trimTrailingSlashes(url.toString());
    } catch { return null; }
  }

  try {
    const expected = new URL(preset.defaultBaseUrl);
    if (requestedBaseUrl?.trim()) {
      const requested = new URL(requestedBaseUrl.trim());
      const expectedPath = trimTrailingSlashes(expected.pathname);
      const requestedPath = trimTrailingSlashes(requested.pathname);
      if (
        requested.origin !== expected.origin ||
        requestedPath !== expectedPath ||
        requested.username || requested.password || requested.search || requested.hash
      ) return null;
    }
    return preset.defaultBaseUrl;
  } catch { return null; }
}

/** Appends /chat/completions unless the base already ends with it. */
export function chatCompletionsEndpoint(baseUrl: string): string {
  const base = trimTrailingSlashes(baseUrl);
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}
