# Bolna → Slack Call Alert Integration

A lightweight FastAPI middleware that listens for Bolna post-call webhooks and forwards a formatted alert to a Slack channel — including call ID, agent ID, duration, and full transcript.

---

## Demo

> 📹 **[Watch the walkthrough on Loom](#)**  
> *(replace `#` with your Loom recording URL before publishing)*

---

## How It Works

```
Bolna Call Ends
      ↓
Bolna POSTs webhook to  POST /webhook
      ↓
Server validates payload (status must be "completed")
      ↓
Deduplication check  →  call ID already in config.json? skip.
      ↓
Builds Slack Block Kit message (multi-part if transcript is long)
      ↓
POSTs to Slack with retry logic (3 attempts, exponential backoff)
      ↓
Saves call ID to config.json  →  alert appears in #bolna-alerts
```

---

## Features

| Feature | Detail |
|---|---|
| **Status filter** | Only processes webhooks where `status == "completed"` — ignores failed or in-progress calls |
| **Idempotent delivery** | Persists the last processed `call_id` in `config.json`; duplicate webhook deliveries from Bolna are silently dropped, even across server restarts |
| **Smart transcript splitting** | Transcript is split at sentence boundaries (`.`, `!`, `?`) into chunks ≤ 3 000 chars (Slack's block limit) and sent as sequential messages — no hard truncation |
| **Retry with backoff** | Each Slack POST is retried up to 3 times with exponential backoff (1 s → 2 s → 4 s) before returning a 502 |
| **Persistent config** | Slack webhook URL is saved to `storage/config.json` on disk — survives server restarts with no re-configuration |
| **Clean validation** | Pydantic v2 validates all incoming payloads; non-Slack URLs are rejected at the schema level |

---

## Project Structure

```
bolna-slack-integration/
├── main.py                  # FastAPI app, router registration, logging, uvicorn entry
├── routes/
│   ├── config.py            # POST /config  •  GET /config  •  shared config helpers
│   └── webhook.py           # POST /webhook — receives Bolna payload, sends Slack alert
├── services/
│   └── slack.py             # Block Kit builder, sentence splitter, retry sender
├── models/
│   └── schemas.py           # Pydantic v2 models for all requests and responses
├── storage/
│   └── config.json          # Auto-created on first POST /config (gitignored)
├── .env                     # Local env vars — never committed (gitignored)
├── .env.example             # Safe template to commit
├── requirements.txt
└── README.md
```

---

## Setup

### 1. Clone & install

```bash
git clone <your-repo-url>
cd bolna-slack-integration

python -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
```

`.env` contents:

```
PORT=8000
```

### 3. Start the server

```bash
uvicorn main:app --reload --port 8000
```

Server is available at `http://localhost:8000`. The interactive API docs are at `http://localhost:8000/docs`.

### 4. Save your Slack webhook URL

```bash
curl -X POST http://localhost:8000/config \
  -H "Content-Type: application/json" \
  -d '{"slack_webhook_url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"}'
```

This writes `storage/config.json`:

```json
{
  "slack_webhook_url": "https://hooks.slack.com/services/...",
  "configured_at": "2026-04-28T10:30:00+00:00",
  "last_call_id": null
}
```

### 5. Verify config

```bash
curl http://localhost:8000/config
```

### 6. Expose with ngrok

```bash
ngrok http 8000
```

Copy the public URL (e.g. `https://abc123.ngrok.io`) and paste it into Bolna:  
**Agent Settings → Post-call Webhook → `https://abc123.ngrok.io/webhook`**

### 7. Make a call

Trigger a call from the Bolna platform. When it ends, the alert appears in your Slack channel within a few seconds.

---

## API Reference

### `POST /config`

Save the Slack Incoming Webhook URL. Must be called once before `/webhook` can function.

**Request**
```json
{ "slack_webhook_url": "https://hooks.slack.com/services/T.../B.../XXX" }
```

**Responses**

| Status | Body |
|---|---|
| `200` | `{ "message": "Config saved successfully" }` |
| `422` | Pydantic validation error (missing field or non-Slack URL) |

---

### `GET /config`

Returns the current saved configuration.

**Response**
```json
{
  "slack_webhook_url": "https://hooks.slack.com/services/...",
  "configured_at": "2026-04-28T10:30:00+00:00",
  "last_call_id": "aad925bf-0e23-4481-813b-7b92b518a17a"
}
```

| Status | Body |
|---|---|
| `200` | Config object |
| `404` | `{ "detail": "No config found. Call POST /config first." }` |

---

### `POST /webhook`

The URL you register in Bolna. Bolna calls this automatically after every call ends.

**Bolna payload fields used**

| Field | Source in payload | Description |
|---|---|---|
| `id` | `payload.id` | Unique call UUID |
| `agent_id` | `payload.agent_id` | Bolna agent that handled the call |
| `duration` | `payload.conversation_duration` | Call length in seconds |
| `transcript` | `payload.transcript` | Full agent / user conversation |
| `status` | `payload.status` | Must be `"completed"` to be forwarded |

**Responses**

| Status | Body |
|---|---|
| `200` | `{ "message": "Slack alert sent successfully" }` |
| `200` | `{ "message": "Call status 'failed' — skipped" }` (non-completed call) |
| `200` | `{ "message": "Duplicate call — already forwarded to Slack" }` (same call ID seen before) |
| `422` | Pydantic validation error (missing required fields) |
| `502` | `{ "detail": "Failed to send Slack alert after 3 retries" }` |
| `503` | `{ "detail": "Integration not configured. Call POST /config first." }` |

**Test it manually**

```bash
curl -X POST http://localhost:8000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "aad925bf-0e23-4481-813b-7b92b518a17a",
    "agent_id": "8490354d-58c4-408e-a000-6060746207d3",
    "conversation_duration": 77.8,
    "transcript": "assistant: Hi, this is a demo call.\nuser: Hello!\nassistant: How can I help?",
    "status": "completed"
  }'
```

---

### `GET /`

Health check.

```json
{ "status": "ok", "service": "bolna-slack-integration" }
```

---

## Slack Alert Format

The first message contains the call summary and the opening transcript chunk. If the transcript spans more than 3 000 characters, additional messages are sent automatically, each labelled `Transcript (2/3)`, `Transcript (3/3)`, etc.

```
┌─ Bolna Call Ended ───────────────────────────────┐
│                                                   │
│  Call ID:   aad925bf-0e23-4481-813b-7b92b518a17a │
│  Agent ID:  8490354d-58c4-408e-a000-6060746207d3  │
│  Duration:  77.8 seconds                          │
│                                                   │
│  Transcript                                       │
│  ┌─────────────────────────────────────────────┐ │
│  │ assistant: Hi, this is a demo call.         │ │
│  │ user: Hello!                                │ │
│  │ assistant: How can I help?                  │ │
│  └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Webhook received but no config saved | `503` — prompt to call `POST /config` |
| Call status is not `"completed"` | `200` — skipped, nothing sent to Slack |
| Same call ID received twice | `200` — skipped (idempotent), `last_call_id` in config prevents re-processing even after restart |
| Slack is down or returns an error | Retried 3× with 1 s / 2 s / 4 s delays, then `502` |
| Bolna payload missing required fields | `422` Unprocessable Entity from Pydantic automatically |
| `config.json` is corrupted | `500` with descriptive error, issue logged server-side |

---

## Dependencies

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `pydantic` v2 | Request / response validation |
| `httpx` | Async HTTP client for Slack requests |
| `python-dotenv` | Loads `.env` into environment variables |
