export type VideoKind = 'short' | 'long';

export const VIDEO_LIMITS = {
  short: { maxDurationMs: 90_000 },
  long: { maxDurationMs: 15 * 60_000 },
  maxUploadBytes: 200 * 1024 * 1024,
  segmentDurationMs: 4000,
} as const;

const ALLOWED_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/3gpp']);

export function validateUpload(input: { kind: VideoKind; durationMs: number; sizeBytes: number; mime: string }): string[] {
  const errors: string[] = [];
  if (!ALLOWED_MIME.has(input.mime)) errors.push('unsupported_type');
  if (!(input.sizeBytes > 0) || input.sizeBytes > VIDEO_LIMITS.maxUploadBytes) errors.push('too_large');
  if (!(input.durationMs > 0)) errors.push('empty');
  else if (input.durationMs > VIDEO_LIMITS[input.kind].maxDurationMs) errors.push('too_long');
  // A "long" video must be longer than a short one, otherwise it belongs in the short feed.
  else if (input.kind === 'long' && input.durationMs <= VIDEO_LIMITS.short.maxDurationMs) errors.push('not_long');
  return errors;
}
