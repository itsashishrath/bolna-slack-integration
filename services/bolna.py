from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_BOLNA_BASE = "https://api.bolna.ai"


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


async def get_all_agents(api_key: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{_BOLNA_BASE}/v2/agent/all",
            headers=_headers(api_key),
        )
        response.raise_for_status()
        return response.json()


async def setup_agent_webhook(api_key: str, agent_id: str, webhook_url: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.patch(
            f"{_BOLNA_BASE}/v2/agent/{agent_id}",
            headers=_headers(api_key),
            json={"agent_config": {"webhook_url": webhook_url}},
        )
        response.raise_for_status()
        return response.json()


async def initiate_call(api_key: str, agent_id: str, recipient_phone: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{_BOLNA_BASE}/call",
            headers=_headers(api_key),
            json={
                "agent_id": agent_id,
                "recipient_phone_number": recipient_phone,
            },
        )
        response.raise_for_status()
        return response.json()
