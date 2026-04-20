"""문서 모델"""
from sqlalchemy import Column, String, Date, Integer, Float, Boolean, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
from datetime import date


class Document(BaseModel):
    """문서"""
    __tablename__ = "documents"
    
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    
    # 문서 정보
    document_type = Column(String(100), nullable=False)  # contract, id_card, qualification, etc.
    title = Column(String(200), nullable=False)
    description = Column(Text)
    
    # 파일 정보
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(500))
    file_size = Column(Integer)
    mime_type = Column(String(100))
    
    # 만료 정보
    issue_date = Column(Date)
    expiry_date = Column(Date)
    is_expired = Column(Boolean, default=False)
    
    # 버전 관리
    version = Column(Integer, default=1)
    previous_version_id = Column(Integer, ForeignKey("documents.id"))
    
    # 메타데이터
    meta_data = Column(JSON)  # metadata는 SQLAlchemy 예약어이므로 meta_data로 변경
    tags = Column(JSON)
    
    # 관계
    employee = relationship("Employee", back_populates="documents")
    previous_version = relationship("Document", remote_side="Document.id")
    
    def __repr__(self):
        return f"<Document {self.id}: {self.document_type} - {self.title}>"
