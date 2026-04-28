# Bolna → Slack Call Alert Integration

A FastAPI middleware and React dashboard that connects Bolna Voice AI to Slack. When a call ends, the server receives the Bolna post-call webhook, looks up the Slack channel configured for that agent, and posts a formatted alert with call ID, agent ID, duration, and full transcript.

---

## Live Demo

> 🌐 **[bolna-slack-integration.vercel.app](https://bolna-slack-integration.vercel.app/)**

> 📹 **[Watch the walkthrough on Loom](#)**  
> *(replace `#` with your Loom recording URL)*

---

## How It Works

```
Dashboard: enter Bolna API key
      ↓
Fetch all agents from Bolna API  →  list shown in dashboard
      ↓
Set a Slack Incoming Webhook URL for each agent
      ↓  (happens automatically in the same request)
Server PATCHes Bolna agent with this server's /webhook URL
      ↓
──────────── call time ────────────
Bolna Call Ends
      ↓
Bolna POSTs payload to  POST /webhook
      ↓
Server checks: status == "completed"? duplicate call ID?
      ↓
Looks up Slack webhook URL for that agent from config.json
      ↓
Builds Slack Block Kit message — splits at sentence boundaries
      ↓
POSTs to Slack (3 retries, exponential backoff)
      ↓
Saves call ID to config.json  →  alert appears in Slack channel
```

---

## Features

| Feature | Detail |
|---|---|
| **Bolna API key management** | API key is saved in `config.json` and used to authenticate all Bolna API calls. For testing you can swap keys to simulate different users; in a production deployment this would be replaced by Bolna's OAuth / auth token flow |
| **Agent discovery** | Fetches all agents from the Bolna API (`GET /v2/agent/all`) and presents them in the dashboard — no manual copy-pasting of agent IDs |
| **Automatic Bolna webhook setup** | When you save a Slack URL for an agent, the server immediately PATCHes that agent on Bolna (`PATCH /v2/agent/{id}`) to point its post-call webhook at `SERVER_HOST/webhook` — no manual Bolna dashboard step needed |
| **Per-agent Slack channels** | Each agent can route call alerts to a different Slack channel. All mappings are stored in `config.json` under an `agents` key |
| **Status filter** | Only processes webhooks where `status == "completed"` — ignores failed or in-progress calls |
| **Idempotent delivery** | Persists the last processed `call_id` in `config.json`; duplicate webhook deliveries are silently dropped even across server restarts |
| **Smart transcript splitting** | Transcript is split at sentence boundaries (`.`, `!`, `?`) into chunks ≤ 3 000 chars (Slack's block limit) and sent as sequential messages — no hard truncation |
| **Retry with backoff** | Each Slack POST is retried up to 3 times with exponential backoff (1 s → 2 s → 4 s) before returning a 502 |
| **Persistent config** | All configuration lives in `storage/config.json` — survives server restarts with no re-configuration |
| **Full reset** | A single API call (`DELETE /config/reset`) wipes everything back to a clean state |

---

## Project Structure

```
bolna-slack-integration/
├── main.py                  # FastAPI app, CORS middleware, router registration
├── routes/
│   ├── config.py            # Config CRUD, auto Bolna webhook setup, GET /status, reset
│   ├── webhook.py           # POST /webhook — receives Bolna payload, sends Slack alert
│   └── bolna.py             # Bolna API key, agent listing, call initiation
├── services/
│   ├── slack.py             # Block Kit builder, sentence splitter, retry sender
│   └── bolna.py             # Bolna API client (agents, webhook PATCH, call initiation)
├── models/
│   └── schemas.py           # Pydantic v2 models for all requests and responses
├── storage/
│   └── config.json          # Auto-created, gitignored — stores all runtime config
├── frontend/                # React + Vite dashboard
│   └── src/
│       ├── App.jsx           # Stage-based routing: setup → dashboard
│       ├── api/client.js     # All fetch calls to the backend
│       ├── components/       # BolnaSetupScreen, AgentSetupScreen, DashboardScreen, …
│       └── styles.css
├── .env                     # Local env vars — never committed
├── .env.example             # Safe template
├── requirements.txt
└── README.md
```

---

## config.json structure

`storage/config.json` is the single source of truth for all runtime state. It is created automatically on first use and is excluded from version control.

```json
{
  "bolna_api_key": "bn-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "bolna_api_key_set_at": "2026-04-29T10:00:00+00:00",
  "last_call_id": "aad925bf-0e23-4481-813b-7b92b518a17a",
  "agents": {
    "8490354d-58c4-408e-a000-6060746207d3": {
      "slack_webhook_url": "https://hooks.slack.com/services/T.../B.../XXX",
      "configured_at": "2026-04-29T10:05:00+00:00"
    },
    "another-agent-uuid": {
      "slack_webhook_url": "https://hooks.slack.com/services/T.../B.../YYY",
      "configured_at": "2026-04-29T10:06:00+00:00"
    }
  }
}
```

---

## Setup

### 1. Clone & install

```bash
git clone <your-repo-url>
cd bolna-slack-integration

python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
```

`.env` contents:

```
PORT=8000
CORS_ORIGINS=

# Public URL of this server — used to build the /webhook URL sent to Bolna
# e.g. https://abc123.ngrok-free.app  (no trailing slash)
SERVER_HOST=

# Phone number Bolna will call when POST /bolna/call is triggered
# E.164 format e.g. +919876543210
RECIPIENT_PHONE_NUMBER=
```

### 3. Start the server

```bash
uvicorn main:app --reload --port 8000
```

Server: `http://localhost:8000` · Docs: `http://localhost:8000/docs`

### 4. Expose with ngrok

```bash
ngrok http 8000
```

Copy the public URL (e.g. `https://abc123.ngrok-free.app`) and set it as `SERVER_HOST` in `.env`.

### 5. Use the dashboard

Open the frontend (or the live demo at [bolna-slack-integration.vercel.app](https://bolna-slack-integration.vercel.app/)) and follow the two-step setup:

**Step 1 — Bolna API Key**  
Enter your Bolna API key (`bn-xxx…`). The key is stored in `config.json` and used for all subsequent Bolna API calls. To test with a different Bolna account, update the key here or hit **Reset** to start over.

**Step 2 — Configure Agents**  
The dashboard fetches all your Bolna agents and lists them. For each agent, paste a Slack Incoming Webhook URL. When you save:
- The Slack URL is written to `config.json` under that agent's ID
- The server automatically PATCHes the Bolna agent to point its post-call webhook at `SERVER_HOST/webhook` — no Bolna dashboard step required

Once at least one agent is configured, you can proceed to the main dashboard.

---

## API Reference

### `GET /`

Health check.

```json
{ "status": "ok", "service": "bolna-slack-integration" }
```

### `GET /status`

Returns the current configuration state — used by the frontend to decide which setup screen to show.

```json
{
  "bolna_configured": true,
  "any_agent_configured": true,
  "configured_agent_ids": ["8490354d-..."]
}
```

---

### `POST /bolna/api-key`

Save the Bolna API key.

```json
{ "bolna_api_key": "bn-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

> **Note on authentication:** This endpoint is designed for demo and testing use — any caller can set the API key. In a production system this would be replaced by Bolna's OAuth flow, and the token would be scoped to the authenticated user rather than stored in a flat file.

---

### `GET /bolna/agents`

Fetch all agents from the Bolna API. Returns a trimmed list — only `id` and `agent_name`.

```json
[
  { "id": "8490354d-...", "agent_name": "Bolna Assessment" }
]
```

| Status | Meaning |
|---|---|
| `200` | Agent list |
| `502` | Bolna API unreachable or returned an error |
| `503` | Bolna API key not configured |

---

### `POST /config/agent`

Save a Slack Incoming Webhook URL for a specific agent. This also automatically calls the Bolna API to register `SERVER_HOST/webhook` as that agent's post-call webhook.

```json
{ "agent_id": "8490354d-...", "slack_webhook_url": "https://hooks.slack.com/services/..." }
```

| Status | Body |
|---|---|
| `200` | `{ "message": "Slack webhook saved for agent <id>" }` |
| `422` | Validation error (non-Slack URL, missing fields) |

> If `SERVER_HOST` is not set in `.env`, the Slack URL is still saved but the Bolna webhook registration is skipped with a server-side warning.

---

### `GET /config/agents`

List all agents that have a Slack webhook configured.

```json
[
  {
    "agent_id": "8490354d-...",
    "slack_webhook_url": "https://hooks.slack.com/services/...",
    "configured_at": "2026-04-29T10:05:00+00:00"
  }
]
```

---

### `DELETE /config/agent/{agent_id}/slack`

Remove the Slack webhook configuration for a specific agent.

| Status | Body |
|---|---|
| `200` | `{ "message": "Slack webhook removed for agent <id>" }` |

---

### `DELETE /config/reset`

Wipe all configuration back to a clean state — clears the Bolna API key, all agent Slack URLs, and the last call ID.

| Status | Body |
|---|---|
| `200` | `{ "message": "Config reset successfully" }` |

---

### `POST /bolna/call`

Initiate an outbound call via Bolna.

```json
{ "agent_id": "8490354d-..." }
```

The recipient phone number is read from the `RECIPIENT_PHONE_NUMBER` environment variable.

| Status | Body |
|---|---|
| `200` | Raw Bolna API response |
| `500` | `RECIPIENT_PHONE_NUMBER` not set |
| `502` | Bolna API error |

---

### `POST /webhook`

The URL registered on Bolna agents. Called automatically by Bolna after every call ends.

**Fields extracted from payload**

| Field | Source | Description |
|---|---|---|
| `id` | `payload.id` | Unique call UUID |
| `agent_id` | `payload.agent_id` | Used to look up the correct Slack channel |
| `duration` | `payload.conversation_duration` | Call length in seconds |
| `transcript` | `payload.transcript` | Full agent / user conversation |
| `status` | `payload.status` | Must be `"completed"` to be forwarded |

**Responses**

| Status | Body |
|---|---|
| `200` | `{ "message": "Slack alert sent successfully" }` |
| `200` | `{ "message": "Call status 'failed' — skipped" }` |
| `200` | `{ "message": "Duplicate call — already forwarded to Slack" }` |
| `422` | Pydantic validation error |
| `502` | Slack unreachable after 3 retries |
| `503` | No Slack webhook configured for this agent |

**Test manually**

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

## Slack Alert Format

The first message contains the call summary and the opening transcript chunk. If the transcript exceeds 3 000 characters, additional messages follow automatically, labelled `Transcript (2/3)`, `Transcript (3/3)`, etc.

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
| Webhook received, agent has no Slack URL | `503` with agent ID in message |
| Call status is not `"completed"` | `200` — skipped silently |
| Same call ID delivered twice | `200` — skipped; `last_call_id` in config prevents replay across restarts |
| Slack is down | Retried 3× (1 s / 2 s / 4 s), then `502` |
| Invalid Bolna API key | `GET /bolna/agents` returns `502`; dashboard shows inline key-update form |
| Bolna payload missing required fields | `422` Unprocessable Entity from Pydantic |
| `config.json` corrupted | `500` with descriptive error logged server-side |
| Need to switch Bolna accounts | Hit **Reset** in the dashboard or call `DELETE /config/reset` |

---

## Dependencies

| Package | Purpose |
|---|---|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `pydantic` v2 | Request / response validation |
| `httpx` | Async HTTP client for Slack and Bolna API calls |
| `python-dotenv` | Loads `.env` into environment variables |
