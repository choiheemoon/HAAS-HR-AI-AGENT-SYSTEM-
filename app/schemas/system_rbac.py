"""시스템 관리(RBAC) 스키마"""
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional, List
from datetime import datetime


class PermissionGroupCreate(BaseModel):
    system_group_code: Optional[str] = None
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool = True


class PermissionGroupUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class PermissionGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    system_group_code: str
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool


class AppMenuResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    menu_key: str
    label_key: str
    sort_order: int


class MenuPermissionRow(BaseModel):
    menu_id: int
    menu_key: str
    label_key: str
    can_create: bool
    can_read: bool
    can_update: bool
    can_delete: bool


class MenuPermissionItem(BaseModel):
    menu_id: int
    can_create: bool
    can_read: bool
    can_update: bool
    can_delete: bool


class GroupMenuPermissionsPut(BaseModel):
    items: List[MenuPermissionItem]


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    username: str
    system_group_code: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    is_superuser: bool
    can_manage_system: bool = False
    permission_group_id: Optional[int] = None
    last_login: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AdminUserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: Optional[str] = None
    role: str = "user"
    permission_group_id: Optional[int] = None
    can_manage_system: bool = False
    system_group_code: Optional[str] = None


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    permission_group_id: Optional[int] = None
    password: Optional[str] = None
    can_manage_system: Optional[bool] = None
    is_superuser: Optional[bool] = None


class UserCompanyIdsPut(BaseModel):
    company_ids: List[int] = Field(default_factory=list)
