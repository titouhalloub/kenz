import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '32kb' }));

// Small per-process limiter for public AI endpoints. Use a shared store in multi-instance deployments.
const aiRequestBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimitAi(req: express.Request, res: express.Response, next: express.NextFunction) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  let bucket = aiRequestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 60_000 };
    aiRequestBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > 20) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ success: false, error: 'Trop de requêtes. Réessayez dans une minute.' });
  }
  if (aiRequestBuckets.size > 10_000) {
    for (const [ip, entry] of aiRequestBuckets) if (entry.resetAt <= now) aiRequestBuckets.delete(ip);
  }
  next();
}

/**
 * Verify every AI API request against Supabase Auth. Only development
 * environments without server-side Supabase configuration may use the
 * local demo fallback; production fails closed when auth is not configured.
 */
async function requireAuthenticatedUser(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV !== 'production') return next();
    return res.status(503).json({
      success: false,
      error: 'Le service d’authentification IA n’est pas configuré.',
    });
  }

  const authorization = req.header('authorization') || '';
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const accessToken = tokenMatch?.[1]?.trim();
  if (!accessToken) {
    return res.status(401).json({ success: false, error: 'Authentification requise.' });
  }

  try {
    // Create a request-scoped client and validate the token with Supabase Auth.
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      return res.status(401).json({ success: false, error: 'Session invalide ou expirée.' });
    }
    res.locals.authUserId = data.user.id;
    res.locals.accessToken = accessToken;
    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'Impossible de vérifier la session.' });
  }
}

/**
 * Record authenticated AI usage through the caller's RLS session. The first
 * call reserves/debits credits before provider execution; a second call with
 * the same idempotency key finalizes token metadata without another debit.
 */
async function recordMeteredAIUsage(
  req: express.Request,
  res: express.Response,
  tokensInput: number,
  tokensOutput: number,
): Promise<{ ok: boolean; balanceCredits?: number; status?: number; error?: string }> {
  const userId = res.locals.authUserId as string | undefined;
  if (!userId) return { ok: true }; // local demo mode only

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const accessToken = res.locals.accessToken as string | undefined;
  if (!supabaseUrl || !supabaseAnonKey || !accessToken) {
    return { ok: false, status: 503, error: 'La facturation IA sécurisée n’est pas configurée.' };
  }

  const mode = req.body?.mode === 'byok' || (!req.body?.mode && Boolean(req.body?.byokKey || (req.body?.byokProvider && req.body.byokProvider !== 'google'))) ? 'byok' : 'managed';
  const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose : 'general_query';
  const provider = typeof req.body?.byokProvider === 'string' ? req.body.byokProvider : 'google_gemini';
  const model = typeof req.body?.byokModel === 'string' ? req.body.byokModel : 'gemini-2.5-flash';
  // Generate the key on the server so callers cannot replay a previous
  // completed request by reusing a client-supplied idempotency key.
  const idempotencyKey = (res.locals.idempotencyKey as string | undefined) || randomUUID();
  res.locals.idempotencyKey = idempotencyKey;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const { data, error } = await userClient.rpc('record_ai_usage', {
      p_credits_to_debit: mode === 'byok' ? 0 : 20,
      p_mode: mode,
      p_provider: provider,
      p_model: model,
      p_tokens_input: Math.max(0, Math.trunc(tokensInput)),
      p_tokens_output: Math.max(0, Math.trunc(tokensOutput)),
      p_purpose: purpose,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      const insufficient = error.message?.includes('INSUFFICIENT_CREDITS');
      return {
        ok: false,
        status: insufficient ? 402 : 503,
        error: insufficient ? 'Crédits IA insuffisants.' : 'Impossible d’enregistrer la consommation IA.',
      };
    }
    const balanceCredits = Number(data);
    res.locals.balanceCredits = balanceCredits;
    return { ok: true, balanceCredits };
  } catch {
    return { ok: false, status: 503, error: 'Impossible de joindre le service de crédits IA.' };
  }
}

