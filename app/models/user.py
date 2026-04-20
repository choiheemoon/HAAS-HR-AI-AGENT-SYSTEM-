"""사용자 모델"""
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from datetime import datetime
import hashlib


class User(BaseModel):
    """사용자"""
    __tablename__ = "users"
    
    # 기본 정보
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=False, index=True)
    system_group_code = Column(String(50), nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    
    # 이름
    full_name = Column(String(100))
    
    # 권한
    role = Column(String(50), default="user")  # admin, hr_manager, user
    permission_group_id = Column(
        Integer, ForeignKey("permission_groups.id"), nullable=True, index=True
    )
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    # True: 사용자 관리(시스템) 화면에서 생성·초대된 계정만 시스템 관리 API/메뉴 접근 가능
    can_manage_system = Column(Boolean, default=False, nullable=False)
    
    # 마지막 로그인
    last_login = Column(DateTime, nullable=True)
    
    # 관계
    employee = relationship("Employee", back_populates="user", uselist=False)
    permission_group = relationship("PermissionGroup", back_populates="users")
    
    def __repr__(self):
        return f"<User {self.id}: {self.username}>"
