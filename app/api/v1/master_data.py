"""기준정보 API"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Any, Dict, List, Optional
from app.database import get_db
from app.services.master_data import MasterDataService
from app.services.system_rbac_service import SystemRbacService
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse
from app.schemas.employee_family import (
    EmployeeFamilyBulkSave,
    EmployeeFamilyCreate,
    EmployeeFamilyResponse,
    EmployeeFamilyUpdate,
)
from app.schemas.employee_career import (
    EmployeeCareerBulkSave,
    EmployeeCareerCreate,
    EmployeeCareerResponse,
    EmployeeCareerUpdate,
)
from app.api.v1.auth import get_current_user
from app.services.employee_family_service import EmployeeFamilyService
from app.services.employee_career_service import EmployeeCareerService
from app.schemas.employee_personal_info import (
    EmployeePersonalInfoCreate,
    EmployeePersonalInfoResponse,
    EmployeePersonalInfoUpdate,
)
from app.services.employee_personal_info_service import EmployeePersonalInfoService
from app.schemas.employee_education import EmployeeEducationResponse
from app.services.employee_education_service import EmployeeEducationService
from app.schemas.employee_address import (
    EmployeeAddressCreate,
    EmployeeAddressResponse,
    EmployeeAddressUpdate,
)
from app.services.employee_address_service import EmployeeAddressService
from app.schemas.employee_foreigner_info import (
    EmployeeForeignerInfoCreate,
    EmployeeForeignerInfoResponse,
    EmployeeForeignerInfoUpdate,
)
from app.services.employee_foreigner_info_service import EmployeeForeignerInfoService
from app.schemas.employee_certification import (
    EmployeeCertificationBulkSave,
    EmployeeCertificationCreate,
    EmployeeCertificationResponse,
    EmployeeCertificationUpdate,
)
from app.services.employee_certification_service import EmployeeCertificationService
from app.schemas.employee_certificate_issue import (
    EmployeeCertificateIssueCreate,
    EmployeeCertificateIssueResponse,
)
from app.services.employee_certificate_issue_service import EmployeeCertificateIssueService
from app.api.v1.certificate_issue_delivery import create_delivery_token_response
from app.schemas.certificate_delivery import CertificateDeliveryCreateResponse
from app.schemas.employee_language import (
    EmployeeLanguageBulkSave,
    EmployeeLanguageCreate,
    EmployeeLanguageResponse,
    EmployeeLanguageUpdate,
)
from app.services.employee_language_service import EmployeeLanguageService
from app.services.employee_hr_analytics_service import build_hr_analytics_summary

router = APIRouter()


# 가족사항: 직원 마스터와 동일 router에 등록 (별도 모듈만 배포 누락 시 404 방지)
@router.get("/{employee_id}/families", response_model=List[EmployeeFamilyResponse])
@router.get("/{employee_id}/families/", response_model=List[EmployeeFamilyResponse])
def list_employee_families(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeFamilyService(db)
    try:
        return svc.list_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{employee_id}/families", response_model=EmployeeFamilyResponse)
@router.post("/{employee_id}/families/", response_model=EmployeeFamilyResponse)
def create_employee_family(
    employee_id: int,
    body: EmployeeFamilyCreate,
    db: Session = Depends(get_db),
):
    svc = EmployeeFamilyService(db)
    try:
        return svc.create(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put(
    "/{employee_id}/families/bulk-save",
    response_model=List[EmployeeFamilyResponse],
)
@router.put(
    "/{employee_id}/families/bulk-save/",
    response_model=List[EmployeeFamilyResponse],
)
def bulk_save_employee_families(
    employee_id: int,
    body: EmployeeFamilyBulkSave,
    db: Session = Depends(get_db),
):
    svc = EmployeeFamilyService(db)
    try:
        return svc.bulk_save(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{employee_id}/families/{family_id}", response_model=EmployeeFamilyResponse)
@router.put("/{employee_id}/families/{family_id}/", response_model=EmployeeFamilyResponse)
def update_employee_family(
    employee_id: int,
    family_id: int,
    body: EmployeeFamilyUpdate,
    db: Session = Depends(get_db),
):
    svc = EmployeeFamilyService(db)
    try:
        return svc.update(employee_id, family_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{employee_id}/families/{family_id}")
@router.delete("/{employee_id}/families/{family_id}/")
def delete_employee_family(employee_id: int, family_id: int, db: Session = Depends(get_db)):
    svc = EmployeeFamilyService(db)
    try:
        svc.delete(employee_id, family_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id": family_id}


# 경력사항
@router.get("/{employee_id}/careers", response_model=List[EmployeeCareerResponse])
@router.get("/{employee_id}/careers/", response_model=List[EmployeeCareerResponse])
def list_employee_careers(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeCareerService(db)
    try:
        return svc.list_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{employee_id}/careers", response_model=EmployeeCareerResponse)
@router.post("/{employee_id}/careers/", response_model=EmployeeCareerResponse)
def create_employee_career(
    employee_id: int,
    body: EmployeeCareerCreate,
    db: Session = Depends(get_db),
):
    svc = EmployeeCareerService(db)
    try:
        return svc.create(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put(
    "/{employee_id}/careers/bulk-save",
    response_model=List[EmployeeCareerResponse],
)
@router.put(
    "/{employee_id}/careers/bulk-save/",
    response_model=List[EmployeeCareerResponse],
)
def bulk_save_employee_careers(
    employee_id: int,
    body: EmployeeCareerBulkSave,
    db: Session = Depends(get_db),
):
    svc = EmployeeCareerService(db)
    try:
        return svc.bulk_save(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put("/{employee_id}/careers/{career_id}", response_model=EmployeeCareerResponse)
@router.put("/{employee_id}/careers/{career_id}/", response_model=EmployeeCareerResponse)
def update_employee_career(
    employee_id: int,
    career_id: int,
    body: EmployeeCareerUpdate,
    db: Session = Depends(get_db),
):
    svc = EmployeeCareerService(db)
    try:
        return svc.update(employee_id, career_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{employee_id}/careers/{career_id}")
@router.delete("/{employee_id}/careers/{career_id}/")
def delete_employee_career(employee_id: int, career_id: int, db: Session = Depends(get_db)):
    svc = EmployeeCareerService(db)
    try:
        svc.delete(employee_id, career_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id": career_id}


# 개인정보 (직원당 1행, Language 그리드 제외)
@router.get(
    "/{employee_id}/personal-info",
    response_model=Optional[EmployeePersonalInfoResponse],
)
@router.get(
    "/{employee_id}/personal-info/",
    response_model=Optional[EmployeePersonalInfoResponse],
)
def get_employee_personal_info(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeePersonalInfoService(db)
    try:
        row = svc.get_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return row


@router.post(
    "/{employee_id}/personal-info",
    response_model=EmployeePersonalInfoResponse,
)
@router.post(
    "/{employee_id}/personal-info/",
    response_model=EmployeePersonalInfoResponse,
)
def create_employee_personal_info(
    employee_id: int,
    body: EmployeePersonalInfoCreate,
    db: Session = Depends(get_db),
):
    svc = EmployeePersonalInfoService(db)
    try:
        return svc.create(employee_id, body.model_dump())
    except ValueError as e:
        msg = str(e)
        if "이미" in msg:
            raise HTTPException(status_code=409, detail=msg) from e
        raise HTTPException(status_code=404, detail=msg) from e


@router.put(
    "/{employee_id}/personal-info",
    response_model=EmployeePersonalInfoResponse,
)
@router.put(
    "/{employee_id}/personal-info/",
    response_model=EmployeePersonalInfoResponse,
)
def update_employee_personal_info(
    employee_id: int,
    body: EmployeePersonalInfoUpdate,
    db: Session = Depends(get_db),
):
    svc = EmployeePersonalInfoService(db)
    try:
        return svc.update(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{employee_id}/personal-info")
@router.delete("/{employee_id}/personal-info/")
def delete_employee_personal_info(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeePersonalInfoService(db)
    try:
        svc.delete(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True}


# 주소정보 (본적·현주소, 직원당 1행)
@router.get(
    "/{employee_id}/address-info",
    response_model=Optional[EmployeeAddressResponse],
)
@router.get(
    "/{employee_id}/address-info/",
    response_model=Optional[EmployeeAddressResponse],
)
def get_employee_address_info(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeAddressService(db)
    try:
        return svc.get_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post(
    "/{employee_id}/address-info",
    response_model=EmployeeAddressResponse,
)
@router.post(
    "/{employee_id}/address-info/",
    response_model=EmployeeAddressResponse,
)
def create_employee_address_info(
    employee_id: int,
    body: EmployeeAddressCreate,
    db: Session = Depends(get_db),
):
    svc = EmployeeAddressService(db)
    try:
        return svc.create(employee_id, body.model_dump())
    except ValueError as e:
        msg = str(e)
        if "이미" in msg:
            raise HTTPException(status_code=409, detail=msg) from e
        raise HTTPException(status_code=404, detail=msg) from e


@router.put(
    "/{employee_id}/address-info",
    response_model=EmployeeAddressResponse,
)
@router.put(
    "/{employee_id}/address-info/",
    response_model=EmployeeAddressResponse,
)
def update_employee_address_info(
    employee_id: int,
    body: EmployeeAddressUpdate,
    db: Session = Depends(get_db),
):
    svc = EmployeeAddressService(db)
    try:
        return svc.update(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{employee_id}/address-info")
@router.delete("/{employee_id}/address-info/")
def delete_employee_address_info(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeAddressService(db)
    try:
        svc.delete(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True}


# 외국인 정보 (여권/VISA/취업허가, 직원당 1행)
@router.get(
    "/{employee_id}/foreigner-info",
    response_model=Optional[EmployeeForeignerInfoResponse],
)
@router.get(
    "/{employee_id}/foreigner-info/",
    response_model=Optional[EmployeeForeignerInfoResponse],
)
def get_employee_foreigner_info(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeForeignerInfoService(db)
    try:
        return svc.get_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post(
    "/{employee_id}/foreigner-info",
    response_model=EmployeeForeignerInfoResponse,
)
@router.post(
    "/{employee_id}/foreigner-info/",
    response_model=EmployeeForeignerInfoResponse,
)
def create_employee_foreigner_info(
    employee_id: int,
    body: EmployeeForeignerInfoCreate,
    db: Session = Depends(get_db),
):
    svc = EmployeeForeignerInfoService(db)
    try:
        return svc.create(employee_id, body.model_dump())
    except ValueError as e:
        msg = str(e)
        if "이미" in msg:
            raise HTTPException(status_code=409, detail=msg) from e
        raise HTTPException(status_code=404, detail=msg) from e


@router.put(
    "/{employee_id}/foreigner-info",
    response_model=EmployeeForeignerInfoResponse,
)
@router.put(
    "/{employee_id}/foreigner-info/",
    response_model=EmployeeForeignerInfoResponse,
)
def update_employee_foreigner_info(
    employee_id: int,
    body: EmployeeForeignerInfoUpdate,
    db: Session = Depends(get_db),
):
    svc = EmployeeForeignerInfoService(db)
    try:
        return svc.update(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{employee_id}/foreigner-info")
@router.delete("/{employee_id}/foreigner-info/")
def delete_employee_foreigner_info(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeForeignerInfoService(db)
    try:
        svc.delete(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True}


# 자격증·면허
@router.get("/{employee_id}/certifications", response_model=List[EmployeeCertificationResponse])
@router.get("/{employee_id}/certifications/", response_model=List[EmployeeCertificationResponse])
def list_employee_certifications(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeCertificationService(db)
    try:
        return svc.list_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{employee_id}/certifications", response_model=EmployeeCertificationResponse)
@router.post("/{employee_id}/certifications/", response_model=EmployeeCertificationResponse)
def create_employee_certification(
    employee_id: int,
    body: EmployeeCertificationCreate,
    db: Session = Depends(get_db),
):
    svc = EmployeeCertificationService(db)
    try:
        return svc.create(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put(
    "/{employee_id}/certifications/bulk-save",
    response_model=List[EmployeeCertificationResponse],
)
@router.put(
    "/{employee_id}/certifications/bulk-save/",
    response_model=List[EmployeeCertificationResponse],
)
def bulk_save_employee_certifications(
    employee_id: int,
    body: EmployeeCertificationBulkSave,
    db: Session = Depends(get_db),
):
    svc = EmployeeCertificationService(db)
    try:
        return svc.bulk_save(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put(
    "/{employee_id}/certifications/{certification_id}",
    response_model=EmployeeCertificationResponse,
)
@router.put(
    "/{employee_id}/certifications/{certification_id}/",
    response_model=EmployeeCertificationResponse,
)
def update_employee_certification(
    employee_id: int,
    certification_id: int,
    body: EmployeeCertificationUpdate,
    db: Session = Depends(get_db),
):
    svc = EmployeeCertificationService(db)
    try:
        return svc.update(employee_id, certification_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{employee_id}/certifications/{certification_id}")
@router.delete("/{employee_id}/certifications/{certification_id}/")
def delete_employee_certification(
    employee_id: int, certification_id: int, db: Session = Depends(get_db)
):
    svc = EmployeeCertificationService(db)
    try:
        svc.delete(employee_id, certification_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id": certification_id}


# 인사카드/증명서 발급 이력
@router.get("/{employee_id}/certificate-issues", response_model=List[EmployeeCertificateIssueResponse])
@router.get("/{employee_id}/certificate-issues/", response_model=List[EmployeeCertificateIssueResponse])
def list_employee_certificate_issues(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeCertificateIssueService(db)
    try:
        return svc.list_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{employee_id}/certificate-issues", response_model=EmployeeCertificateIssueResponse)
@router.post("/{employee_id}/certificate-issues/", response_model=EmployeeCertificateIssueResponse)
def create_employee_certificate_issue(
    employee_id: int,
    body: EmployeeCertificateIssueCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = EmployeeCertificateIssueService(db)
    try:
        return svc.create(
            employee_id=employee_id,
            user_id=getattr(current_user, "id", None),
            data=body.model_dump(exclude_unset=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


# 어학정보
@router.get("/{employee_id}/languages", response_model=List[EmployeeLanguageResponse])
@router.get("/{employee_id}/languages/", response_model=List[EmployeeLanguageResponse])
def list_employee_languages(employee_id: int, db: Session = Depends(get_db)):
    svc = EmployeeLanguageService(db)
    try:
        return svc.list_by_employee(employee_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{employee_id}/languages", response_model=EmployeeLanguageResponse)
@router.post("/{employee_id}/languages/", response_model=EmployeeLanguageResponse)
def create_employee_language(
    employee_id: int,
    body: EmployeeLanguageCreate,
    db: Session = Depends(get_db),
):
    svc = EmployeeLanguageService(db)
    try:
        return svc.create(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put(
    "/{employee_id}/languages/bulk-save",
    response_model=List[EmployeeLanguageResponse],
)
@router.put(
    "/{employee_id}/languages/bulk-save/",
    response_model=List[EmployeeLanguageResponse],
)
def bulk_save_employee_languages(
    employee_id: int,
    body: EmployeeLanguageBulkSave,
    db: Session = Depends(get_db),
):
    svc = EmployeeLanguageService(db)
    try:
        return svc.bulk_save(employee_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.put(
    "/{employee_id}/languages/{language_id}",
    response_model=EmployeeLanguageResponse,
)
@router.put(
    "/{employee_id}/languages/{language_id}/",
    response_model=EmployeeLanguageResponse,
)
def update_employee_language(
    employee_id: int,
    language_id: int,
    body: EmployeeLanguageUpdate,
    db: Session = Depends(get_db),
):
    svc = EmployeeLanguageService(db)
    try:
        return svc.update(employee_id, language_id, body.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.delete("/{employee_id}/languages/{language_id}")
@router.delete("/{employee_id}/languages/{language_id}/")
def delete_employee_language(employee_id: int, language_id: int, db: Session = Depends(get_db)):
    svc = EmployeeLanguageService(db)
    try:
        svc.delete(employee_id, language_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return {"ok": True, "id": language_id}


@router.post("", response_model=EmployeeResponse)
@router.post("/", response_model=EmployeeResponse)
def create_employee(
    employee_data: EmployeeCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """직원 정보 생성"""
    service = MasterDataService(db)
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if employee_data.company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="등록 가능한 회사가 아닙니다.")
    try:
        employee = service.create_employee(employee_data.model_dump(exclude_unset=True), user_id=current_user.id)
        return employee
    except ValueError as e:
        msg = str(e)
        if "중복" in msg:
            raise HTTPException(status_code=409, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
    except IntegrityError as e:
        # Postgres unique violation 등: 어떤 컬럼이 중복인지(detail)까지 전달
        detail = str(getattr(e, "orig", e))
        raise HTTPException(status_code=409, detail=detail) from e


@router.get("/{employee_id}", response_model=EmployeeResponse)
@router.get("/{employee_id}/", response_model=EmployeeResponse)
def get_employee(
    employee_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """직원 정보 조회"""
    service = MasterDataService(db)
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    employee = service.get_employee(employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    if employee.company_id is not None and employee.company_id not in allowed_company_ids:
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
@router.put("/{employee_id}/", response_model=EmployeeResponse)
def update_employee(
    employee_id: int,
    employee_data: EmployeeUpdate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """직원 정보 수정"""
    service = MasterDataService(db)
    try:
        # 요구사항: 회사정보는 수정 불가(생성 시만 설정)
        payload = employee_data.model_dump(exclude_unset=True)
        payload.pop("company_id", None)

        rbac = SystemRbacService(db)
        allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)

        employee = service.update_employee(
            employee_id,
            payload,
            user_id=current_user.id,
        )
    except ValueError as e:
        msg = str(e)
        if "찾을 수 없습니다" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        if "중복" in msg:
            raise HTTPException(status_code=409, detail=msg) from e
        raise HTTPException(status_code=400, detail=msg) from e
    except IntegrityError as e:
        detail = str(getattr(e, "orig", e))
        raise HTTPException(status_code=409, detail=detail) from e
    return employee


@router.delete("/{employee_id}")
@router.delete("/{employee_id}/")
def delete_employee(
    employee_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """직원 삭제(퇴사 처리: 상태 종료, 퇴사일 기록)"""
    service = MasterDataService(db)
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    employee = service.get_employee(employee_id)
    if not employee or (employee.company_id is not None and employee.company_id not in allowed_company_ids):
        raise HTTPException(status_code=404, detail="직원을 찾을 수 없습니다.")
    try:
        service.soft_delete_employee(employee_id, user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "처리되었습니다.", "id": employee_id}


@router.get("", response_model=List[EmployeeResponse], response_model_exclude={"resident_number"})
@router.get("/", response_model=List[EmployeeResponse], response_model_exclude={"resident_number"})
def get_employees(
    company_id: Optional[int] = None,
    department: Optional[str] = None,
    status: Optional[str] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """직원 목록 조회"""
    service = MasterDataService(db)
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []

    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")

    filters = {}
    if company_id is not None:
        filters["company_id"] = company_id
    else:
        # 회사 필터가 없으면 사용자 접근 가능한 모든 회사에서 조회
        filters["company_ids"] = allowed_company_ids
    if department:
        filters["department"] = department
    if status:
        filters["status"] = status
    return service.get_employees(filters)


@router.get("/hr-analytics/summary", response_model=Dict[str, Any])
@router.get("/hr-analytics/summary/", response_model=Dict[str, Any])
def get_hr_analytics_summary(
    company_id: Optional[int] = None,
    months: int = 12,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """인사레포트: 인력증감·연령·성별·근속·부서별 집계(접근 가능 회사 범위)."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return build_hr_analytics_summary(db, [], company_id, months)
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    return build_hr_analytics_summary(db, allowed_company_ids, company_id, months)


