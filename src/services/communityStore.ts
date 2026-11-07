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
  comments: Array<{ id: string; authorHandle: string; body: string; createdAt: string }>;
}
export interface CommunityResult<T> { success: boolean; data?: T; error?: string; }

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');
  return client;
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
    const [recipesResult, ingredientsResult, itemsResult, reactionsResult, commentsResult] = await Promise.all([
      supabase.from('community_recipes').select('post_id,servings,steps').in('post_id', ids),
      supabase.from('community_recipe_ingredients').select('post_id,product_id,free_text,quantity_milli_units,base_unit').in('post_id', ids),
      supabase.from('community_shopping_items').select('post_id,product_id,label,quantity_milli_units,base_unit').in('post_id', ids),
      supabase.from('community_reactions').select('post_id,user_id').in('post_id', ids),
      supabase.from('community_comments').select('id,post_id,author_id,body,created_at').eq('status','published').in('post_id', ids).order('created_at',{ascending:true}).limit(150),
    ]);
    for (const result of [recipesResult, ingredientsResult, itemsResult, reactionsResult, commentsResult]) {
      if (result.error) throw result.error;
    }
    const profileIds = [...new Set([...authorIds, ...(commentsResult.data || []).map((row) => row.author_id)])];
    const profilesResult = await supabase.from('community_profiles').select('user_id,handle').in('user_id', profileIds);
    if (profilesResult.error) throw profilesResult.error;
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
    const commentsByPost = new Map<string, Array<{ id: string; authorHandle: string; body: string; createdAt: string }>>();
    for (const row of commentsResult.data || []) {
      const list = commentsByPost.get(row.post_id) || [];
      list.push({ id: row.id, authorHandle: handleByUser.get(row.author_id) || 'Membre Kenz', body: row.body, createdAt: row.created_at });
      commentsByPost.set(row.post_id, list);
    }
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
        comments: commentsByPost.get(row.id) || [],
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
    // A public handle is exposed only after the complete post and its structured rows succeeded.
    await supabase.from('community_profiles').update({
      is_public: true, locale: input.locale, wilaya_code: input.wilayaCode,
    }).eq('user_id', auth.user.id);
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

export interface CommunityModerationReport {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reason: string;
  details: string | null;
  createdAt: string;
  targetText: string;
  authorId: string | null;
}

export async function loadCommunityModerationQueue(): Promise<CommunityResult<CommunityModerationReport[]>> {
  try {
    const supabase = requireClient();
    const { data: reports, error } = await supabase.from('community_reports')
      .select('id,target_type,target_id,reason,details,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    if (!reports?.length) return { success: true, data: [] };
    const postIds = reports.filter((row) => row.target_type === 'post').map((row) => row.target_id);
    const commentIds = reports.filter((row) => row.target_type === 'comment').map((row) => row.target_id);
    const [posts, comments] = await Promise.all([
      postIds.length ? supabase.from('community_posts').select('id,title,body,author_id').in('id', postIds) : Promise.resolve({ data: [], error: null }),
      commentIds.length ? supabase.from('community_comments').select('id,body,author_id').in('id', commentIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (posts.error) throw posts.error;
    if (comments.error) throw comments.error;
    const postById = new Map((posts.data || []).map((row) => [row.id, row]));
    const commentById = new Map((comments.data || []).map((row) => [row.id, row]));
    return {
      success: true,
      data: reports.map((row) => {
        const target = row.target_type === 'post' ? postById.get(row.target_id) : commentById.get(row.target_id);
        return {
          id: row.id,
          targetType: row.target_type as 'post' | 'comment',
          targetId: row.target_id,
          reason: row.reason,
          details: row.details,
          createdAt: row.created_at,
          targetText: row.target_type === 'post' && target && 'title' in target
            ? target.title + '\\n' + target.body
            : target && 'body' in target ? target.body : '[Contenu supprimé]',
          authorId: target && 'author_id' in target ? target.author_id : null,
        };
      }),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to load moderation queue.' };
  }
}

export async function resolveCommunityReport(id: string, status: 'resolved' | 'dismissed', reason: string): Promise<CommunityResult<boolean>> {
  try {
    const { error } = await requireClient().rpc('resolve_community_report', {
      p_report_id: id, p_status: status, p_reason: reason,
    });
    if (error) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to resolve report.' };
  }
}

export async function moderateCommunityPost(id: string, status: 'published' | 'hidden' | 'rejected', reason: string): Promise<CommunityResult<boolean>> {
  try {
    const { error } = await requireClient().rpc('moderate_community_post', {
      p_post_id: id, p_status: status, p_reason: reason,
    });
    if (error) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to moderate post.' };
  }
}

export async function moderateCommunityComment(id: string, status: 'published' | 'hidden', reason: string): Promise<CommunityResult<boolean>> {
  try {
    const { error } = await requireClient().rpc('moderate_community_comment', {
      p_comment_id: id, p_status: status, p_reason: reason,
    });
    if (error) throw error;
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to moderate comment.' };
  }
}

export interface VerifiedOwnedBusiness {
  id: string;
  name: string;
}

export async function listVerifiedOwnedBusinesses(userId: string): Promise<CommunityResult<VerifiedOwnedBusiness[]>> {
  try {
    const supabase = requireClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || auth.user.id !== userId) return { success: false, error: 'Connecte-toi pour vérifier tes commerces.' };
    const { data, error } = await supabase.from('businesses')
      .select('id,name')
      .eq('owner_id', userId)
      .eq('verification_status', 'documents_verified')
      .eq('is_published', true)
      .limit(20);
    if (error) throw error;
    return { success: true, data: (data || []) as VerifiedOwnedBusiness[] };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to load verified businesses.' };
  }
}

export async function submitMerchantPrice(input: {
  businessId: string; productSlug: string; unitPriceMinor: number;
  observedAt: string; wilayaCode: string; consent: boolean;
}): Promise<CommunityResult<string>> {
  try {
    const { data, error } = await requireClient().rpc('submit_merchant_price_observation', {
      p_business_id: input.businessId,
      p_product_slug: input.productSlug,
      p_unit_price_minor: input.unitPriceMinor,
      p_observed_at: input.observedAt,
      p_wilaya_code: input.wilayaCode,
      p_commune_id: null,
      p_consent: input.consent,
    });
    if (error || !data) throw error || new Error('Merchant price was not submitted.');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to submit merchant price.' };
  }
}

export async function deleteMyPriceContributions(): Promise<CommunityResult<number>> {
  try {
    const { data, error } = await requireClient().rpc('delete_my_price_contributions');
    if (error || data === null || data === undefined) throw error || new Error('No contribution deletion result.');
    return { success: true, data: Number(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to delete contributions.' };
  }
}

export async function deleteCommunityPost(postId: string, userId: string): Promise<CommunityResult<boolean>> {
  try {
    const supabase = requireClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || auth.user.id !== userId) throw new Error('Authentication required.');
    const { error } = await supabase.from('community_posts').delete().eq('id', postId).eq('author_id', userId);
    if (error) throw error;
    const { data: remaining, error: remainingError } = await supabase.from('community_posts')
      .select('id').eq('author_id', userId).eq('status', 'published').limit(1);
    if (remainingError) throw remainingError;
    if (!remaining?.length) {
      await supabase.from('community_profiles').update({ is_public: false, wilaya_code: null }).eq('user_id', userId);
    }
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to delete post.' };
  }
}
