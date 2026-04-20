"""증명서 직원 전달용 일회성 토큰(링크)"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class EmployeeCertificateDeliveryToken(BaseModel):
    __tablename__ = "employee_certificate_delivery_tokens"

    issue_id = Column(
        Integer,
        ForeignKey("employee_certificate_issues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    signed_at = Column(DateTime, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)
    signer_ip = Column(String(45), nullable=True)
    signer_user_agent = Column(String(512), nullable=True)

    issue = relationship("EmployeeCertificateIssue", back_populates="delivery_tokens")

    def __repr__(self):
        return f"<EmployeeCertificateDeliveryToken id={self.id} issue_id={self.issue_id}>"
