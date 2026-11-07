import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function migration(name: string): string {
  return readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
}

describe('price intelligence and community migration safety', () => {
  const migrations = [
    '036_price_catalog_and_locations.sql',
    '037_price_observations_and_stats.sql',
    '038_simulator_scenarios.sql',
    '039_public_price_ingestion.sql',
    '040_align_price_catalog_slugs.sql',
    '041_community_core.sql',
    '042_community_moderation.sql',
    '043_price_contributions.sql',
  ];

  it('keeps every SQL dollar-quoted function body balanced', () => {
    for (const name of migrations) {
      const sql = migration(name);
      const tags = sql.match(/\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/g) || [];
      const counts = new Map<string, number>();
      for (const tag of tags) counts.set(tag, (counts.get(tag) || 0) + 1);
      for (const [tag, count] of counts) {
        expect(count % 2, name + ' has unbalanced ' + tag).toBe(0);
      }
    }
  });

  it('never grants client write access to raw price observations or aggregate stats', () => {
    const sql = migration('037_price_observations_and_stats.sql');
    expect(sql).toMatch(/alter table public\.price_observations enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.price_observations,\s*public\.price_stats/i);
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.price_observations/i);
    expect(sql).toMatch(/grant select on public\.price_stats to anon, authenticated/i);
  });

  it('keeps public scraper observations pending until moderator review', () => {
    const observations = migration('037_price_observations_and_stats.sql');
    const ingestion = migration('039_public_price_ingestion.sql');
    const review = migration('043_price_contributions.sql');
    expect(observations).toMatch(/status text not null default 'pending'/i);
    expect(ingestion).toContain('source_record_key');
    expect(review).toMatch(/status,\s*quality_flags,\s*source_reference/i);
    expect(review).toMatch(/'pending',v_flags/i);
    expect(review).toMatch(/review_price_observation/i);
    expect(review).toMatch(/public\.refresh_price_stats\(14\)/i);
  });

  it('protects community tables with RLS and moderator-only controls', () => {
    const core = migration('041_community_core.sql');
    const moderation = migration('042_community_moderation.sql');
    for (const table of [
      'community_profiles', 'community_posts', 'community_recipes',
      'community_recipe_ingredients', 'community_shopping_items',
      'community_comments', 'community_reactions', 'community_saves',
    ]) {
      expect(core).toMatch(new RegExp('alter table public\\.' + table + ' enable row level security', 'i'));
    }
    expect(moderation).toMatch(/alter table public\.community_moderators enable row level security/i);
    expect(moderation).toMatch(/create or replace function public\.is_community_moderator/i);
    expect(moderation).toMatch(/create or replace function public\.moderate_community_post/i);
  });

  it('stores no budgets, income, balances or transaction snapshots in simulator scenarios', () => {
    const sql = migration('038_simulator_scenarios.sql').toLowerCase();
    const tableDefinition = sql.slice(sql.indexOf('create table public.simulator_scenarios'), sql.indexOf(');'));
    expect(tableDefinition).toContain('simulator_scenarios');
    for (const forbidden of ['income', 'balance', 'transaction', 'budget', 'result_snapshot']) {
      expect(tableDefinition).not.toContain(forbidden);
    }
  });
});
