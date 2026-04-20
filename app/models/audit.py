"""감사 추적 모델"""
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class AuditLog(BaseModel):
    """감사 로그"""
    __tablename__ = "audit_logs"
    
    # 사용자 정보
    # master_data_service 등에서 전달하는 user_id는 users.id 기준입니다.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    user_email = Column(String(255))
    ip_address = Column(String(50))
    user_agent = Column(String(500))
    
    # 액션 정보
    action = Column(String(100), nullable=False)  # create, update, delete, view, etc.
    resource_type = Column(String(100), nullable=False)  # employee, payroll, etc.
    resource_id = Column(Integer, nullable=True)
    
    # 변경 내용
    changes = Column(JSON)  # {field: {"old": value, "new": value}}
    before_state = Column(JSON)  # 변경 전 전체 상태
    after_state = Column(JSON)  # 변경 후 전체 상태
    
    # 추가 정보
    description = Column(Text)
    meta_data = Column(JSON)  # metadata는 SQLAlchemy 예약어이므로 meta_data로 변경
    
    # 관계
    user = relationship("User", foreign_keys=[user_id])
    
    def __repr__(self):
        return f"<AuditLog {self.id}: {self.action} {self.resource_type} {self.resource_id}>"
