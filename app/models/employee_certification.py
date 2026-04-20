"""직원 자격증·면허 (다행)"""
from sqlalchemy import Column, Date, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeCertification(BaseModel):
    __tablename__ = "employee_certifications"

    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sort_order = Column(Integer, nullable=False, default=0)

    # Minor 코드(기준정보) FK
    # - license_type_minor_code_id: 자격면허종류
    # - issuer_minor_code_id: 자격/면허증발행기관
    license_type_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    issuer_minor_code_id = Column(
        Integer,
        ForeignKey("minor_codes.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    license_code = Column(String(50), nullable=True)
    license_type_name = Column(String(300), nullable=True)
    grade = Column(String(100), nullable=True)
    issuer_code = Column(String(50), nullable=True)
    issuer_name = Column(String(300), nullable=True)
    acquired_date = Column(Date, nullable=True)
    effective_date = Column(Date, nullable=True)
    next_renewal_date = Column(Date, nullable=True)
    certificate_number = Column(String(100), nullable=True)

    employee = relationship("Employee", back_populates="certifications")

    def __repr__(self):
        return f"<EmployeeCertification emp={self.employee_id} id={self.id}>"
