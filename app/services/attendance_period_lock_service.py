"""급여근태기간 마감(잠금) 공통 조회/검증."""
from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.attendance_standard import AttendancePaymentPeriod


class AttendancePeriodLockService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def _range_pairs(p: AttendancePaymentPeriod) -> List[Tuple[Optional[date], Optional[date]]]:
        return [
            (p.start_date_daily, p.end_date_daily),
            (p.start_date_monthly, p.end_date_monthly),
            (p.ot_start_daily, p.ot_end_daily),
            (p.ot_start_monthly, p.ot_end_monthly),
        ]

    def list_closed_periods(
        self,
        company_id: int,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> List[AttendancePaymentPeriod]:
        q = self.db.query(AttendancePaymentPeriod).filter(
            AttendancePaymentPeriod.company_id == int(company_id),
            AttendancePaymentPeriod.is_closed.is_(True),
        )
        rows = q.all()
        if date_from is None and date_to is None:
            return rows
        out: List[AttendancePaymentPeriod] = []
        for r in rows:
            hit = False
            for s, e in self._range_pairs(r):
                if not s or not e:
                    continue
                if date_from is not None and e < date_from:
                    continue
                if date_to is not None and s > date_to:
                    continue
                hit = True
                break
            if hit:
                out.append(r)
        return out

    def is_day_closed(self, company_id: int, work_day: date) -> bool:
        rows = self.list_closed_periods(company_id=company_id, date_from=work_day, date_to=work_day)
        for r in rows:
            for s, e in self._range_pairs(r):
                if s and e and s <= work_day <= e:
                    return True
        return False

    def build_closed_day_map(
        self, company_id: int, date_from: date, date_to: date
    ) -> Dict[str, bool]:
        out: Dict[str, bool] = {}
        if date_from > date_to:
            return out
        rows = self.list_closed_periods(company_id=company_id, date_from=date_from, date_to=date_to)
        d = date_from
        while d <= date_to:
            out[d.isoformat()] = False
            d = date.fromordinal(d.toordinal() + 1)
        for r in rows:
            for s, e in self._range_pairs(r):
                if not s or not e:
                    continue
                lo = max(s, date_from)
                hi = min(e, date_to)
                if lo > hi:
                    continue
                cur = lo
                while cur <= hi:
                    out[cur.isoformat()] = True
                    cur = date.fromordinal(cur.toordinal() + 1)
        return out

    def assert_day_not_closed(self, company_id: int, work_day: date) -> None:
        if self.is_day_closed(company_id, work_day):
            raise ValueError("해당 일자는 급여정보 집계 마감 기간이라 수정할 수 없습니다.")

    def assert_range_not_closed(self, company_id: int, date_from: date, date_to: date) -> None:
        if date_from > date_to:
            return
        rows = self.list_closed_periods(company_id=company_id, date_from=date_from, date_to=date_to)
        if rows:
            raise ValueError("선택한 기간에 급여정보 집계 마감일이 포함되어 수정할 수 없습니다.")

