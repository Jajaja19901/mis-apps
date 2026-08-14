"""Modelos de entrada/salida (Pydantic)."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Method = Literal["metadata", "visible", "all", "invisible"]


class AssetOut(BaseModel):
    asset_id: str
    name: str
    mime: str
    width: int
    height: int
    bytes: int
    has_provenance: bool = False


class Mark(BaseModel):
    source: str
    label: str
    detail: str = ""
    kind: str = "metadato"  # metadato | procedencia | generador | visible | invisible
    confidence: str = ""


class AnalyzeOut(BaseModel):
    asset_id: str
    engine: str
    is_ai_generated: bool | None = None
    has_provenance: bool = False
    marks: list[Mark] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


class ProcessIn(BaseModel):
    asset_id: str
    method: Method = "metadata"
    rights_ack: bool = False
    keep_metadata: bool = False


class JobOut(BaseModel):
    job_id: str
    status: str  # queued | running | done | failed | unavailable
    method: str
    credits_cost: int = 0
    progress: int = 0
    quality_score: float | None = None
    removed: list[str] = Field(default_factory=list)
    surviving: list[str] = Field(default_factory=list)
    error: str | None = None


class Capabilities(BaseModel):
    engine: str
    metadata: bool
    identify: bool
    visible: bool
    invisible: bool
    detail: dict[str, Any] = Field(default_factory=dict)
