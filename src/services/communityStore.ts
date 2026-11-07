import { getSupabaseClient } from './supabase';

export type CommunityKind = 'recipe' | 'shopping_list' | 'tip';
export interface CommunityIngredient {
  productSlug: string | null;
  freeText?: string | null;
  quantityMilliUnits: number;
  baseUnit: 'kg' | 'l' | 'unit';
}
export interface CommunityPost {
  id: string; authorId: string; authorHandle: string; kind: CommunityKind;
  title: string; body: string; locale: 'ar' | 'fr' | 'en'; wilayaCode: string | null;
  createdAt: string; likes: number; likedByMe: boolean; savedByMe: boolean;
  servings?: number; steps?: string; ingredients: CommunityIngredient[];
}
export interface CommunityResult<T> { success: boolean; data?: T; error?: string; }

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  return client;
}
function wilayaCodeFromLabel(value: string): string | null {
  const match = value.match(/^\s*(\d{2,3})/);
  return match?.[1] || null;
}

export async function ensureCommunityProfile(input: {
  userId: string; locale: 'ar' | 'fr' | 'en'; wilaya: string;
}): Promise<CommunityResult<boolean>> {
  try {
    const supabase = requireClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || auth.user.id !== input.userId) return { success: false, error: 'Connecte-toi pour publier.' };
    const handle = 'Kenz-' + input.userId.replace(/-/g, '').slice(-7).toUpperCase();
    const { error } = await supabase.from('community_profiles').upsert({
      user_id: input.userId, handle, locale: input.locale,
      wilaya_code: null, is_public: false,
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Community profile unavailable.' };
  }
}

export async function loadCommunityFeed(input: {
  wilayaCode?: string | null; kind?: CommunityKind | 'all'; userId?: string;
}): Promise<CommunityResult<CommunityPost[]>> {
  try {
    const supabase = requireClient();
    let query = supabase.from('community_posts')
      .select('id,author_id,kind,title,body,locale,wilaya_code,created_at')
      .eq('status', 'published').order('created_at', { ascending: false }).limit(50);
    if (input.kind && input.kind !== 'all') query = query.eq('kind', input.kind);
    if (input.wilayaCode) query = query.or('wilaya_code.is.null,wilaya_code.eq.' + input.wilayaCode);
    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows?.length) return { success: true, data: [] };

    const ids = rows.map((row) => row.id);
    const authorIds = [...new Set(rows.map((row) => row.author_id))];
    const [profilesResult, recipesResult, ingredientsResult, itemsResult, reactionsResult] = await Promise.all([
      supabase.from('community_profiles').select('user_id,handle').in('user_id', authorIds),
      supabase.from('community_recipes').select('post_id,servings,steps').in('post_id', ids),
      supabase.from('community_recipe_ingredients').select('post_id,product_id,free_text,quantity_milli_units,base_unit').in('post_id', ids),
      supabase.from('community_shopping_items').select('post_id,product_id,label,quantity_milli_units,base_unit').in('post_id', ids),
      supabase.from('community_reactions').select('post_id,user_id').in('post_id', ids),
    ]);
    for (const result of [profilesResult, recipesResult, ingredientsResult, itemsResult, reactionsResult]) {
      if (result.error) throw result.error;
    }
    const savesResult = input.userId
      ? await supabase.from('community_saves').select('post_id').eq('user_id', input.userId).in('post_id', ids)
      : { data: [], error: null };
    if (savesResult.error) throw savesResult.error;

    const productIds = [...new Set([
      ...(ingredientsResult.data || []).map((row) => row.product_id).filter(Boolean),
      ...(itemsResult.data || []).map((row) => row.product_id).filter(Boolean),
    ])];
    const productsResult = productIds.length
      ? await supabase.from('products').select('id,slug').in('id', productIds)
      : { data: [], error: null };
    if (productsResult.error) throw productsResult.error;

    const slugByProductId = new Map((productsResult.data || []).map((row) => [row.id, row.slug]));
    const handleByUser = new Map((profilesResult.data || []).map((row) => [row.user_id, row.handle]));
    const recipeByPost = new Map((recipesResult.data || []).map((row) => [row.post_id, row]));
    const ingredientsByPost = new Map<string, CommunityIngredient[]>();
    for (const row of ingredientsResult.data || []) {
      const list = ingredientsByPost.get(row.post_id) || [];
      list.push({
        productSlug: row.product_id ? slugByProductId.get(row.product_id) || null : null,
        freeText: row.free_text,
        quantityMilliUnits: Number(row.quantity_milli_units),
        baseUnit: row.base_unit as CommunityIngredient['baseUnit'],
      });
      ingredientsByPost.set(row.post_id, list);
    }
    for (const row of itemsResult.data || []) {
      const list = ingredientsByPost.get(row.post_id) || [];
      list.push({
        productSlug: row.product_id ? slugByProductId.get(row.product_id) || null : null,
        freeText: row.label,
        quantityMilliUnits: Number(row.quantity_milli_units),
        baseUnit: row.base_unit as CommunityIngredient['baseUnit'],
      });
      ingredientsByPost.set(row.post_id, list);
    }
    const reactions = reactionsResult.data || [];
    const savedIds = new Set((savesResult.data || []).map((row) => row.post_id));
    const posts = rows.map((row) => {
      const recipe = recipeByPost.get(row.id);
      const postReactions = reactions.filter((reaction) => reaction.post_id === row.id);
      return {
        id: row.id, authorId: row.author_id,
        authorHandle: handleByUser.get(row.author_id) || 'Membre Kenz',
        kind: row.kind as CommunityKind, title: row.title, body: row.body || '',
        locale: row.locale as 'ar' | 'fr' | 'en', wilayaCode: row.wilaya_code,
        createdAt: row.created_at, likes: postReactions.length,
        likedByMe: Boolean(input.userId && postReactions.some((reaction) => reaction.user_id === input.userId)),
        savedByMe: savedIds.has(row.id),
        ...(recipe ? { servings: recipe.servings, steps: recipe.steps } : {}),
        ingredients: ingredientsByPost.get(row.id) || [],
      } satisfies CommunityPost;
    });
    return { success: true, data: posts };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to load community feed.' };
  }
}

