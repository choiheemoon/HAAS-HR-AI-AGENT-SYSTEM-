"""직원 학력(교육 이력)"""
from sqlalchemy import Column, String, Integer, ForeignKey, Text, Date
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class EmployeeEducation(BaseModel):
    """직원별 학력 행 (최신이 sort_order=0, 오름차순 정렬 시 맨 위 = No.1)"""

    __tablename__ = "employee_educations"

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order = Column(Integer, nullable=False, default=0)

    degree = Column(String(200))
    degree_minor_code_id = Column(
        Integer, ForeignKey("minor_codes.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    field_of_study = Column(String(200))
    field_of_study_minor_code_id = Column(
        Integer, ForeignKey("minor_codes.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    institution = Column(String(200))
    institution_minor_code_id = Column(
        Integer, ForeignKey("minor_codes.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    nationality = Column(String(100))
    nationality_minor_code_id = Column(
        Integer, ForeignKey("minor_codes.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    from_date = Column(Date, nullable=True)
    to_date = Column(Date, nullable=True)
    from_year = Column(Integer, nullable=True)
    to_year = Column(Integer, nullable=True)
    grade = Column(String(100))
    note = Column(Text)
    educational_qualification = Column(String(200))

    employee = relationship("Employee", back_populates="educations")

    def __repr__(self):
        return f"<EmployeeEducation emp={self.employee_id} id={self.id}>"
