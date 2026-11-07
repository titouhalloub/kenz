-- 041: text-first community core. All public content is handle-only; no email or budget fields.
create table public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null check (char_length(handle) between 3 and 24),
  locale text not null default 'fr' check (locale in ('ar','fr','en')),
  wilaya_code text check (wilaya_code is null or wilaya_code ~ '^[0-9]{2,3}$'),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index community_profiles_handle_uidx on public.community_profiles(lower(handle));

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('recipe','shopping_list','tip')),
  title text not null check (char_length(title) between 3 and 120),
  body text not null default '' check (char_length(body) <= 5000),
  locale text not null default 'fr' check (locale in ('ar','fr','en')),
  wilaya_code text check (wilaya_code is null or wilaya_code ~ '^[0-9]{2,3}$'),
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_posts_feed_idx on public.community_posts(status, created_at desc);
create index community_posts_author_idx on public.community_posts(author_id, created_at desc);
create index community_posts_wilaya_idx on public.community_posts(wilaya_code, status, created_at desc);

create table public.community_recipes (
  post_id uuid primary key references public.community_posts(id) on delete cascade,
  servings smallint not null default 2 check (servings between 1 and 50),
  steps text not null check (char_length(steps) between 1 and 5000)
);

create table public.community_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_recipes(post_id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  free_text text,
  quantity_milli_units bigint not null check (quantity_milli_units > 0 and quantity_milli_units <= 100000000),
  base_unit text not null check (base_unit in ('kg','l','unit')),
  created_at timestamptz not null default now(),
  check ((product_id is not null) <> (nullif(trim(free_text), '') is not null)),
  check (free_text is null or char_length(free_text) <= 120)
);
create index community_recipe_ingredients_post_idx on public.community_recipe_ingredients(post_id);

create table public.community_shopping_items (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  label text not null check (char_length(label) between 1 and 120),
  quantity_milli_units bigint not null check (quantity_milli_units > 0 and quantity_milli_units <= 100000000),
  base_unit text not null check (base_unit in ('kg','l','unit')),
  created_at timestamptz not null default now()
);
create index community_shopping_items_post_idx on public.community_shopping_items(post_id);

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'published' check (status in ('published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_comments_post_idx on public.community_comments(post_id, created_at);

create table public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'like' check (reaction = 'like'),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_saves (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.community_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_recipes enable row level security;
alter table public.community_recipe_ingredients enable row level security;
alter table public.community_shopping_items enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_saves enable row level security;

revoke all on public.community_profiles, public.community_posts, public.community_recipes,
  public.community_recipe_ingredients, public.community_shopping_items, public.community_comments,
  public.community_reactions, public.community_saves from public, anon, authenticated;

grant select on public.community_profiles, public.community_posts, public.community_recipes,
  public.community_recipe_ingredients, public.community_shopping_items,
  public.community_comments, public.community_reactions to anon;
grant select, insert, update on public.community_profiles to authenticated;
grant select, update, delete on public.community_posts to authenticated;
grant select, insert, update, delete on public.community_recipes,
  public.community_recipe_ingredients, public.community_shopping_items to authenticated;
grant select, update, delete on public.community_comments to authenticated;
grant select, insert, delete on public.community_reactions, public.community_saves to authenticated;

revoke truncate, references, trigger on public.community_profiles, public.community_posts,
  public.community_recipes, public.community_recipe_ingredients, public.community_shopping_items,
  public.community_comments, public.community_reactions, public.community_saves from anon, authenticated;
