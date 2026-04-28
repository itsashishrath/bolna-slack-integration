


Bolna → Slack Integration
Frontend Documentation
React • Component Breakdown • UI States • API Integration


 
1. Overview

The frontend is a single-page React application that acts as the configuration dashboard for the Bolna → Slack integration. It is not a full product UI — it is scoped intentionally to the integration setup flow only.

The user journey has exactly three stages in sequence:

Stage	What Happens	Next
Server Check	App pings GET / and waits until the server responds healthy	Moves to Stage 2 automatically
Config Check	App calls GET /config to see if a Slack webhook is already saved	Shows Setup or Current Config view
Ready	User is informed — calls ending on Bolna will trigger Slack alerts	User can edit or remove config anytime

Because the backend is hosted on Render's free tier, the server spins down after inactivity. The health check stage handles this gracefully — it keeps retrying and shows a clear waiting state so the user is never left confused.
 
2. Component Tree

The app is structured as a single root component that manages global state and renders one of three stage components based on the current flow stage.

Component	File	Responsibility
App	src/App.jsx	Root — owns stage state, fetches health + config on mount
ServerWakeScreen	src/components/ServerWakeScreen.jsx	Stage 1 — polls GET / until healthy, shows spinner + message
SetupScreen	src/components/SetupScreen.jsx	Stage 2a — shown when no config exists, collects Slack URL
ConfiguredScreen	src/components/ConfiguredScreen.jsx	Stage 2b — shown when config exists, displays current setup
EditModal	src/components/EditModal.jsx	Overlay — appears when user clicks Edit on ConfiguredScreen
StatusBadge	src/components/StatusBadge.jsx	Reusable — green/grey pill used across screens

All API calls live in a single utility file:

File	Contents
src/api/client.js	getHealth(), getConfig(), saveConfig() — all fetch wrappers with error handling

 
3. Stage 1 — Server Wake Check

This is the first thing the user sees when they open the app. The component immediately starts polling GET / and does not let the user proceed until it gets a healthy response.

3.1  Visual States

State	What the user sees
Waking (default)	Spinner + message: "Starting up the server, this may take up to 30 seconds..."
Still waiting (10s+)	Message updates: "Still starting up — Render's free tier takes a moment on first load..."
Error (30s+ no response)	Red message: "Server is taking longer than expected. Please refresh and try again."
Healthy	Screen fades out, app moves to Stage 2 automatically

3.2  Polling Logic

•	On mount: call GET / immediately
•	If response is 200 and body contains { status: 'ok' } → mark healthy, proceed
•	If request fails or returns non-200 → wait 3 seconds, retry
•	After 10 seconds of retries → update message to 'Still starting up...'
•	After 30 seconds → stop retrying, show timeout error state
•	On unmount: clear all timers and abort pending fetch

Do not show any error to the user on the first failed attempt — Render cold starts are expected and the user should just see a loading spinner. Only escalate the message after 10+ seconds.

3.3  Props
None. This component manages all its own state internally and calls onHealthy() from App when done.

Callback Prop	Type	Description
onHealthy	() => void	Called by ServerWakeScreen when GET / returns healthy

 
4. Stage 2a — Setup Screen (no config)

Shown when GET /config returns 404 — meaning no Slack webhook has been saved yet. This is the first-time setup experience.

4.1  Layout

•	Header: Bolna logo + integration title + grey 'Not configured' status badge
•	Intro section: one short paragraph explaining what this integration does
•	Instructions section: numbered steps explaining how to get a Slack Incoming Webhook URL (pointing to api.slack.com/apps)
•	Input section: a URL input field labelled 'Slack Incoming Webhook URL' with a Save button
•	Footer hint: small grey text 'Once saved, every completed Bolna call will trigger an alert in your Slack channel'

4.2  Input Behaviour

Interaction	Behaviour
Empty field, Save clicked	Show inline validation error: 'Please enter a webhook URL'
Invalid URL format	Show inline error: 'URL must start with https://hooks.slack.com/services/'
Valid URL, Save clicked	Button shows loading spinner, calls POST /config
POST /config success	Transition to ConfiguredScreen with a success toast: 'Slack integration enabled'
POST /config error	Show inline error below input with the server's error message

4.3  Props

Prop	Type	Description
onConfigSaved	(config) => void	Called after successful POST /config, passes config object back to App

 
5. Stage 2b — Configured Screen (config exists)

Shown when GET /config returns 200 — meaning a Slack webhook is already saved. This is the steady-state view the user sees on every subsequent visit.

5.1  Layout

•	Header: Bolna logo + integration title + green pulsing 'Active' status badge
•	Success banner: light green callout — 'Integration is active. Slack alerts are enabled for all completed calls.'
•	Current config card: shows the saved slack_webhook_url (masked after the third segment for security), configured_at timestamp, and last_call_id if present
•	Action row: two buttons — 'Change webhook' (opens EditModal) and 'Remove integration' (confirmation then DELETE or clear)
•	Webhook URL card: shows the POST /webhook URL with a Copy button — reminds the user to keep this pasted in Bolna agent settings
•	Info section: a small note explaining the integration behaviour (status filter, idempotency, transcript chunking)

