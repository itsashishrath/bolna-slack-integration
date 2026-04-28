


Bolna → Slack
Call Alert Integration
Technical Documentation & Project Reference


Built with FastAPI • Python • Slack Incoming Webhooks


 
1. Overview


This integration creates a middleware server between Bolna Voice AI and Slack. Whenever a Bolna call ends, Bolna sends a POST request to this server (webhook receiver). The server then extracts the relevant call data and posts a formatted alert to a configured Slack channel.

1.1 Problem Statement
Send a Slack alert whenever a Bolna call ends containing the following fields:
•	id — Unique call identifier
•	agent_id — The Bolna agent that handled the call
•	duration — Total call duration in seconds (conversation_duration from payload)
•	transcript — Full conversation transcript between agent and user

1.2 Integration Flow

Bolna Call Ends
↓
Bolna POSTs webhook payload to /webhook
↓
FastAPI Server receives & validates payload
↓
Extracts: id, agent_id, duration, transcript
↓
POSTs formatted Block Kit message to Slack
↓
Alert appears in #bolna-alerts Slack channel

2. Project Structure


The project follows a clean separation of concerns — each responsibility lives in its own file.

Path	Purpose
bolna-slack-integration/	Root project folder
├── main.py	FastAPI app entry point, registers all routers
├── routes/	Folder containing all endpoint route files
│   ├── config.py	POST /config and GET /config endpoints
│   └── webhook.py	POST /webhook endpoint (Bolna receiver)
├── services/	Folder for business logic
│   └── slack.py	Slack message formatting & sending logic
├── models/	Pydantic request/response models
│   └── schemas.py	ConfigRequest, WebhookPayload schemas
├── storage/	Persistent config storage
│   └── config.json	Auto-created on first POST /config call
├── .env	Environment variables (never commit this)
├── .env.example	Template for .env — safe to commit
├── requirements.txt	Python dependencies
└── README.md	Setup and usage instructions

3. API Endpoints


Method	Endpoint	Purpose
POST	/config	Save the Slack webhook URL to config.json
GET	/config	Retrieve the current saved configuration
POST	/webhook	Receives Bolna post-call payload, sends Slack alert

3.1  POST /config
Saves the Slack Incoming Webhook URL into config.json on disk. This must be called once before the webhook endpoint can function.

Request Body
Content-Type: application/json

{
"slack_webhook_url": "https://hooks.slack.com/services/T.../B.../XXX"
}
Response
200 OK  →  { "message": "Config saved successfully" }
400 Bad Request  →  { "detail": "slack_webhook_url is required" }

3.2  GET /config
Returns the currently saved configuration. Useful to verify the setup is correct before testing the webhook.

Response
{
"slack_webhook_url": "https://hooks.slack.com/services/T.../B.../XXX",
"configured_at": "2026-04-28T10:30:00Z"
}
404 Not Found  →  { "detail": "No config found. Call POST /config first." }

3.3  POST /webhook
This is the URL you paste into Bolna's post-call webhook setting. Bolna will automatically POST to this endpoint after every call ends. The server extracts the four required fields and sends a formatted Slack Block Kit message.

Fields Extracted from Bolna Payload

Field	Source in Payload	Description
id	payload.id	Unique call UUID e.g. aad925bf-0e23-...
agent_id	payload.agent_id	The Bolna agent that handled the call
duration	payload.conversation_duration	Call duration in seconds e.g. 77.8
transcript	payload.transcript	Full agent/user conversation text

What Happens Internally
•	Validates the incoming payload using Pydantic schema
•	Reads slack_webhook_url from config.json
•	Builds a Slack Block Kit message with all 4 fields
•	POSTs the message to Slack with retry logic (3 attempts, exponential backoff)
•	Returns 200 if Slack accepted it, 502 if Slack failed after all retries

Response
200 OK  →  { "message": "Slack alert sent successfully" }
502 Bad Gateway  →  { "detail": "Failed to send Slack alert after 3 retries" }
503 Service Unavailable  →  { "detail": "Integration not configured. Call POST /config first." }

4. Bolna Webhook Payload Reference


Below is the real payload received from Bolna after a call ends. The highlighted fields are the ones this integration uses.

Key	Type	Used?	Description
id	string (UUID)	YES	Unique call identifier
agent_id	string (UUID)	YES	Bolna agent that handled the call
conversation_duration	float	YES (as 'duration')	Call length in seconds
transcript	string	YES	Full conversation between agent and user
status	string	No	Completion status e.g. 'completed'
total_cost	float	No	Total cost of the call in credits
batch_id	string | null	No	Batch campaign identifier if applicable
created_at	datetime	No	Timestamp when call was created
updated_at	datetime	No	Timestamp of last update
usage_breakdown	object	No	LLM, ASR, TTS token/cost breakdown
cost_breakdown	object	No	Detailed cost per service
provider	string	No	e.g. 'web-call', 'twilio'
error_message	string | null	No	Error details if call failed
summary	string | null	No	AI-generated call summary if enabled

