"""법인·사업장 회사 마스터"""
from sqlalchemy import Column, String, Integer, Text, UniqueConstraint
from app.models.base import BaseModel


class Company(BaseModel):
    __tablename__ = "companies"
    __table_args__ = (
        UniqueConstraint(
            "system_group_code",
            "company_code",
            name="uq_companies_group_company_code",
        ),
    )

    system_group_code = Column(String(50), nullable=False, index=True)
    company_code = Column(String(50), nullable=False, index=True)
    # 회사명(한국어)
    name_kor = Column(String(300))
    name_thai = Column(String(300))
    name_eng = Column(String(300))
    # 대표이사 성명
    representative_director_name = Column(String(200))
    # 통화 단위 (예: THB, KRW, USD)
    currency_unit = Column(String(20))
    logo_data_url = Column(Text)  # data URL 또는 외부 URL 문자열

    address_no = Column(String(200))
    soi = Column(String(200))
    road = Column(String(200))
    tumbon = Column(String(200))
    amphur = Column(String(200))
    province = Column(String(200))
    zip_code = Column(String(20))

    email = Column(String(255))
    phone = Column(String(100))
    fax = Column(String(100))

    additional_info = Column(Text)

    # 웹/인사 출력용 정렬·비고 (Company sort — Webperson)
    webperson_sort_order = Column(Integer, default=0, nullable=False)
    webperson_note = Column(Text)

    def __repr__(self):
        return f"<Company {self.company_code}>"
