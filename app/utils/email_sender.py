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
        if attachment:
            # 첨부가 있는 경우: multipart/mixed 안에 multipart/alternative(plain+html)를 넣는다.
            msg = MIMEMultipart('mixed')
            alt = MIMEMultipart('alternative')
            alt.attach(MIMEText(body, 'plain', 'utf-8'))
            if html_body:
                alt.attach(MIMEText(html_body, 'html', 'utf-8'))
            msg.attach(alt)
        elif html_body:
            # 첨부가 없고 HTML 본문이 있는 경우: multipart/alternative로 전송해야
            # 일부 메일 클라이언트에서 HTML이 첨부파일처럼 보이지 않는다.
            msg = MIMEMultipart('alternative')
            msg.attach(MIMEText(body, 'plain', 'utf-8'))
            msg.attach(MIMEText(html_body, 'html', 'utf-8'))
        else:
            msg = MIMEText(body, 'plain', 'utf-8')

        msg['From'] = settings.SMTP_FROM or settings.SMTP_USER
        msg['To'] = to
        msg['Subject'] = subject

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