5. Slack Alert Format


The Slack message uses Block Kit for rich formatting. Here is what the alert looks like in the Slack channel:

Bolna Call Ended
──────────────────────────────
Call ID:     aad925bf-0e23-4481-813b-7b92b518a17a
Agent ID:  8490354d-58c4-408e-a000-6060746207d3
Duration:  77.8 seconds
──────────────────────────────
Transcript
assistant: Hi, this is a demo call from Bolna
user: hi how are you doing
assistant: Hello! I'm doing great...
[ transcript truncated to 2000 chars in Slack ]

Note: Transcript is truncated to 2000 characters in the Slack message to stay within Slack's block text limits. The full transcript is always received and logged server-side.

6. File Responsibilities


main.py
The FastAPI application entry point. Creates the app instance, includes routers from routes/config.py and routes/webhook.py, and defines a root health check endpoint GET / that returns a simple status response.

routes/config.py
Contains two endpoints — POST /config and GET /config. Handles reading and writing to storage/config.json. Uses Pydantic model ConfigRequest for input validation. Returns appropriate HTTP errors if config is missing or invalid.

routes/webhook.py
Contains the POST /webhook endpoint. Accepts the Bolna post-call payload, reads the config to get the Slack URL, then calls services/slack.py to send the alert. Handles the case where config has not been set yet.

services/slack.py
Contains all Slack-related logic — building the Block Kit message payload and sending it via HTTP POST to the Slack Incoming Webhook URL. Implements retry logic with exponential backoff (3 retries, delays of 1s, 2s, 4s). Raises an exception if all retries are exhausted.

models/schemas.py
Pydantic models for request validation. Includes ConfigRequest (slack_webhook_url field) and BolnaWebhookPayload (id, agent_id, conversation_duration, transcript, and other optional Bolna fields). Keeps validation clean and separate from routing logic.

storage/config.json
A simple JSON file on disk that persists the Slack webhook URL across server restarts. It is auto-created the first time POST /config is called. The file is in .gitignore since it may contain sensitive webhook URLs.

.env / .env.example
The .env file stores the server port and any other environment-level settings. It is never committed to version control. The .env.example file is a safe template showing what variables are needed, committed as documentation for other developers.

7. Dependencies


Package	Version	Purpose
fastapi	latest	Web framework for building the API server
uvicorn	latest	ASGI server to run the FastAPI app
pydantic	v2	Request/response data validation and schemas
httpx	latest	Async HTTP client for sending Slack POST requests
python-dotenv	latest	Loads .env file into environment variables

8. Setup Instructions


Step 1 — Clone & Install
git clone <your-repo-url>
cd bolna-slack-integration
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

Step 2 — Configure Environment
Copy the example env file and set your port:
cp .env.example .env

Contents of .env:
PORT=8000

Step 3 — Start the Server
uvicorn main:app --reload --port 8000
Server will be available at http://localhost:8000

Step 4 — Configure Slack Webhook
Call POST /config with your Slack Incoming Webhook URL:
curl -X POST http://localhost:8000/config \
  -H "Content-Type: application/json" \
  -d '{"slack_webhook_url": "https://hooks.slack.com/services/YOUR/URL"}'

Step 5 — Verify Config
curl http://localhost:8000/config

Step 6 — Expose with ngrok (for Bolna webhook)
ngrok http 8000
Copy the ngrok public URL e.g. https://abc123.ngrok.io
Paste this into Bolna platform under Agent Settings > Post-call Webhook:
https://abc123.ngrok.io/webhook

Step 7 — Test by Making a Call
Trigger a call from the Bolna platform or use the Bolna API. When the call ends, Bolna will hit your /webhook endpoint and you should see an alert appear in your Slack channel within a few seconds.

9. Error Handling & Retry Logic


Scenario	Behaviour
Bolna sends webhook but no config set	Returns 503 with message to call POST /config first
Slack webhook URL is invalid	Retry 3 times with backoff, then return 502 to Bolna
Slack is temporarily down	Retry 3 times (1s, 2s, 4s delays), then return 502
Bolna payload is missing required fields	Pydantic returns 422 Unprocessable Entity automatically
config.json is corrupted	Returns 500 with descriptive error, logs the issue
Server restarts	Config persists via config.json, no re-configuration needed

10. Testing the Webhook Manually


You can simulate a Bolna webhook call locally using curl with the exact payload structure Bolna sends:

curl -X POST http://localhost:8000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "aad925bf-0e23-4481-813b-7b92b518a17a",
    "agent_id": "8490354d-58c4-408e-a000-6060746207d3",
    "conversation_duration": 77.8,
    "transcript": "assistant: Hi\nuser: Hello\nassistant: How can I help?",
    "status": "completed"
  }'

If configured correctly, a Slack alert will appear in your channel within 1-2 seconds.



Bolna → Slack Integration • Integration Engineer Assessment
