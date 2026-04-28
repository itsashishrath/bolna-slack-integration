from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter

from models.schemas import AgentConfigEntry, AgentConfigRequest, MessageResponse

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
def save_agent_config(body: AgentConfigRequest) -> MessageResponse:
    data = _load_raw() or {}
    agents = data.get("agents", {})
    agents[body.agent_id] = {
        "slack_webhook_url": str(body.slack_webhook_url),
        "configured_at": datetime.now(timezone.utc).isoformat(),
    }
    data["agents"] = agents
    _write_config(data)
    logger.info("Slack webhook saved for agent_id=%s", body.agent_id)
    return MessageResponse(message=f"Slack webhook saved for agent {body.agent_id}")


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
