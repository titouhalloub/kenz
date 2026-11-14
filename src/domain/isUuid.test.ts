import { describe, expect, it } from 'vitest';
import { isUuid } from './isUuid';

describe('isUuid', () => {
  it('accepts real Supabase user ids', () => {
    expect(isUuid('baeb59b8-d78a-42ef-a6ee-6ae923e41304')).toBe(true);
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
  });
  it('rejects local demo ids and malformed values', () => {
    for (const v of ['user_demo_01', 'user_ab12cd3', '', 'baeb59b8-d78a-42ef-a6ee6ae923e41304', 'baeb59b8-d78a-42ef-a6ee-6ae923e4130']) expect(isUuid(v)).toBe(false);
  });
});
