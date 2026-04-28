from __future__ import annotations

import asyncio
import logging
import re

import httpx

logger = logging.getLogger(__name__)

_BLOCK_LIMIT = 3000  # Slack's hard per-block text limit
_MAX_RETRIES = 3
_BACKOFF_BASE = 1  # seconds — doubles each retry: 1s, 2s, 4s

# Matches whitespace that immediately follows a sentence-ending punctuation mark
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def _split_by_sentences(text: str) -> list[str]:
    """Split text into chunks ≤ _BLOCK_LIMIT, always cutting at the last complete sentence."""
    chunks: list[str] = []
    while len(text) > _BLOCK_LIMIT:
        window = text[:_BLOCK_LIMIT]
        matches = list(_SENTENCE_END.finditer(window))
        if matches:
            last = matches[-1]
            chunks.append(text[: last.start()])  # up to (not incl.) trailing whitespace
            text = text[last.end() :]             # resume after the whitespace
        else:
            # No sentence boundary in this window — hard cut as a last resort
            chunks.append(window)
            text = text[_BLOCK_LIMIT:]
    if text:
        chunks.append(text)
    return chunks


def _first_message_blocks(
    call_id: str,
    agent_id: str,
    duration: float,
    chunk: str,
    part: int,
    total: int,
) -> list[dict]:
    label = "Transcript" if total == 1 else f"Transcript (1/{total})"
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
            "text": {"type": "mrkdwn", "text": f"*{label}*\n```{chunk}```"},
        },
    ]


def _continuation_blocks(chunk: str, part: int, total: int) -> list[dict]:
    return [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Transcript ({part}/{total})*\n```{chunk}```",
            },
        }
    ]


async def _post_with_retry(
    client: httpx.AsyncClient, webhook_url: str, blocks: list[dict]
) -> None:
    """POST one Slack message. Raises RuntimeError after all retries are exhausted."""
    for attempt in range(_MAX_RETRIES):
        try:
            response = await client.post(webhook_url, json={"blocks": blocks})
            response.raise_for_status()
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
            await asyncio.sleep(_BACKOFF_BASE * (2**attempt))

    raise RuntimeError(f"Failed to send Slack message after {_MAX_RETRIES} retries")


async def send_slack_alert(
    webhook_url: str,
    call_id: str,
    agent_id: str,
    duration: float,
    transcript: str,
) -> None:
    """Send one or more Block Kit messages to Slack. Raises RuntimeError on failure."""
    chunks = _split_by_sentences(transcript)
    total = len(chunks)

    async with httpx.AsyncClient(timeout=10.0) as client:
        for i, chunk in enumerate(chunks):
            if i == 0:
                blocks = _first_message_blocks(call_id, agent_id, duration, chunk, 1, total)
            else:
                blocks = _continuation_blocks(chunk, i + 1, total)
            await _post_with_retry(client, webhook_url, blocks)

    logger.info("Slack alert sent (call_id=%s, parts=%d)", call_id, total)
