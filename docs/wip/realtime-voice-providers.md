# Realtime voice providers

Provider abstraction over realtime voice, so the copilot's voice mode is not
hardwired to OpenAI Realtime. Ported from the legacy monorepo, where it was
built and merged but never reached this repo.

## Why

Two independent problems, often conflated:

- **Accent / pronunciation** is a TTS problem. OpenAI's German is generic
  Hochdeutsch; ElevenLabs has real Austrian/Bavarian voices.
- **Word choice** (Jänner, Sackerl, Erdäpfel, Grüß Gott) is an LLM-instruction
  problem, independent of the provider.

The second half is solved by a provider-neutral instruction layer
(`voiceRegisterInstructions` / `composeVoiceInstructions`, `de-AT|de-DE|de-CH`),
so the register applies on OpenAI too.

## Shape

`RealtimeVoiceProvider` returns a tagged `RealtimeSessionDescriptor`; the route
never switches on a provider name, it resolves through a registry
(`createRealtimeProviderRegistry`, one small file per provider).

Two session kinds:

| kind | path | barge-in | notes |
|------|------|----------|-------|
| `webrtc-direct` | browser ⇄ OpenAI over WebRTC | vendor owns it | lowest latency |
| `server-cascade` | browser ⇄ our WS ⇄ Voxtral STT → Mastra agent → ElevenLabs TTS | we own it | ~200–400 ms more latency |

The cascade WS is authenticated with HMAC-signed tickets (60 s TTL). The
frontend consumes one normalized `RealtimeVoiceEvent` stream, so the session
hook knows no vendor event names.

## Configuration

- **Provider choice is per tenant** — `ai.config.realtime_voice.provider`,
  edited on Settings → AI → Voice. The legacy `mistral` value normalizes
  forward to `voxtral-elevenlabs`.
- **Credentials are installation-wide** — `MISTRAL_API_KEY` and
  `ELEVENLABS_API_KEY` are `configurable: "platform"` secrets contributed by
  `modules/engenty-copilot`, so they are editable in Setup → Platform and
  hydrated into `process.env` at apps/ai boot.
- The cascade provider registers **only** when both keys resolve. Otherwise a
  tenant that selected it gets a clean HTTP 501 rather than a broken session.
  Default stays `openai`.
- **Dropdown catalogs** — `GET /ai/v1/realtime/voice-options` returns curated
  STT/TTS/OpenAI model+voice lists plus ElevenLabs voices proxied via
  `GET https://api.elevenlabs.io/v1/voices` (platform key stays on the server).
  Settings → AI → Voice renders these as selects; a missing/invalid ElevenLabs
  key surfaces as `elevenlabs_voices_error` instead of an empty silent list.

## Deferred

- **Live vendor smoke test.** Voxtral WS auth/protocol now matches the current
  Mistral realtime SDK (`Authorization` header + `?model=` + `session.created`
  / `session.update`). Still verify end-to-end with a real mic against
  ElevenLabs TTS (key needs `voices_read` + `text_to_speech`) before treating
  a tenant as GA. Override URL via `MISTRAL_REALTIME_TRANSCRIBE_URL` if needed.
- Latency + barge-in measurement gate before treating the cascade as GA.
- Chatbot embed still has its own voice path; unify it onto the registry.
- Streaming agent text deltas into the cascade TTS leg (today the turn is
  synthesized after the agent finishes).
- AudioWorklet / MediaSource playback for the cascade audio path.
