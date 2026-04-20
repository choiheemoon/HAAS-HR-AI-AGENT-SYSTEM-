"""AI Agent 채팅 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.core.ai_agent import HRAIAgent

router = APIRouter()


class ChatMessage(BaseModel):
    """채팅 메시지"""
    role: str  # user, assistant
    content: str
    timestamp: Optional[datetime] = None


class ChatRequest(BaseModel):
    """채팅 요청"""
    message: str
    conversation_id: Optional[str] = None
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    """채팅 응답"""
    response: str
    conversation_id: str
    timestamp: datetime


# 대화 기록 저장 (실제로는 데이터베이스에 저장)
conversations = {}


@router.post("/chat", response_model=ChatResponse)
def chat_with_ai(
    request: ChatRequest,
    db: Session = Depends(get_db)
):
    """AI Agent와 채팅 (Workflow 실행 가능)"""
    try:
        # AI Agent 초기화 (데이터베이스 세션 전달)
        agent = HRAIAgent(db=db)
        
        # 컨텍스트가 있으면 추가
        if request.context:
            context_prompt = f"\n\n컨텍스트 정보:\n{request.context}\n\n"
            full_message = context_prompt + request.message
        else:
            full_message = request.message
        
        # Workflow 실행 가능한 Agent 모드로 실행
        # use_tools=True로 설정하면 실제 시스템 작업 수행 가능
        response = agent.run(full_message, use_tools=True)
        
        # 대화 ID 생성 또는 사용
        conversation_id = request.conversation_id or f"conv_{datetime.now().timestamp()}"
        
        # 대화 기록 저장
        if conversation_id not in conversations:
            conversations[conversation_id] = []
        
        conversations[conversation_id].append({
            "role": "user",
            "content": request.message,
            "timestamp": datetime.now()
        })
        conversations[conversation_id].append({
            "role": "assistant",
            "content": response,
            "timestamp": datetime.now()
        })
        
        return ChatResponse(
            response=response,
            conversation_id=conversation_id,
            timestamp=datetime.now()
        )
    
    except ValueError as e:
        # OpenAI API 키가 없는 경우
        raise HTTPException(
            status_code=400,
            detail=f"AI Agent 초기화 오류: {str(e)}. .env 파일에 OPENAI_API_KEY를 설정하세요."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"채팅 처리 오류: {str(e)}")


@router.get("/chat/history/{conversation_id}")
def get_chat_history(conversation_id: str):
    """대화 기록 조회"""
    if conversation_id not in conversations:
        return {"messages": []}
    
    return {"messages": conversations[conversation_id]}


@router.delete("/chat/history/{conversation_id}")
def delete_chat_history(conversation_id: str):
    """대화 기록 삭제"""
    if conversation_id in conversations:
        del conversations[conversation_id]
    return {"message": "대화 기록이 삭제되었습니다."}


@router.get("/chat/conversations")
def list_conversations():
    """대화 목록 조회"""
    return {
        "conversations": [
            {
                "id": conv_id,
                "message_count": len(messages),
                "last_message": messages[-1]["timestamp"] if messages else None
            }
            for conv_id, messages in conversations.items()
        ]
    }
