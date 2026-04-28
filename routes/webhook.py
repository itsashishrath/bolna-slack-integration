from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from models.schemas import BolnaWebhookPayload, MessageResponse
from routes.config import _load_raw, update_last_call_id
from services.slack import send_slack_alert

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhook"])


def _get_slack_url_for_agent(agent_id: str) -> str:
    """Look up the Slack webhook URL for a specific agent. Raises 503 if not configured."""
    data = _load_raw()
    if not data:
        raise HTTPException(
            status_code=503,
            detail="Integration not configured. Set up your Bolna API key and agent Slack webhooks.",
        )
    agents = data.get("agents", {})
    agent_cfg = agents.get(agent_id)
    if not agent_cfg or not agent_cfg.get("slack_webhook_url"):
        raise HTTPException(
            status_code=503,
            detail=f"No Slack webhook configured for agent {agent_id}. Configure it via POST /config/agent.",
        )
    return agent_cfg["slack_webhook_url"]


def _is_duplicate(call_id: str) -> bool:
    data = _load_raw()
    return data is not None and data.get("last_call_id") == call_id


@router.post("/webhook", response_model=MessageResponse)
async def receive_webhook(payload: BolnaWebhookPayload) -> MessageResponse:
    if payload.status != "completed":
        logger.info(
            "Skipping call_id=%s — status=%r (not completed)", payload.id, payload.status
        )
        return MessageResponse(message=f"Call status '{payload.status}' — skipped")

    if _is_duplicate(payload.id):
        logger.warning("Duplicate call_id=%s — skipping", payload.id)
        return MessageResponse(message="Duplicate call — already forwarded to Slack")

    slack_url = _get_slack_url_for_agent(payload.agent_id)

    try:
        await send_slack_alert(
            webhook_url=slack_url,
            call_id=payload.id,
            agent_id=payload.agent_id,
            duration=payload.conversation_duration,
            transcript=payload.transcript,
        )
    except RuntimeError:
        raise HTTPException(
            status_code=502,
            detail="Failed to send Slack alert after 3 retries",
        )

    update_last_call_id(payload.id)
    return MessageResponse(message="Slack alert sent successfully")
