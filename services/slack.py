from __future__ import annotations

import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

_TRANSCRIPT_LIMIT = 2000
_MAX_RETRIES = 3
_BACKOFF_BASE = 1  # seconds — doubles each retry: 1s, 2s, 4s


def _build_blocks(
    call_id: str,
    agent_id: str,
    duration: float,
    transcript: str,
) -> list[dict]:
    truncated = transcript[:_TRANSCRIPT_LIMIT]
    if len(transcript) > _TRANSCRIPT_LIMIT:
        truncated += "\n… [transcript truncated]"

    return [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "Bolna Call Ended", "emoji": False},
        },
        {"type": "divider"},
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Call ID:*\n`{call_id}`"},
                {"type": "mrkdwn", "text": f"*Agent ID:*\n`{agent_id}`"},
                {"type": "mrkdwn", "text": f"*Duration:*\n{duration} seconds"},
            ],
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*Transcript*\n```{truncated}```"},
        },
    ]


async def send_slack_alert(
    webhook_url: str,
    call_id: str,
    agent_id: str,
    duration: float,
    transcript: str,
) -> None:
    """Send a Block Kit alert to Slack. Raises RuntimeError after all retries fail."""
    payload = {"blocks": _build_blocks(call_id, agent_id, duration, transcript)}

    async with httpx.AsyncClient(timeout=10.0) as client:
        for attempt in range(_MAX_RETRIES):
            try:
                response = await client.post(webhook_url, json=payload)
                response.raise_for_status()
                logger.info("Slack alert sent (call_id=%s)", call_id)
                return
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "Slack returned %s on attempt %d/%d",
                    exc.response.status_code,
                    attempt + 1,
                    _MAX_RETRIES,
                )
            except httpx.RequestError as exc:
                logger.warning(
                    "Request error on attempt %d/%d: %s",
                    attempt + 1,
                    _MAX_RETRIES,
                    exc,
                )

            if attempt < _MAX_RETRIES - 1:
                delay = _BACKOFF_BASE * (2**attempt)
                await asyncio.sleep(delay)

    raise RuntimeError(f"Failed to send Slack alert after {_MAX_RETRIES} retries")
