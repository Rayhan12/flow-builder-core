# Multi-provider AI (bring your own key)

Modelled on Penny, Rayhan's AI expense tracker (Flutter app in `~/software_development/expense_tracker`, read only). Penny's scope, from `lib/features/ai_assistant/`:
- `domain/enums/assistant_provider.dart`: providers Gemini, Claude, OpenAI, OpenRouter, OpenCode Go and on-device, each with a default model (gemini-2.5-flash, claude-sonnet-4-5, gpt-4o-mini, google/gemini-2.5-flash).
- `data/clients/provider_model_catalog.dart`: lists models from each provider API (Gemini `/models` with `x-goog-api-key`, Anthropic `/v1/models`, OpenAI `/v1/models`, OpenRouter `/api/v1/models`), falls back to `fallback_models.dart` lists and flags `unauthorized` or `unreachable`.
- `data/clients/model_availability_probe.dart`: pings a model with a tiny prompt ("Are you active? say yes or no", max 16 tokens, 12 second timeout) and marks it usable only on a 2xx with a body.
- `data/clients/*_chat_model_client.dart` and `*_chat_mapper.dart`: one client per provider behind a factory (`model_client_factory.dart`), with tool calling mapped per provider; `assistant_health_probe.dart` picks a working model.
- Keys are entered by the user and calls go straight from the app to the provider. **No server proxy.** Flow Builder keeps the same rule: keys stay in the browser and are never sent to our servers.

## Providers in Flow Builder

| Provider | List models | Chat + tools | Browser (CORS) | Key page |
|---|---|---|---|---|
| Google Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models` (`x-goog-api-key`), paginate with `nextPageToken`, keep models whose `supportedGenerationMethods` has `generateContent` | `models/{m}:generateContent` with `tools.functionDeclarations` | Works | https://aistudio.google.com/app/apikey |
| Anthropic Claude | `GET https://api.anthropic.com/v1/models` (paginate with `has_more` / `after_id`) | `POST /v1/messages` with `tools` and `tool_use` / `tool_result` blocks | Needs header `anthropic-dangerous-direct-browser-access: true` plus `x-api-key`, `anthropic-version: 2023-06-01` | https://console.anthropic.com/settings/keys |
| OpenAI | `GET https://api.openai.com/v1/models` (filter to chat models: gpt-*, o*, chatgpt-*) | `POST /v1/chat/completions` with `tools` (function) | Works | https://platform.openai.com/api-keys |
| OpenRouter | `GET https://openrouter.ai/api/v1/models` (has `supported_parameters` incl. `tools`) | `POST /api/v1/chat/completions` OpenAI style, headers `HTTP-Referer` and `X-Title: Flow Builder` | Works | https://openrouter.ai/keys |
| Custom OpenAI-compatible | `GET {baseUrl}/models` | `POST {baseUrl}/chat/completions` | Depends on provider (Groq, Together, DeepSeek, Mistral work from browsers in most cases; local Ollama needs `OLLAMA_ORIGINS`, LM Studio needs CORS enabled) | Shown per preset: Groq https://console.groq.com/keys, Together https://api.together.ai/settings/api-keys, DeepSeek https://platform.deepseek.com/api_keys, Mistral https://console.mistral.ai/api-keys, Ollama http://localhost:11434/v1 (no key) |

If a browser call fails with a network or CORS error, show: "This provider blocks calls from the browser. Try OpenRouter, or run a local proxy." Do not add a server proxy (Penny has none); ask Rayhan first if one is ever needed.

If listing fails, show the error. Do **not** silently substitute `FALLBACK_MODELS` as if they were real. Fallbacks may only appear as clearly labelled suggestions the user can choose to probe.

## Model cache storage

Per connection, after a successful list+probe:

