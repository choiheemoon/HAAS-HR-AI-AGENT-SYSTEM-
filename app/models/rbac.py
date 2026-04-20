"""권한 그룹·메뉴·그룹별 메뉴 CRUD 권한"""
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class PermissionGroup(BaseModel):
    __tablename__ = "permission_groups"
    __table_args__ = (
        UniqueConstraint(
            "system_group_code",
            "code",
            name="uq_permission_groups_group_code",
        ),
    )

    system_group_code = Column(String(50), nullable=False, index=True)
    code = Column(String(50), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False)

    users = relationship("User", back_populates="permission_group")
    menu_permissions = relationship(
        "GroupMenuPermission",
        back_populates="permission_group",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<PermissionGroup {self.code}>"


class AppMenu(BaseModel):
    __tablename__ = "app_menus"

    menu_key = Column(String(120), unique=True, nullable=False, index=True)
    label_key = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)

    group_permissions = relationship(
        "GroupMenuPermission",
        back_populates="app_menu",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<AppMenu {self.menu_key}>"


class GroupMenuPermission(BaseModel):
    __tablename__ = "group_menu_permissions"
    __table_args__ = (
        UniqueConstraint(
            "permission_group_id",
            "app_menu_id",
            name="uq_group_menu_permission",
        ),
    )

    permission_group_id = Column(
        Integer, ForeignKey("permission_groups.id", ondelete="CASCADE"), nullable=False
    )
    app_menu_id = Column(
        Integer, ForeignKey("app_menus.id", ondelete="CASCADE"), nullable=False
    )
    can_create = Column(Boolean, default=False, nullable=False)
    can_read = Column(Boolean, default=False, nullable=False)
    can_update = Column(Boolean, default=False, nullable=False)
    can_delete = Column(Boolean, default=False, nullable=False)

    permission_group = relationship("PermissionGroup", back_populates="menu_permissions")
    app_menu = relationship("AppMenu", back_populates="group_permissions")

    def __repr__(self):
        return f"<GroupMenuPermission g={self.permission_group_id} m={self.app_menu_id}>"
