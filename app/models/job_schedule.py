"""시스템 스케줄 관리 모델."""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class JobSchedule(BaseModel):
    __tablename__ = "job_schedules"

    name = Column(String(200), nullable=False)
    job_type = Column(String(80), nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=True)
    time_local = Column(String(5), nullable=False, default="09:00")  # HH:MM
    timezone = Column(String(64), nullable=False, default="Asia/Seoul")
    weekdays_mask = Column(Integer, nullable=False, default=62)  # Mon~Fri
    run_as_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True)
    payload_json = Column(Text, nullable=True)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)

    run_as_user = relationship("User")
    company = relationship("Company")
    runs = relationship(
        "JobScheduleRun",
        back_populates="schedule",
        cascade="all, delete-orphan",
    )


class JobScheduleRun(BaseModel):
    __tablename__ = "job_schedule_runs"

    schedule_id = Column(
        Integer,
        ForeignKey("job_schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String(20), nullable=False, default="queued")  # queued/running/success/failed
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    message = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)

    schedule = relationship("JobSchedule", back_populates="runs")
