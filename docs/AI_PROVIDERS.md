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
| Google Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models` (`x-goog-api-key`), keep models whose `supportedGenerationMethods` has `generateContent` | `models/{m}:generateContent` with `tools.functionDeclarations` | Works | https://aistudio.google.com/app/apikey |
| Anthropic Claude | `GET https://api.anthropic.com/v1/models` | `POST /v1/messages` with `tools` and `tool_use` / `tool_result` blocks | Needs header `anthropic-dangerous-direct-browser-access: true` plus `x-api-key`, `anthropic-version: 2023-06-01` | https://console.anthropic.com/settings/keys |
| OpenAI | `GET https://api.openai.com/v1/models` (filter to chat models: gpt-*, o*, chatgpt-*) | `POST /v1/chat/completions` with `tools` (function) | Works | https://platform.openai.com/api-keys |
| OpenRouter | `GET https://openrouter.ai/api/v1/models` (has `supported_parameters` incl. `tools`) | `POST /api/v1/chat/completions` OpenAI style, headers `HTTP-Referer` and `X-Title: Flow Builder` | Works | https://openrouter.ai/keys |
| Custom OpenAI-compatible | `GET {baseUrl}/models` | `POST {baseUrl}/chat/completions` | Depends on provider (Groq, Together, DeepSeek, Mistral work from browsers in most cases; local Ollama needs `OLLAMA_ORIGINS`, LM Studio needs CORS enabled) | Shown per preset: Groq https://console.groq.com/keys, Together https://api.together.ai/settings/api-keys, DeepSeek https://platform.deepseek.com/api_keys, Mistral https://console.mistral.ai/api-keys, Ollama http://localhost:11434/v1 (no key) |

If a browser call fails with a network or CORS error, show: "This provider blocks calls from the browser. Try OpenRouter, or run a local proxy." Do not add a server proxy (Penny has none); ask Rayhan first if one is ever needed.

## Settings

- Section "AI providers": add one or more provider connections (provider, label, key, base URL and optional extra headers for Custom). Several keys per provider allowed. Stored in localStorage per uid (`fb:ai:{uid}:connections`), never in Firestore, never sent to our servers. Forget button per connection.
- After saving a key: fetch the model list, then ping each model with the Penny probe (tiny prompt, max 16 tokens, 12s timeout), concurrency 3, small delay between batches. Result per model: usable, or not usable with a reason: `no_access` (401/403/404), `quota` or `rate_limit` (429, check message), `needs_billing` (402 or billing text), `unsupported` (400 for non-chat models), `cors_blocked` (TypeError fetch failure), `timeout`, `error`. Cache in localStorage with a timestamp; "Re-check" button per connection and per model. Mark tool support (Gemini: assume yes for 1.5+/2.x; OpenRouter: `supported_parameters` includes `tools`; OpenAI: gpt-4o, gpt-4.1, o-series yes; Anthropic: all claude-3+ yes; Custom: try a tool ping once and record).
- Missing key prompt (dashboard AI panel, editor chat, AI Create): card listing the providers with "Get a key" links (table above) and a quick add form.

## Model switcher

- In the dashboard AI panel and the editor AI chat: a compact dropdown grouped by provider, usable models first (with a small "Tools" badge), unusable ones collapsed under "Not available" with the reason. Search box for long lists (OpenRouter). Selected model remembered per user (localStorage, and `users/{uid}.settings.aiModel` without any key).

## One provider interface

```ts
interface LLMProvider {
  id: 'gemini' | 'anthropic' | 'openai' | 'openrouter' | 'custom'
  listModels(conn): Promise<ModelInfo[]>
  ping(conn, model): Promise<PingResult>
  chat(conn, req: { model, system, messages: AgentMessage[], tools?: ToolDecl[] }): Promise<{ text?: string, toolCalls?: { id, name, args }[] }>
}
```

- Normalised message format with tool calls and tool results; adapters map to Gemini functionCall/functionResponse, OpenAI tool_calls/tool messages, Anthropic tool_use/tool_result.
- Tool declarations come from `shared/tools` zod schemas (JSON Schema, cleaned per provider).
- Fallback for models without tools: JSON-mode prompt that returns `{ "tool": name, "args": {...} }` or the existing replace/ops JSON, validated with zod.
- The existing Gemini-only code is refactored onto this interface. The agent loop (max 12 steps, Stop, destructive confirm) is unchanged and works with any provider.

## Tests

Vitest with mocked `fetch`: model listing per provider (incl. filters), ping reason mapping (401, 402, 403, 404, 429 quota vs rate limit, 400, network error, timeout), concurrency limit, cache and re-check, tool call mapping round trips per provider, fallback JSON mode, Anthropic browser header present, Custom provider base URL and headers.
