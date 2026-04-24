"""Celery 앱 구성."""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "hr_ai_agent",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.job_schedule_tasks"],
)

celery_app.conf.update(
    timezone=settings.CELERY_TIMEZONE,
    enable_utc=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    beat_schedule={
        "dispatch-due-job-schedules-every-minute": {
            "task": "app.tasks.job_schedule_tasks.dispatch_due_job_schedules",
            "schedule": 60.0,
        }
    },
)

celery_app.autodiscover_tasks(["app.tasks"])

# Windows/로컬 실행 환경에서 autodiscover가 누락되는 경우를 방지하기 위해
# 스케줄 태스크 모듈을 명시적으로 import하여 task registry를 보장합니다.
from app.tasks import job_schedule_tasks  # noqa: F401,E402
