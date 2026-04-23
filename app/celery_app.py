"""Celery 앱 구성."""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "hr_ai_agent",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
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
