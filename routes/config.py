from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException

from models.schemas import ConfigRequest, ConfigResponse, MessageResponse

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


def _read_config() -> dict:
    """Return parsed config.json or raise HTTPException if missing/corrupt."""
    data = _load_raw()
    if data is None:
        if not _CONFIG_PATH.exists():
            raise HTTPException(status_code=404, detail="No config found. Call POST /config first.")
        raise HTTPException(status_code=500, detail="config.json is corrupted.")

    if not data.get("slack_webhook_url") or not data.get("configured_at"):
        raise HTTPException(
            status_code=404,
            detail="Config incomplete. Call POST /config with your Slack webhook URL."
        )

    return data


def _write_config(data: dict) -> None:
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def update_last_call_id(call_id: str) -> None:
    """Persist the most-recently-processed call ID into config.json."""
    data = _load_raw() or {}
    data["last_call_id"] = call_id
    _write_config(data)
    logger.debug("last_call_id updated to %s", call_id)


@router.post("/config", response_model=MessageResponse)
def save_config(body: ConfigRequest) -> MessageResponse:
    existing = _load_raw() or {}
    data = {
        "slack_webhook_url": str(body.slack_webhook_url),
        "configured_at": datetime.now(timezone.utc).isoformat(),
        # Preserve existing last_call_id if the URL is being updated; start null otherwise.
        "last_call_id": existing.get("last_call_id", None),
    }
    _write_config(data)
    logger.info("Config saved successfully")
    return MessageResponse(message="Config saved successfully")


@router.get("/config", response_model=ConfigResponse)
def get_config() -> ConfigResponse:
    data = _read_config()
    return ConfigResponse(**data)
