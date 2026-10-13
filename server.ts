import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

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
app.post('/api/ai/advisor', async (req, res) => {
  const isBYOK = Boolean(req.body.byokKey || (req.body.byokProvider && req.body.byokProvider !== 'google'));

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
    if (byokProvider in OPENAI_COMPATIBLE_PROVIDERS) {
      const preset = OPENAI_COMPATIBLE_PROVIDERS[byokProvider];
      const apiKey = byokKey || process.env[`${byokProvider.toUpperCase()}_API_KEY`] || process.env.OPENAI_API_KEY;

      if (!apiKey && byokProvider !== 'custom') {
        if (isBYOK) {
          return res.status(400).json({
            success: false,
            error: `Clé API manquante pour ${preset.label}. Veuillez configurer votre clé dans le mode BYOK.`,
          });
        }
        return res.status(200).json({
          success: true,
          source: 'deterministic_fallback',
          text: generateFallbackAdvice(purpose, financialContext),
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

      return res.json({
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
        return res.status(200).json({
          success: true,
          source: 'deterministic_fallback',
          text: generateFallbackAdvice(purpose, financialContext),
        });
      }

      const model = byokModel || 'claude-3-5-sonnet-20241022';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
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

      return res.json({
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
      return res.status(200).json({
        success: true,
        source: 'deterministic_fallback',
        text: generateFallbackAdvice(purpose, financialContext),
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

    return res.json({
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

    return res.json({
      success: true,
      source: 'deterministic_fallback',
      text: generateFallbackAdvice(req.body?.purpose, req.body?.financialContext),
    });
  }
});

// Dedicated Instant Endpoint to test any BYOK API key across providers
app.post('/api/ai/test-key', async (req, res) => {
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
    if (byokProvider in OPENAI_COMPATIBLE_PROVIDERS) {
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
