from __future__ import annotations

import logging
import os

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.bolna import router as bolna_router
from routes.config import router as config_router
from routes.webhook import router as webhook_router

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

cors_origins = os.getenv("CORS_ORIGINS", "")
if cors_origins:
    origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()]
    if origins == ["*"]:
        origins = ["*"]
else:
    origins = []

app = FastAPI(
    title="Bolna → Slack Integration",
    description="Middleware that receives Bolna post-call webhooks and forwards alerts to Slack.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False if origins == ["*"] else True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(config_router)
app.include_router(webhook_router)
app.include_router(bolna_router)


@app.get("/", tags=["health"])
def health_check() -> dict:
    return {"status": "ok", "service": "bolna-slack-integration"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
