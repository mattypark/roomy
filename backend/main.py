"""roomy backend — image ingest, local CV clutter engine, Claude Vision analysis."""

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import HealthResponse

load_dotenv()

STAGE = 1

app = FastAPI(title="roomy", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        stage=STAGE,
        claudeEnabled=bool(os.environ.get("ANTHROPIC_API_KEY")),
    )
