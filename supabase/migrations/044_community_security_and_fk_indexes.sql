-- 044: close public moderator-helper exposure and index uncovered foreign keys.
-- Existing RPCs retain their explicit authenticated grants and in-function authorization.
revoke all on function public.is_community_moderator() from public, anon;
grant execute on function public.is_community_moderator() to authenticated;

create index if not exists community_comments_author_id_idx on public.community_comments(author_id);
create index if not exists community_moderation_actions_moderator_id_idx on public.community_moderation_actions(moderator_id);
create index if not exists community_reactions_user_id_idx on public.community_reactions(user_id);
create index if not exists community_recipe_ingredients_product_id_idx on public.community_recipe_ingredients(product_id);
create index if not exists community_reports_reporter_id_idx on public.community_reports(reporter_id);
create index if not exists community_reports_resolved_by_idx on public.community_reports(resolved_by);
create index if not exists community_saves_user_id_idx on public.community_saves(user_id);
create index if not exists community_shopping_items_product_id_idx on public.community_shopping_items(product_id);
create index if not exists price_observation_reviews_reviewer_id_idx on public.price_observation_reviews(reviewer_id);
create index if not exists price_observations_commune_id_idx on public.price_observations(commune_id);
create index if not exists price_observations_contributor_id_idx on public.price_observations(contributor_id);
create index if not exists price_observations_reviewed_by_idx on public.price_observations(reviewed_by);
create index if not exists recurring_items_account_id_idx on public.recurring_items(account_id);
create index if not exists shared_wallet_entries_created_by_idx on public.shared_wallet_entries(created_by);
create index if not exists shared_wallet_invites_accepted_by_idx on public.shared_wallet_invites(accepted_by);
create index if not exists shared_wallet_invites_owner_id_idx on public.shared_wallet_invites(owner_id);
create index if not exists shared_wallet_members_owner_id_idx on public.shared_wallet_members(owner_id);
create index if not exists shared_wallets_owner_id_idx on public.shared_wallets(owner_id);
