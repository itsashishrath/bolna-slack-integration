from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter

from models.schemas import AgentConfigEntry, AgentConfigRequest, MessageResponse
from services.bolna import setup_agent_webhook

logger = logging.getLogger(__name__)

router = APIRouter(tags=["config"])

_CONFIG_PATH = Path("storage/config.json")


def _load_raw() -> dict | None:
    """Return parsed config.json, or None if the file does not exist or is corrupt."""
    if not _CONFIG_PATH.exists():
        return None
    try:
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        logger.error("config.json is corrupted: %s", exc)
        return None


def _write_config(data: dict) -> None:
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def update_last_call_id(call_id: str) -> None:
    """Persist the most-recently-processed call ID into config.json."""
    data = _load_raw() or {}
    data["last_call_id"] = call_id
    _write_config(data)
    logger.debug("last_call_id updated to %s", call_id)


# ── DELETE /config/reset ───────────────────────────────────────────────────────

@router.delete("/config/reset", response_model=MessageResponse)
def reset_config() -> MessageResponse:
    _write_config({
        "slack_webhook_url": None,
        "configured_at": None,
        "last_call_id": None,
        "bolna_api_key": None,
        "bolna_api_key_set_at": None,
        "agents": {},
    })
    logger.info("Config reset to empty state")
    return MessageResponse(message="Config reset successfully")


# ── GET /status ────────────────────────────────────────────────────────────────

@router.get("/status", tags=["health"])
def get_status() -> dict:
    """Returns which parts of the integration are configured — safe to call at any time."""
    data = _load_raw() or {}
    agents = data.get("agents", {})
    any_agent_configured = any(
        bool(cfg.get("slack_webhook_url")) for cfg in agents.values()
    )
    return {
        "bolna_configured": bool(data.get("bolna_api_key")),
        "any_agent_configured": any_agent_configured,
        "configured_agent_ids": list(agents.keys()),
    }


# ── POST /config/agent ─────────────────────────────────────────────────────────

@router.post("/config/agent", response_model=MessageResponse)
async def save_agent_config(body: AgentConfigRequest) -> MessageResponse:
    data = _load_raw() or {}
    agents = data.get("agents", {})
    agents[body.agent_id] = {
        "slack_webhook_url": str(body.slack_webhook_url),
        "configured_at": datetime.now(timezone.utc).isoformat(),
    }
    data["agents"] = agents
    _write_config(data)
    logger.info("Slack webhook saved for agent_id=%s", body.agent_id)

    # Auto-register this server as the Bolna post-call webhook for the agent
    api_key = data.get("bolna_api_key")
    server_host = os.getenv("SERVER_HOST", "").rstrip("/")
    if api_key and server_host:
        try:
            await setup_agent_webhook(api_key, body.agent_id, f"{server_host}/webhook")
            logger.info("Bolna webhook auto-configured for agent_id=%s", body.agent_id)
        except Exception as exc:
            logger.warning(
                "Slack config saved but Bolna webhook auto-config failed for agent %s: %s",
                body.agent_id, exc,
            )
    else:
        logger.warning(
            "Skipping Bolna webhook auto-config for agent %s — %s",
            body.agent_id,
            "BOLNA_API_KEY missing" if not api_key else "SERVER_HOST not set in .env",
        )

    return MessageResponse(message=f"Slack webhook saved for agent {body.agent_id}")


# ── DELETE /config/agent/{agent_id}/slack ─────────────────────────────────────

@router.delete("/config/agent/{agent_id}/slack", response_model=MessageResponse)
def delete_agent_slack(agent_id: str) -> MessageResponse:
    data = _load_raw() or {}
    agents = data.get("agents", {})
    if agent_id in agents:
        del agents[agent_id]
        data["agents"] = agents
        _write_config(data)
        logger.info("Slack webhook removed for agent_id=%s", agent_id)
    return MessageResponse(message=f"Slack webhook removed for agent {agent_id}")


# ── GET /config/agents ─────────────────────────────────────────────────────────

@router.get("/config/agents", response_model=list[AgentConfigEntry])
def get_agent_configs() -> list[AgentConfigEntry]:
    data = _load_raw() or {}
    agents = data.get("agents", {})
    return [
        AgentConfigEntry(agent_id=aid, **cfg)
        for aid, cfg in agents.items()
        if cfg.get("slack_webhook_url")
    ]