export async function createCommunityPost(input: {
  kind: CommunityKind; title: string; body: string; locale: 'ar' | 'fr' | 'en'; wilayaCode: string | null;
  recipe?: { servings: number; steps: string; ingredients: Array<{ productSlug: string; quantityMilliUnits: number; baseUnit: 'kg' | 'l' | 'unit' }> };
  shoppingItems?: Array<{ productSlug: string; label: string; quantityMilliUnits: number; baseUnit: 'kg' | 'l' | 'unit' }>;
}): Promise<CommunityResult<string>> {
  try {
    const supabase = requireClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error('Connecte-toi pour publier.');
    const { data: postId, error: postError } = await supabase.rpc('create_community_post', {
      p_kind: input.kind, p_title: input.title, p_body: input.body,
      p_locale: input.locale, p_wilaya_code: input.wilayaCode,
    });
    if (postError || !postId) throw postError || new Error('Post creation failed.');
    try {
      const slugs = input.kind === 'recipe'
        ? (input.recipe?.ingredients || []).map((item) => item.productSlug)
        : (input.shoppingItems || []).map((item) => item.productSlug);
      if (input.kind === 'recipe' && (!input.recipe || slugs.length === 0)) throw new Error('Add at least one ingredient.');
      if (slugs.length) {
        const { data: products, error: productError } = await supabase.from('products').select('id,slug').in('slug', [...new Set(slugs)]);
        if (productError) throw productError;
        const productIdBySlug = new Map((products || []).map((product) => [product.slug, product.id]));
        if (slugs.some((slug) => !productIdBySlug.has(slug))) throw new Error('A product is not in the public catalog.');
        if (input.kind === 'recipe' && input.recipe) {
          const { error: recipeError } = await supabase.from('community_recipes').insert({
            post_id: postId, servings: input.recipe.servings, steps: input.recipe.steps,
          });
          if (recipeError) throw recipeError;
          const { error: ingredientError } = await supabase.from('community_recipe_ingredients').insert(
            input.recipe.ingredients.map((item) => ({
              post_id: postId, product_id: productIdBySlug.get(item.productSlug),
              quantity_milli_units: item.quantityMilliUnits, base_unit: item.baseUnit,
            })),
          );
          if (ingredientError) throw ingredientError;
        }
        if (input.kind === 'shopping_list' && input.shoppingItems?.length) {
          const { error: itemsError } = await supabase.from('community_shopping_items').insert(
            input.shoppingItems.map((item) => ({
              post_id: postId, product_id: productIdBySlug.get(item.productSlug), label: item.label,
              quantity_milli_units: item.quantityMilliUnits, base_unit: item.baseUnit,
            })),
          );
          if (itemsError) throw itemsError;
        }
      }
    } catch (error) {
      await supabase.from('community_posts').delete().eq('id', postId);
      throw error;
    }
    return { success: true, data: postId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to publish post.' };
  }
}

export async function toggleCommunityReaction(postId: string, userId: string, liked: boolean): Promise<CommunityResult<boolean>> {
  try {
    const supabase = requireClient();
    const result = liked
      ? await supabase.from('community_reactions').delete().eq('post_id', postId).eq('user_id', userId)
      : await supabase.from('community_reactions').insert({ post_id: postId, user_id: userId, reaction: 'like' });
    if (result.error) throw result.error;
    return { success: true, data: !liked };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to update reaction.' };
  }
}

export async function toggleCommunitySave(postId: string, userId: string, saved: boolean): Promise<CommunityResult<boolean>> {
  try {
    const supabase = requireClient();
    const result = saved
      ? await supabase.from('community_saves').delete().eq('post_id', postId).eq('user_id', userId)
      : await supabase.from('community_saves').insert({ post_id: postId, user_id: userId });
    if (result.error) throw result.error;
    return { success: true, data: !saved };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to update saved posts.' };
  }
}

export async function addCommunityComment(postId: string, body: string): Promise<CommunityResult<string>> {
  try {
    const { data, error } = await requireClient().rpc('create_community_comment', { p_post_id: postId, p_body: body });
    if (error || !data) throw error || new Error('Comment was not created.');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to add comment.' };
  }
}

export async function reportCommunityPost(input: {
  postId: string; reporterId: string; reason: string; details: string;
}): Promise<CommunityResult<boolean>> {
  try {
    const { error } = await requireClient().from('community_reports').insert({
      reporter_id: input.reporterId, target_type: 'post', target_id: input.postId,
      reason: input.reason, details: input.details || null,
    });
    if (error) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to report post.' };
  }
}

export async function blockCommunityUser(blockerId: string, blockedId: string): Promise<CommunityResult<boolean>> {
  try {
    const { error } = await requireClient().from('community_user_blocks').insert({
      blocker_id: blockerId, blocked_id: blockedId,
    });
    if (error && !/duplicate key/i.test(error.message)) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to block user.' };
  }
}

export async function submitCommunityPrice(input: {
  productSlug: string; unitPriceMinor: number; observedAt: string;
  wilayaCode: string; communeId?: string | null; consent: boolean;
}): Promise<CommunityResult<string>> {
  try {
    const { data, error } = await requireClient().rpc('submit_price_observation', {
      p_product_slug: input.productSlug, p_unit_price_minor: input.unitPriceMinor,
      p_observed_at: input.observedAt, p_wilaya_code: input.wilayaCode,
      p_commune_id: input.communeId || null, p_consent: input.consent,
    });
    if (error || !data) throw error || new Error('Price contribution was not submitted.');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to submit price.' };
  }
}
