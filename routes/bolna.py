from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException

from models.schemas import (
    AgentSummary,
    BolnaApiKeyRequest,
    InitiateCallRequest,
    MessageResponse,
    SetupWebhookResponse,
)
from routes.config import _load_raw, _write_config
from services.bolna import get_all_agents, initiate_call, setup_agent_webhook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bolna", tags=["bolna"])


def _get_api_key() -> str:
    data = _load_raw()
    if not data or not data.get("bolna_api_key"):
        raise HTTPException(
            status_code=503,
            detail="Bolna API key not configured. Call POST /bolna/api-key first.",
        )
    return data["bolna_api_key"]


# ── POST /bolna/api-key ────────────────────────────────────────────────────────

@router.post("/api-key", response_model=MessageResponse)
def save_api_key(body: BolnaApiKeyRequest) -> MessageResponse:
    data = _load_raw() or {}
    data["bolna_api_key"] = body.bolna_api_key
    data["bolna_api_key_set_at"] = datetime.now(timezone.utc).isoformat()
    _write_config(data)
    logger.info("Bolna API key saved")
    return MessageResponse(message="Bolna API key saved successfully")


# ── GET /bolna/agents ──────────────────────────────────────────────────────────

@router.get("/agents", response_model=list[AgentSummary])
async def list_agents() -> list[AgentSummary]:
    api_key = _get_api_key()
    try:
        agents = await get_all_agents(api_key)
    except httpx.HTTPStatusError as exc:
        logger.error("Bolna returned %s fetching agents", exc.response.status_code)
        raise HTTPException(status_code=502, detail="Bolna API error while fetching agents.")
    except httpx.RequestError as exc:
        logger.error("Network error fetching agents: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach Bolna API.")

    return [AgentSummary(id=a["id"], agent_name=a["agent_name"]) for a in agents]


# ── POST /bolna/agents/{agent_id}/setup-webhook ────────────────────────────────

@router.post("/agents/{agent_id}/setup-webhook", response_model=SetupWebhookResponse)
async def setup_webhook(agent_id: str) -> SetupWebhookResponse:
    api_key = _get_api_key()

    server_host = os.getenv("SERVER_HOST", "").rstrip("/")
    if not server_host:
        raise HTTPException(
            status_code=500,
            detail="SERVER_HOST is not set in .env. Cannot build the webhook URL.",
        )

    webhook_url = f"{server_host}/webhook"

    try:
        result = await setup_agent_webhook(api_key, agent_id, webhook_url)
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Bolna returned %s setting webhook for agent %s",
            exc.response.status_code,
            agent_id,
        )
        raise HTTPException(status_code=502, detail="Bolna API error while updating agent.")
    except httpx.RequestError as exc:
        logger.error("Network error setting webhook: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach Bolna API.")

    logger.info("Webhook configured for agent_id=%s → %s", agent_id, webhook_url)
    return SetupWebhookResponse(**result)


# ── POST /bolna/call ───────────────────────────────────────────────────────────

@router.post("/call")
async def make_call(body: InitiateCallRequest) -> dict:
    api_key = _get_api_key()

    phone = os.getenv("RECIPIENT_PHONE_NUMBER", "").strip()
    if not phone:
        raise HTTPException(
            status_code=500,
            detail="RECIPIENT_PHONE_NUMBER is not set in .env.",
        )

    try:
        result = await initiate_call(api_key, body.agent_id, phone)
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Bolna returned %s initiating call (agent=%s)",
            exc.response.status_code,
            body.agent_id,
        )
        raise HTTPException(status_code=502, detail="Bolna API error while initiating call.")
    except httpx.RequestError as exc:
        logger.error("Network error initiating call: %s", exc)
        raise HTTPException(status_code=502, detail="Could not reach Bolna API.")

    logger.info("Call initiated (agent_id=%s, phone=%s)", body.agent_id, phone)
    return result
