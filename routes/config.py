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


def _read_config() -> dict:
    """Return parsed config.json or raise HTTPException if missing/corrupt."""
    if not _CONFIG_PATH.exists():
        raise HTTPException(status_code=404, detail="No config found. Call POST /config first.")
    try:
        return json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        logger.error("config.json is corrupted: %s", exc)
        raise HTTPException(status_code=500, detail="config.json is corrupted.")


def _write_config(data: dict) -> None:
    _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    _CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


@router.post("/config", response_model=MessageResponse)
def save_config(body: ConfigRequest) -> MessageResponse:
    data = {
        "slack_webhook_url": str(body.slack_webhook_url),
        "configured_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_config(data)
    logger.info("Config saved successfully")
    return MessageResponse(message="Config saved successfully")


@router.get("/config", response_model=ConfigResponse)
def get_config() -> ConfigResponse:
    data = _read_config()
    return ConfigResponse(**data)
