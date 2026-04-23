"""스케줄 실행 Celery 태스크."""
from app.celery_app import celery_app
from app.database import SessionLocal
from app.services.job_schedule_service import JobScheduleService


@celery_app.task(name="app.tasks.job_schedule_tasks.dispatch_due_job_schedules")
def dispatch_due_job_schedules() -> dict:
    db = SessionLocal()
    try:
        svc = JobScheduleService(db)
        ids = svc.get_due_schedule_ids()
        for schedule_id in ids:
            run_job_schedule.delay(schedule_id, "scheduler")
        return {"queued": len(ids), "schedule_ids": ids}
    finally:
        db.close()


@celery_app.task(name="app.tasks.job_schedule_tasks.run_job_schedule")
def run_job_schedule(schedule_id: int, trigger: str = "manual") -> dict:
    db = SessionLocal()
    try:
        svc = JobScheduleService(db)
        result = svc.execute_schedule(int(schedule_id), trigger=trigger)
        return {"ok": True, "schedule_id": int(schedule_id), "result": result}
    finally:
        db.close()
