"""AI Agent 핵심 시스템"""
from typing import List, Dict, Any, Optional
from app.config import settings
from sqlalchemy.orm import Session

try:
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, SystemMessage
    try:
        from langchain.agents import create_openai_tools_agent, AgentExecutor
        from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
        AGENT_AVAILABLE = True
    except ImportError:
        AGENT_AVAILABLE = False
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False
    AGENT_AVAILABLE = False


class HRAIAgent:
    """HR AI Agent 핵심 클래스"""
    
    def __init__(self, db: Optional[Session] = None):
        """AI Agent 초기화"""
        if not LANGCHAIN_AVAILABLE:
            raise ImportError("LangChain이 설치되지 않았습니다. pip install langchain langchain-openai")
        
        if not settings.OPENAI_API_KEY:
            # API 키가 없어도 초기화는 가능하지만, 실제 사용 시 오류 발생
            self.llm = None
            self.agent = None
        else:
            self.llm = ChatOpenAI(
                temperature=0,
                model=settings.OPENAI_MODEL,
                api_key=settings.OPENAI_API_KEY
            )
            self.db = db
            self.agent = None
    
    def _initialize_agent(self, tools: List):
        """Agent 초기화 (도구 포함)"""
        if not self.llm or not AGENT_AVAILABLE:
            return None
        
        try:
            from app.core.tools import create_hr_tools
            
            # HR 도구 생성
            hr_tools = create_hr_tools(self.db) if self.db else []
            all_tools = tools + hr_tools
            
            if not all_tools:
                return None
            
            # 프롬프트 템플릿
            prompt = ChatPromptTemplate.from_messages([
                ("system", """당신은 HR(인사관리) 전문 AI 어시스턴트입니다. 
다음 도구들을 사용하여 사용자의 질문에 답변하고 실제 작업을 수행할 수 있습니다:

사용 가능한 도구:
- get_employee_info: 직원 정보 조회
- list_employees: 직원 목록 조회
- get_dashboard_stats: 대시보드 통계 조회
- calculate_payroll_info: 급여 정보 조회
- calculate_payroll: 급여 계산 실행 (새로운 급여 계산)
- get_attendance_summary: 근태 요약 조회
- generate_report: 리포트 생성

항상 한국어로 답변하고, 필요시 도구를 사용하여 실제 데이터를 조회한 후 답변하세요.
답변은 구체적이고 실용적이어야 합니다."""),
                MessagesPlaceholder(variable_name="chat_history"),
                ("human", "{input}"),
                MessagesPlaceholder(variable_name="agent_scratchpad"),
            ])
            
            # Agent 생성
            agent = create_openai_tools_agent(self.llm, all_tools, prompt)
            executor = AgentExecutor(agent=agent, tools=all_tools, verbose=True)
            
            return executor
        except Exception as e:
            print(f"Agent 초기화 오류: {str(e)}")
            return None
    
    def run(self, query: str, use_tools: bool = True) -> str:
        """쿼리 실행"""
        if not self.llm:
            return "OpenAI API 키가 설정되지 않았습니다. .env 파일에 OPENAI_API_KEY를 설정하세요."
        
        try:
            # 도구를 사용하는 Agent 모드
            if use_tools and self.db and AGENT_AVAILABLE:
                if not self.agent:
                    self.agent = self._initialize_agent([])
                
                if self.agent:
                    try:
                        result = self.agent.invoke({"input": query, "chat_history": []})
                        return result.get("output", "답변을 생성할 수 없습니다.")
                    except Exception as e:
                        # Agent 실행 실패 시 기본 모드로 fallback
                        print(f"Agent 실행 오류, 기본 모드로 전환: {str(e)}")
            
            # 기본 LLM 모드 (도구 없이 또는 Agent 사용 불가 시)
            # 도구 정보를 프롬프트에 포함하여 AI가 참고할 수 있도록
            system_prompt = """당신은 HR(인사관리) 전문 AI 어시스턴트입니다. 
사용자의 질문에 대해 도움이 되는 답변을 한국어로 제공하세요.

사용 가능한 시스템 기능:
- 직원 정보 조회 (직원 ID 또는 이름으로)
- 직원 목록 조회 (부서별 필터링 가능)
- 대시보드 통계 조회
- 급여 정보 조회
- 급여 계산 실행 (새로운 급여 계산 수행)
- 근태 정보 조회
- 리포트 생성 (이직률, 채용, 급여비용)

답변은 구체적이고 실용적이어야 합니다. 
사용자가 특정 데이터를 요청하면, 해당 데이터를 조회하는 방법을 안내하거나 
시스템의 실제 기능을 활용할 수 있다고 설명하세요."""
            
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=query)
            ]
            response = self.llm.invoke(messages)
            return response.content
        except Exception as e:
            return f"오류 발생: {str(e)}"
    
    def predict(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """예측 분석"""
        # AI 기반 예측 로직
        return {"raw_result": "예측 기능은 구현 중입니다."}


class RecruitmentAgent:
    """채용 AI Agent"""
    
    def __init__(self, base_agent: HRAIAgent):
        self.base_agent = base_agent
    
    def parse_resume(self, resume_text: str, resume_file_path: Optional[str] = None) -> Dict[str, Any]:
        """이력서 파싱"""
        prompt = f"""
        다음 이력서를 분석하여 구조화된 데이터로 변환하세요:
        
        {resume_text}
        
        다음 정보를 추출하세요:
        - 이름, 연락처, 이메일
        - 학력 (학교명, 전공, 졸업년도)
        - 경력 (회사명, 직책, 기간, 담당업무)
        - 기술 스택 및 자격증
        - 기타 정보
        """
        
        result = self.base_agent.run(prompt)
        return self._parse_result(result)
    
    def match_candidate(self, candidate_data: Dict[str, Any], job_description: str) -> Dict[str, Any]:
        """후보자 매칭 점수 계산"""
        prompt = f"""
        다음 후보자 정보와 채용 공고를 비교하여 매칭 점수를 계산하세요:
        
        후보자 정보:
        {candidate_data}
        
        채용 공고:
        {job_description}
        
        매칭 점수(0-100), 강점, 약점을 분석하세요.
        """
        
        result = self.base_agent.run(prompt)
        return self._parse_result(result)
    
    def generate_job_posting(self, requirements: Dict[str, Any]) -> str:
        """채용 공고 생성"""
        prompt = f"""
        다음 요구사항에 맞는 채용 공고를 작성하세요:
        
        {requirements}
        
        매력적이고 명확한 채용 공고를 작성하세요.
        """
        
        return self.base_agent.run(prompt)
    
    def _parse_result(self, result: str) -> Dict[str, Any]:
        """결과 파싱"""
        # 실제로는 더 정교한 파싱 로직 필요
        return {"raw_result": result}


class PayrollAgent:
    """급여 계산 AI Agent"""
    
    def __init__(self, base_agent: HRAIAgent):
        self.base_agent = base_agent
    
    def calculate_payroll(self, employee_data: Dict[str, Any], attendance_data: Dict[str, Any]) -> Dict[str, Any]:
        """급여 계산"""
        prompt = f"""
        다음 정보를 바탕으로 급여를 계산하세요:
        
        직원 정보:
        {employee_data}
        
        근태 정보:
        {attendance_data}
        
        기본급, 수당, 공제, 실수령액을 계산하세요.
        """
        
        result = self.base_agent.run(prompt)
        return self._parse_result(result)
    
    def calculate_tax(self, payroll_data: Dict[str, Any], tax_rules: Dict[str, Any]) -> Dict[str, Any]:
        """세금 계산"""
        prompt = f"""
        다음 급여 정보를 바탕으로 세금을 계산하세요:
        
        급여 정보:
        {payroll_data}
        
        세금 규칙:
        {tax_rules}
        
        소득세, 지방소득세, 4대보험을 계산하세요.
        """
        
        result = self.base_agent.run(prompt)
        return self._parse_result(result)
    
    def _parse_result(self, result: str) -> Dict[str, Any]:
        """결과 파싱"""
        return {"raw_result": result}


class ReportAgent:
    """리포트 생성 AI Agent"""
    
    def __init__(self, base_agent: HRAIAgent):
        self.base_agent = base_agent
    
    def generate_report(self, data: Dict[str, Any], report_type: str) -> str:
        """리포트 생성"""
        prompt = f"""
        다음 데이터를 바탕으로 {report_type} 리포트를 생성하세요:
        
        {data}
        
        인사이트와 권장사항을 포함하여 리포트를 작성하세요.
        """
        
        return self.base_agent.run(prompt)
    
    def analyze_trends(self, historical_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """트렌드 분석"""
        prompt = f"""
        다음 과거 데이터를 분석하여 트렌드를 파악하세요:
        
        {historical_data}
        
        이직률, 채용 기간, 급여 트렌드 등을 분석하세요.
        """
        
        result = self.base_agent.run(prompt)
        return self._parse_result(result)
    
    def _parse_result(self, result: str) -> Dict[str, Any]:
        """결과 파싱"""
        return {"raw_result": result}