- **Storage key:** `fb:ai:{uid}:models:{connectionId}:{keyFingerprint}`
- **Pointer:** `fb:ai:{uid}:modelptr:{connectionId}` = current `keyFingerprint` (for key-change detection)
- **keyFingerprint:** first 16 hex chars of `SHA-256(provider + baseUrl + apiKey)` via `crypto.subtle`. Stored on the connection record and in the cache. The raw API key is never written into the cache value (it already lives only in `fb:ai:{uid}:connections`).
- **Shape:**
  ```ts
  {
    connectionId: string
    keyFingerprint: string
    lastCheckedAt: number
    enabledModelIds: string[]
    models: Array<{
      id: string
      displayName?: string
      usable: boolean
      reason?: PingReason  // no_access | quota | rate_limit | needs_billing | unsupported | cors_blocked | timeout | error
      detail?: string
      supportsTools: boolean
      checkedAt: number
      isNew?: boolean       // set on refresh for newly discovered models
    }>
    listError?: string     // set when listModels failed
  }
  ```

**Migration:** old key `fb:ai:{uid}:models:{connectionId}` is read once, converted with `enabledModelIds = usable && supportsTools`, written under the fingerprinted key, then deleted.

Firestore mirroring of key-free model prefs is optional and not required.

## Settings flow

1. Save a key (Settings or missing-key card) → compute fingerprint → list **all** models (paginate where the API pages) → Penny-probe every model (tiny prompt, 12s timeout, concurrency 3) with a progress indicator.
2. Show the full list with usable / not usable + reason. Checkboxes: only usable models can be enabled. Defaults after the **first** probe: all usable models that support tools are pre-checked. Select all usable / clear / search filter. User saves enabled ids.
3. **Refresh models** re-fetches and re-probes. Preserves prior enabled selections for models that still exist and are still usable. Newly found usable models are listed, marked **New**, and **not** auto-enabled. Removed models drop out. `lastCheckedAt` updates; UI shows "Last checked &lt;relative time&gt;".
4. Re-fetch automatically only when the key fingerprint changes, and only once while the user is on Settings (banner: "Key changed, refresh needed"). Not on app load, panel open, or switcher open.
5. Per-model **Re-check** updates that row in the stored record.

## Model switcher and AI calls

- ModelSwitcher (dashboard AI panel, editor assistant, AI Create) and every AI call read **only** from stored `enabledModelIds`. No listing or probing on load/open/chat.
- No invented placeholder defaults (`PROVIDER_META.defaultModel` is not used as a live selection).
- If there is no stored list or no enabled models: show a small "Set up models in Settings" link.
- `resolveActiveSelection` picks only from enabled stored models; if the saved selection is no longer enabled, fall back to the first enabled one; else `null` (missing-key or set-up prompt).

## One provider interface

```ts
interface LLMProvider {
  id: 'gemini' | 'anthropic' | 'openai' | 'openrouter' | 'custom'
  listModels(conn): Promise<ModelInfo[]>  // throws on failure; never silent fallback
  ping(conn, model): Promise<PingResult>
  chat(conn, req: { model, system, messages: AgentMessage[], tools?: ToolDecl[] }): Promise<{ text?: string, toolCalls?: { id, name, args }[] }>
}
```

- Normalised message format with tool calls and tool results; adapters map to Gemini functionCall/functionResponse, OpenAI tool_calls/tool messages, Anthropic tool_use/tool_result.
- Tool declarations come from `shared/tools` zod schemas (JSON Schema, cleaned per provider).
- Fallback for models without tools: JSON-mode prompt that returns `{ "tool": name, "args": {...} }` or the existing replace/ops JSON, validated with zod.
- The agent loop (max 12 steps, Stop, destructive confirm) is unchanged and works with any provider.

## Tests

Vitest with mocked `fetch`: listing pagination (Anthropic `after_id`, Gemini `nextPageToken`), ping reason mapping, concurrency, fingerprinted cache shape (raw key absent from stored JSON), enabled defaults, refresh preserving selections and marking New, key-change invalidation, `resolveActiveSelection` enabled-only, ModelSwitcher enabled-only with zero fetch on mount/open.

Playwright on emulators: save a key with routed `/models` and `/chat/completions`, assert usable/not usable rows, uncheck + save, reload with zero `/models` hits, switcher shows only enabled models, Refresh models hits `/models` once and shows New unchecked.
