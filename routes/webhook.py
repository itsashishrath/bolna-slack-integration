from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from models.schemas import BolnaWebhookPayload, MessageResponse
from services.slack import send_slack_alert

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhook"])

_CONFIG_PATH = Path("storage/config.json")

# In-memory deduplication — resets on restart, which is fine since
# duplicate deliveries from Bolna happen within the same session window.
_seen_call_ids: set[str] = set()
_MAX_SEEN = 500  # cap to prevent unbounded growth; evict all when hit


def _is_duplicate(call_id: str) -> bool:
    global _seen_call_ids
    if call_id in _seen_call_ids:
        return True
    if len(_seen_call_ids) >= _MAX_SEEN:
        _seen_call_ids = set()
    _seen_call_ids.add(call_id)
    return False


def _get_slack_url() -> str:
    if not _CONFIG_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="Integration not configured. Call POST /config first.",
        )
    try:
        data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
        return data["slack_webhook_url"]
    except (json.JSONDecodeError, KeyError) as exc:
        logger.error("Failed to read slack_webhook_url from config: %s", exc)
        raise HTTPException(status_code=500, detail="config.json is corrupted.")


@router.post("/webhook", response_model=MessageResponse)
async def receive_webhook(payload: BolnaWebhookPayload) -> MessageResponse:
    # Only forward calls that Bolna marked as completed
    if payload.status != "completed":
        logger.info(
            "Skipping call_id=%s — status=%r (not completed)", payload.id, payload.status
        )
        return MessageResponse(message=f"Call status '{payload.status}' — skipped")

    # Drop duplicate deliveries for the same call
    if _is_duplicate(payload.id):
        logger.warning("Duplicate call_id=%s — skipping", payload.id)
        return MessageResponse(message="Duplicate call — already forwarded to Slack")

    slack_url = _get_slack_url()

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

    return MessageResponse(message="Slack alert sent successfully")