async function sendMeteredAIResponse(
  req: express.Request,
  res: express.Response,
  payload: Record<string, unknown>,
) {
  if (!res.locals.authUserId) return res.json(payload);
  const finalized = await recordMeteredAIUsage(
    req, res, Number(payload.tokensInput || 0), Number(payload.tokensOutput || 0),
  );
  if (!finalized.ok && typeof res.locals.balanceCredits !== 'number') {
    return res.status(finalized.status || 503).json({ success: false, error: finalized.error || 'Erreur de facturation IA.' });
  }
  return res.json({
    ...payload,
    balanceCredits: finalized.balanceCredits ?? Number(res.locals.balanceCredits),
  });
}

function trimTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith('/')) result = result.slice(0, -1);
  return result;
}

function resolveOpenAIBaseUrl(
  provider: string,
  preset: { defaultBaseUrl: string },
  requestedBaseUrl?: string,
): string | null {
  // Custom local model endpoints are allowed only in development. Never let a
  // production server make requests to arbitrary client-supplied destinations.
  if (provider === 'custom') {
    if (process.env.NODE_ENV === 'production') return null;
    try {
      const url = new URL(requestedBaseUrl?.trim() || preset.defaultBaseUrl);
      const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
      if (url.protocol !== 'http:' || !localHosts.has(url.hostname) || url.username || url.password || url.search || url.hash) return null;
      return trimTrailingSlashes(url.toString());
    } catch { return null; }
  }

  // Preset providers are pinned to their official API origin/path. Ignore no
  // user-supplied alternate host: reject it instead to prevent SSRF.
  try {
    const expected = new URL(preset.defaultBaseUrl);
    if (requestedBaseUrl?.trim()) {
      const requested = new URL(requestedBaseUrl.trim());
      const expectedPath = trimTrailingSlashes(expected.pathname);
      const requestedPath = trimTrailingSlashes(requested.pathname);
      if (requested.origin !== expected.origin || requestedPath !== expectedPath || requested.username || requested.password || requested.search || requested.hash) return null;
    }
    return preset.defaultBaseUrl;
  } catch { return null; }
}

// Preset definitions for OpenAI-compatible providers
const OPENAI_COMPATIBLE_PROVIDERS: Record<string, { defaultBaseUrl: string; defaultModel: string; label: string }> = {
  openai: {
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    label: 'OpenAI',
  },
  deepseek: {
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    label: 'DeepSeek',
  },
  groq: {
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    label: 'Groq',
  },
  mistral: {
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    label: 'Mistral AI',
  },
  openrouter: {
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    label: 'OpenRouter',
  },
  perplexity: {
    defaultBaseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar',
    label: 'Perplexity',
  },
  custom: {
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'local-model',
    label: 'Endpoint Personnalisé',
  },
};

