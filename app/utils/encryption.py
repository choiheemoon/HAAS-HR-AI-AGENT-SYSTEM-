"""암호화 유틸리티"""
from cryptography.fernet import Fernet
from app.config import settings
import base64


def get_encryption_key() -> bytes:
    """암호화 키 생성 (실제로는 환경 변수에서 가져오기)"""
    # 실제로는 안전한 키 관리 필요
    key = settings.SECRET_KEY.encode()[:32]
    return base64.urlsafe_b64encode(key.ljust(32, b'0'))


def encrypt_sensitive_data(data: str) -> str:
    """민감 데이터 암호화"""
    if not data:
        return data
    
    key = get_encryption_key()
    fernet = Fernet(key)
    encrypted = fernet.encrypt(data.encode())
    return encrypted.decode()


def decrypt_sensitive_data(encrypted_data: str) -> str:
    """민감 데이터 복호화"""
    if not encrypted_data:
        return encrypted_data
    
    key = get_encryption_key()
    fernet = Fernet(key)
    decrypted = fernet.decrypt(encrypted_data.encode())
    return decrypted.decode()
