"""이메일 발송 유틸리티"""
from typing import Optional
import os
from app.config import settings
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders


def send_email(
    to: str,
    subject: str,
    body: str,
    attachment: Optional[str] = None,
    html_body: Optional[str] = None,
):
    """이메일 발송"""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        raise ValueError("SMTP 설정이 없습니다. SMTP_HOST/SMTP_USER를 확인하세요.")
    if not settings.SMTP_PASSWORD:
        raise ValueError("SMTP 비밀번호가 없습니다. SMTP_PASSWORD를 확인하세요.")
    
    server = None
    try:
        msg = MIMEMultipart()
        msg['From'] = settings.SMTP_FROM or settings.SMTP_USER
        msg['To'] = to
        msg['Subject'] = subject
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        if html_body:
            msg.attach(MIMEText(html_body, 'html', 'utf-8'))
        
        if attachment:
            with open(attachment, 'rb') as f:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {os.path.basename(attachment)}'
                )
                msg.attach(part)
        
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30)
        if settings.SMTP_USE_TLS:
            server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
    except Exception as e:
        raise RuntimeError(f"이메일 발송 오류: {str(e)}") from e
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass
