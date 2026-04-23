"""스케줄 관리 API 스키마."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class JobScheduleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    job_type: str
    enabled: bool = True
    time_local: str = "09:00"
    timezone: str = "Asia/Seoul"
    weekdays_mask: int = 62
    run_as_user_id: int
    company_id: Optional[int] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class JobScheduleUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    enabled: Optional[bool] = None
    time_local: Optional[str] = None
    timezone: Optional[str] = None
    weekdays_mask: Optional[int] = None
    run_as_user_id: Optional[int] = None
    company_id: Optional[int] = None
    payload: Optional[Dict[str, Any]] = None


class JobScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    job_type: str
    enabled: bool
    time_local: str
    timezone: str
    weekdays_mask: int
    run_as_user_id: int
    company_id: Optional[int] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class JobScheduleRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    schedule_id: int
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    message: Optional[str] = None
    result: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class JobScheduleRunNowResponse(BaseModel):
    ok: bool
    schedule_id: int
    message: str


class JobScheduleListResponse(BaseModel):
    items: List[JobScheduleResponse]