@router.get("/personal-info/bulk", response_model=List[EmployeePersonalInfoResponse])
@router.get("/personal-info/bulk/", response_model=List[EmployeePersonalInfoResponse])
def list_employee_personal_info_bulk(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """인사마스터조회 등: 직원 수만큼 개인정보 API를 반복 호출하지 않도록 일괄 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeePersonalInfoService(db)
    return svc.list_for_access_scope(allowed_company_ids, company_id)


@router.get("/educations/bulk", response_model=List[EmployeeEducationResponse])
@router.get("/educations/bulk/", response_model=List[EmployeeEducationResponse])
def list_employee_educations_bulk(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """학력조회: 직원별 학력 API를 반복 호출하지 않도록 일괄 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeeEducationService(db)
    return svc.list_for_access_scope(allowed_company_ids, company_id)


@router.get("/careers/bulk", response_model=List[EmployeeCareerResponse])
@router.get("/careers/bulk/", response_model=List[EmployeeCareerResponse])
def list_employee_careers_bulk(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """경력조회: 직원별 경력 API를 반복 호출하지 않도록 일괄 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeeCareerService(db)
    return svc.list_for_access_scope(allowed_company_ids, company_id)


@router.get("/certifications/bulk", response_model=List[EmployeeCertificationResponse])
@router.get("/certifications/bulk/", response_model=List[EmployeeCertificationResponse])
def list_employee_certifications_bulk(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """자격증조회: 직원별 자격증 API를 반복 호출하지 않도록 일괄 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeeCertificationService(db)
    return svc.list_for_access_scope(allowed_company_ids, company_id)


@router.get("/certificate-issues/bulk", response_model=List[EmployeeCertificateIssueResponse])
@router.get("/certificate-issues/bulk/", response_model=List[EmployeeCertificateIssueResponse])
def list_employee_certificate_issues_bulk(
    company_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    certificate_kind: Optional[str] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """증명서 발급이력 조회: 회사/직원/증명서유형 조건 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeeCertificateIssueService(db)
    return svc.list_for_access_scope(
        allowed_company_ids=allowed_company_ids,
        company_id=company_id,
        employee_id=employee_id,
        certificate_kind=certificate_kind,
    )


@router.get("/certificate-issues/{issue_id}", response_model=EmployeeCertificateIssueResponse)
@router.get("/certificate-issues/{issue_id}/", response_model=EmployeeCertificateIssueResponse)
def get_employee_certificate_issue(
    issue_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """단건 발급이력 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    svc = EmployeeCertificateIssueService(db)
    row = svc.get_for_access_scope(issue_id, allowed_company_ids)
    if not row:
        raise HTTPException(status_code=404, detail="발급 이력을 찾을 수 없습니다.")
    return row


@router.post(
    "/certificate-issues/{issue_id}/delivery-token",
    response_model=CertificateDeliveryCreateResponse,
)
@router.post(
    "/certificate-issues/{issue_id}/delivery-token/",
    response_model=CertificateDeliveryCreateResponse,
)
def create_certificate_issue_delivery_token(
    issue_id: int,
    ttl_days: int = 30,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """직원 전달용 비밀 링크 발급(토큰은 응답 시 한 번만 노출). — 호환용 URL: /employees/certificate-issues/..."""
    return create_delivery_token_response(issue_id, ttl_days, current_user, db)


@router.post(
    "/certificate-issues/{issue_id}/delivery",
    response_model=CertificateDeliveryCreateResponse,
)
@router.post(
    "/certificate-issues/{issue_id}/delivery/",
    response_model=CertificateDeliveryCreateResponse,
)
def create_certificate_issue_delivery_short_alias(
    issue_id: int,
    ttl_days: int = 30,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """`/delivery-token` 과 동일(짧은 경로)."""
    return create_delivery_token_response(issue_id, ttl_days, current_user, db)


@router.get("/addresses/bulk", response_model=List[EmployeeAddressResponse])
@router.get("/addresses/bulk/", response_model=List[EmployeeAddressResponse])
def list_employee_addresses_bulk(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """주소정보조회: 직원별 주소 API를 반복 호출하지 않도록 일괄 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeeAddressService(db)
    return svc.list_for_access_scope(allowed_company_ids, company_id)


@router.get("/foreigner-info/bulk", response_model=List[EmployeeForeignerInfoResponse])
@router.get("/foreigner-info/bulk/", response_model=List[EmployeeForeignerInfoResponse])
def list_employee_foreigner_info_bulk(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """외국인정보조회: 직원별 API를 반복 호출하지 않도록 일괄 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeeForeignerInfoService(db)
    return svc.list_for_access_scope(allowed_company_ids, company_id)


@router.get("/families/bulk", response_model=List[EmployeeFamilyResponse])
@router.get("/families/bulk/", response_model=List[EmployeeFamilyResponse])
def list_employee_families_bulk(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """가족사항 조회: 직원별 가족 API를 반복 호출하지 않도록 일괄 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeeFamilyService(db)
    return svc.list_for_access_scope(allowed_company_ids, company_id)


@router.get("/languages/bulk", response_model=List[EmployeeLanguageResponse])
@router.get("/languages/bulk/", response_model=List[EmployeeLanguageResponse])
def list_employee_languages_bulk(
    company_id: Optional[int] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """어학정보조회: 직원별 어학 API를 반복 호출하지 않도록 일괄 조회."""
    rbac = SystemRbacService(db)
    allowed_company_ids = rbac.get_user_company_ids(current_user.id, current_user=current_user)
    if not allowed_company_ids:
        return []
    if company_id is not None and company_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="조회 가능한 회사가 아닙니다.")
    svc = EmployeeLanguageService(db)
    return svc.list_for_access_scope(allowed_company_ids, company_id)


@router.put("/{employee_id}/self-service")
def employee_self_service_update(
    employee_id: int,
    update_data: dict,
    db: Session = Depends(get_db)
):
    """직원 셀프서비스 업데이트"""
    service = MasterDataService(db)
    employee = service.employee_self_service_update(employee_id, update_data)
    return {"id": employee.id, "message": "업데이트 완료"}
