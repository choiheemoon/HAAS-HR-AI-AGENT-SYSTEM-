"""AI 소싱 서비스"""
from typing import List, Dict, Any
from app.core.ai_agent import RecruitmentAgent, HRAIAgent


class AISourcing:
    """AI 기반 후보자 소싱"""
    
    def __init__(self, db=None):
        self.base_agent = HRAIAgent(db=db)
        self.recruitment_agent = RecruitmentAgent(self.base_agent)
    
    def search(self, job_description: str, requirements: Dict[str, Any]) -> List[Dict[str, Any]]:
        """후보자 검색"""
        # 실제로는 외부 API (LinkedIn, Indeed 등)를 호출하거나
        # 내부 데이터베이스를 검색
        
        # 여기서는 시뮬레이션
        candidates = [
            {
                "name": "후보자 1",
                "email": "candidate1@example.com",
                "match_score": 85,
                "skills": ["Python", "FastAPI", "PostgreSQL"],
                "experience": 5
            },
            {
                "name": "후보자 2",
                "email": "candidate2@example.com",
                "match_score": 78,
                "skills": ["Python", "Django", "MySQL"],
                "experience": 3
            }
        ]
        
        return candidates
    
    def analyze_profile(self, profile_data: Dict[str, Any], job_description: str) -> Dict[str, Any]:
        """프로필 분석"""
        match_result = self.recruitment_agent.match_candidate(profile_data, job_description)
        return match_result