5.2  Masking the Webhook URL
Display the saved Slack URL as: https://hooks.slack.com/services/T.../B.../•••••••• — show the first two path segments and mask the secret third segment. Never show the full token in the UI.

5.3  Remove Integration Flow

•	User clicks 'Remove integration'
•	Inline confirmation appears below the button: 'Are you sure? This will stop all Slack alerts.' with Confirm and Cancel
•	On Confirm: call DELETE /config (or POST /config with empty value depending on backend implementation), clear local state, transition back to SetupScreen
•	On Cancel: confirmation disappears, nothing changes

5.4  Props

Prop	Type	Description
config	ConfigObject	The config returned from GET /config
onEdit	(newConfig) => void	Called after EditModal saves a new URL
onRemove	() => void	Called after user confirms removal — App transitions back to SetupScreen

 
6. Edit Modal

A lightweight modal overlay triggered from the ConfiguredScreen when the user wants to change their Slack webhook URL. Reuses the same input + validation logic as SetupScreen.

6.1  Layout

•	Modal overlay with a semi-transparent dark background
•	Modal card: title 'Update Slack Webhook', current masked URL shown as read-only reference, new URL input field, Save and Cancel buttons

6.2  Behaviour

•	Opens as an overlay on top of ConfiguredScreen — does not navigate away
•	Same URL validation as SetupScreen (must start with https://hooks.slack.com/services/)
•	On Save: calls POST /config with new URL, closes modal, updates ConfiguredScreen with new config
•	On Cancel or outside-click: closes modal with no changes
•	Pressing Escape also closes the modal

Prop	Type	Description
currentUrl	string	Existing webhook URL — shown masked as reference
onSave	(newConfig) => void	Called after successful update
onClose	() => void	Called on Cancel, Escape, or outside-click

 
7. App Root — State & Flow

App.jsx owns the top-level state machine. It renders exactly one stage at a time based on the current state.

7.1  State Shape

State Variable	Type	Values
stage	string	'waking' | 'setup' | 'configured'
config	object | null	null until loaded from GET /config
serverHealthy	boolean	false until GET / returns ok

7.2  Flow Diagram

App mounts
↓
stage = 'waking'  →  ServerWakeScreen polls GET /
↓  GET / returns { status: 'ok' }
GET /config
404 → stage = 'setup'          200 → stage = 'configured'
↓
SetupScreen (save) → stage = 'configured'
ConfiguredScreen (remove) → stage = 'setup'


8. API Client — src/api/client.js

All fetch calls are centralised here. Components never call fetch directly — they import from this module. The base URL is read from an environment variable.

Function	Method + Endpoint	Returns
getHealth()	GET /	{ ok: boolean }
getConfig()	GET /config	{ ok: boolean, data: ConfigObject | null }
saveConfig(url)	POST /config	{ ok: boolean, data: ConfigObject | error }
clearConfig()	DELETE /config  (or POST with null)	{ ok: boolean }

Environment variable: VITE_API_BASE_URL — set to the Render deployed URL in production, http://localhost:8000 for local development.

All functions return a normalised { ok, data } shape so components never need to handle raw HTTP status codes. A 404 from GET /config is not an error — it returns { ok: false, data: null } and the App treats it as 'no config exists'.

 
9. Environment & Project Setup

9.1  Folder Structure

Path	Purpose
src/App.jsx	Root component — stage state machine
src/api/client.js	All API fetch functions
src/components/ServerWakeScreen.jsx	Stage 1 — health polling
src/components/SetupScreen.jsx	Stage 2a — first-time setup form
src/components/ConfiguredScreen.jsx	Stage 2b — current config display
src/components/EditModal.jsx	Edit webhook overlay
src/components/StatusBadge.jsx	Reusable active/inactive badge
.env	VITE_API_BASE_URL=http://localhost:8000
.env.production	VITE_API_BASE_URL=https://your-render-url.onrender.com

9.2  Environment Variables

Variable	Dev Value	Prod Value
VITE_API_BASE_URL	http://localhost:8000	https://your-app.onrender.com

9.3  CORS Note
The FastAPI backend must allow the frontend's origin. In main.py, add CORSMiddleware with the frontend's local dev URL (http://localhost:5173) and the production URL if hosted separately.

10. UX Behaviour Notes

Scenario	Expected Behaviour
User opens app for first time — server cold	ServerWakeScreen shows with spinner for up to 30s
Server responds after 8 seconds	Immediately proceeds to config check — no extra delay
Config already saved on return visit	Skips setup, lands directly on ConfiguredScreen
User enters wrong Slack URL	Inline error, no server call made — validated client-side first
User saves and Slack URL is invalid (server rejects)	Error message shown below input from server response
User clicks Edit, then Cancel	Modal closes, existing config is unchanged
User removes integration	Confirmation shown inline, on confirm transitions to SetupScreen
Server is down during config save	Show: 'Could not reach server. Is it still running?'


Bolna → Slack Integration • Frontend Documentation • Integration Engineer Assessment
