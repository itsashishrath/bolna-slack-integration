from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, HttpUrl, field_validator


# ── Slack config ─────────────────────────────────────────────────────────────

class ConfigRequest(BaseModel):
    slack_webhook_url: HttpUrl

    @field_validator("slack_webhook_url")
    @classmethod
    def must_be_slack_url(cls, v: HttpUrl) -> HttpUrl:
        if "hooks.slack.com" not in str(v):
            raise ValueError("slack_webhook_url must be a valid Slack Incoming Webhook URL")
        return v


class ConfigResponse(BaseModel):
    slack_webhook_url: str
    configured_at: str
    last_call_id: Optional[str] = None


# ── Bolna config / agents / calls ─────────────────────────────────────────────

class BolnaApiKeyRequest(BaseModel):
    bolna_api_key: str


class AgentSummary(BaseModel):
    id: str
    agent_name: str


class SetupWebhookRequest(BaseModel):
    agent_id: str


class SetupWebhookResponse(BaseModel):
    state: str
    status: str


class InitiateCallRequest(BaseModel):
    agent_id: str


# ── Bolna post-call webhook payload ───────────────────────────────────────────

class BolnaWebhookPayload(BaseModel):
    id: str
    agent_id: str
    conversation_duration: float
    transcript: str

    # Optional Bolna fields — not used by this integration
    status: Optional[str] = None
    total_cost: Optional[float] = None
    batch_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    usage_breakdown: Optional[dict] = None
    cost_breakdown: Optional[dict] = None
    provider: Optional[str] = None
    error_message: Optional[str] = None
    summary: Optional[str] = None


# ── Generic ───────────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