// Universal Server-Side AI Gateway supporting ANY provider
app.post('/api/ai/advisor', rateLimitAi, requireAuthenticatedUser, async (req, res) => {
  const isBYOK = req.body.mode === 'byok' || (!req.body.mode && Boolean(req.body.byokKey || (req.body.byokProvider && req.body.byokProvider !== 'google')));

  try {
    const {
      purpose,
      userPrompt,
      financialContext,
      byokProvider = 'google',
      byokKey,
      byokModel,
      byokBaseUrl,
    } = req.body;

    // Reserve/debit before invoking any paid provider. If the balance is too low,
    // the request stops here and no provider call is made.
    const reservation = await recordMeteredAIUsage(req, res, 0, 0);
    if (!reservation.ok) {
      return res.status(reservation.status || 503).json({
        success: false,
        error: reservation.error || 'Impossible de vérifier le portefeuille IA.',
      });
    }

    const systemPrompt = `Tu es le Conseiller Financier Personnel de Kenz Finance en Algérie.
Règles strictes :
- Sois clair, concis, bienveillant et pratique.
- Parle en français avec quelques termes familiers du quotidien algérien si approprié (ex. dinars DA, paye, marché, courses).
- Les calculs financiers réels sont déjà calculés de manière déterministe. Tu n'inventes jamais de chiffres et tu n'es pas un conseiller en investissement agréé.
- Contexte financier utilisateur :
${JSON.stringify(financialContext || {}, null, 2)}`;

    const promptText =
      userPrompt || 'Analyse mon budget et donne-moi les 2 meilleures recommandations d’épargne.';

    // 1. OPENAI OR OPENAI-COMPATIBLE (DeepSeek, Groq, Mistral, OpenRouter, Perplexity, Custom, etc.)
    if (Object.hasOwn(OPENAI_COMPATIBLE_PROVIDERS, byokProvider)) {
      const preset = OPENAI_COMPATIBLE_PROVIDERS[byokProvider];
      const apiKey = byokKey || process.env[`${byokProvider.toUpperCase()}_API_KEY`] || process.env.OPENAI_API_KEY;

      if (!apiKey && byokProvider !== 'custom') {
        if (isBYOK) {
          return res.status(400).json({
            success: false,
            error: `Clé API manquante pour ${preset.label}. Veuillez configurer votre clé dans le mode BYOK.`,
          });
        }
        return await sendMeteredAIResponse(req, res, {
          success: true,
          source: 'deterministic_fallback',
          text: generateFallbackAdvice(purpose, financialContext),
          tokensInput: 0,
          tokensOutput: 0,
        });
      }

      let base = (byokBaseUrl && byokBaseUrl.trim()) || preset.defaultBaseUrl;
      base = base.replace(/\/+$/, '');
      const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
      const model = byokModel || preset.defaultModel;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      if (byokProvider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://kenz-finance.app';
        headers['X-Title'] = 'Kenz Finance BYOK Gateway';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptText },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedMessage = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedMessage = parsed.error?.message || parsed.message || errorText;
        } catch {
          // ignore json parse error
        }
        throw new Error(`${preset.label} (${response.status}): ${parsedMessage}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || 'Analyse terminée.';

      return await sendMeteredAIResponse(req, res, {
        success: true,
        source: `${preset.label} (${model})`,
        text: content,
        tokensInput: data.usage?.prompt_tokens || 150,
        tokensOutput: data.usage?.completion_tokens || 120,
      });
    }

    // 2. ANTHROPIC CLAUDE
    if (byokProvider === 'anthropic') {
      const apiKey = byokKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        if (isBYOK) {
          return res.status(400).json({
            success: false,
            error: 'Clé API Anthropic manquante. Veuillez configurer votre clé dans le mode BYOK.',
          });
        }
        return await sendMeteredAIResponse(req, res, {
          success: true,
          source: 'deterministic_fallback',
          text: generateFallbackAdvice(purpose, financialContext),
          tokensInput: 0,
          tokensOutput: 0,
        });
      }

      const model = byokModel || 'claude-3-5-sonnet-20241022';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: promptText }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedMessage = errorText;
        try {
          const parsed = JSON.parse(errorText);
          parsedMessage = parsed.error?.message || errorText;
        } catch {
          // ignore
        }
        throw new Error(`Anthropic (${response.status}): ${parsedMessage}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || 'Analyse terminée.';

      return await sendMeteredAIResponse(req, res, {
        success: true,
        source: `Anthropic (${model})`,
        text: content,
        tokensInput: data.usage?.input_tokens || 150,
        tokensOutput: data.usage?.output_tokens || 120,
      });
    }

    // 3. GOOGLE GEMINI (Default Managed or BYOK)
    const apiKey = byokKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      if (isBYOK) {
        return res.status(400).json({
          success: false,
          error: 'Clé API Google Gemini manquante.',
        });
      }
      return await sendMeteredAIResponse(req, res, {
        success: true,
        source: 'deterministic_fallback',
        text: generateFallbackAdvice(purpose, financialContext),
        tokensInput: 0,
        tokensOutput: 0,
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const model = byokModel || 'gemini-2.5-flash';

    const response = await ai.models.generateContent({
      model,
      contents: promptText,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });

    return await sendMeteredAIResponse(req, res, {
      success: true,
      source: `Google Gemini (${model})`,
      text: response.text || 'Analyse terminée avec succès.',
      tokensInput: 150,
      tokensOutput: 120,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI error';
    console.error('AI Advisor error:', message);

    if (isBYOK) {
      return res.status(400).json({
        success: false,
        error: message,
      });
    }

    return await sendMeteredAIResponse(req, res, {
      success: true,
      source: 'deterministic_fallback',
      text: generateFallbackAdvice(req.body?.purpose, req.body?.financialContext),
      tokensInput: 0,
      tokensOutput: 0,
    });
  }
});

// Dedicated Instant Endpoint to test any BYOK API key across providers
app.post('/api/ai/test-key', rateLimitAi, requireAuthenticatedUser, async (req, res) => {
  const startTime = Date.now();
  const { byokProvider = 'google', byokKey, byokModel, byokBaseUrl } = req.body;

  try {
    if (!byokKey && byokProvider !== 'custom') {
      return res.status(400).json({
        success: false,
        error: 'Veuillez saisir une clé API valide.',
      });
    }

    // Test OpenAI-compatible (DeepSeek, Groq, Mistral, OpenRouter, Perplexity, OpenAI, Custom)
    if (Object.hasOwn(OPENAI_COMPATIBLE_PROVIDERS, byokProvider)) {
      const preset = OPENAI_COMPATIBLE_PROVIDERS[byokProvider];
      let base = (byokBaseUrl && byokBaseUrl.trim()) || preset.defaultBaseUrl;
      base = base.replace(/\/+$/, '');
      const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
      const model = byokModel || preset.defaultModel;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (byokKey) headers['Authorization'] = `Bearer ${byokKey}`;
      if (byokProvider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://kenz-finance.app';
        headers['X-Title'] = 'Kenz Finance BYOK Verification';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let msg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          msg = parsed.error?.message || parsed.message || errorText;
        } catch {
          // ignore
        }
        return res.json({
          success: false,
          error: `${preset.label} (${response.status}): ${msg}`,
        });
      }

      const latencyMs = Date.now() - startTime;
      return res.json({
        success: true,
        message: `Connexion établie avec succès à ${preset.label} (${model})`,
        latencyMs,
      });
    }

    // Test Anthropic Claude
    if (byokProvider === 'anthropic') {
      const model = byokModel || 'claude-3-5-haiku-20241022';
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': byokKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Ping' }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let msg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          msg = parsed.error?.message || errorText;
        } catch {
          // ignore
        }
        return res.json({
          success: false,
          error: `Anthropic (${response.status}): ${msg}`,
        });
      }

      const latencyMs = Date.now() - startTime;
      return res.json({
        success: true,
        message: `Connexion établie avec succès à Anthropic (${model})`,
        latencyMs,
      });
    }

    // Test Google Gemini
    const ai = new GoogleGenAI({
      apiKey: byokKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const model = byokModel || 'gemini-2.5-flash';
    await ai.models.generateContent({
      model,
      contents: 'Ping',
    });

    const latencyMs = Date.now() - startTime;
    return res.json({
      success: true,
      message: `Connexion établie avec succès à Google Gemini (${model})`,
      latencyMs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur de connexion';
    return res.json({
      success: false,
      error: `Échec du test : ${message}`,
    });
  }
});

function generateFallbackAdvice(purpose: string, context: Record<string, unknown> = {}): string {
  const safeToSpend = (context.safeToSpendFormatted as string) || '0 DA';
  const dailyLimit = (context.dailyGuidelineFormatted as string) || '0 DA';
  const daysUntilPayday = (context.daysUntilPayday as number) || 15;

  if (purpose === 'spending_leak_detector') {
    return `Analyse des fuites de dépenses :
1. Petits achats quotidiens répétés : Les dépenses d'appoint (cafés, collations, courses imprévues) représentent souvent 15% à 20% du budget mensuel non catégorisé.
2. Factures et forfaits : Vérifiez vos abonnements internet et téléphonie pour vous assurer qu'ils correspondent à vos besoins réels.
Recommandation : Fixez une enveloppe stricte en espèces pour les petites dépenses de la semaine.`;
  }

  if (purpose === 'savings_optimizer') {
    return `Optimisation d'épargne :
Votre plafond quotidien disponible est estimé à ${dailyLimit} sur les ${daysUntilPayday} prochains jours.
Conseil : Mettez de côté immédiatement votre cotisation d'épargne dès le jour de la paye (« Payez-vous en premier ») plutôt que d'attendre la fin du mois.`;
  }

  return `Analyse de votre reste à vivre :
Votre disponible net s'élève à ${safeToSpend}. En respectant la limite de ${dailyLimit}/jour, vous garantissez le paiement de toutes vos factures réservées tout en préservant vos objectifs d'épargne.`;
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
