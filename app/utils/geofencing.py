"""GPS 지오펜싱 유틸리티"""
from typing import Dict, Optional
from math import radians, cos, sin, asin, sqrt


def check_geofence(location: Dict[str, float], employee_id: int, 
                   allowed_locations: Optional[list] = None) -> bool:
    """지오펜싱 확인"""
    if not allowed_locations:
        # 기본 허용 위치 (실제로는 데이터베이스에서 가져오기)
        allowed_locations = [
            {"lat": 37.5665, "lng": 126.9780, "radius": 1000}  # 서울시청 기준 1km
        ]
    
    user_lat = location.get("lat")
    user_lng = location.get("lng")
    
    if not user_lat or not user_lng:
        return False
    
    # 허용된 위치 중 하나라도 범위 내에 있는지 확인
    for allowed_loc in allowed_locations:
        distance = calculate_distance(
            user_lat, user_lng,
            allowed_loc["lat"], allowed_loc["lng"]
        )
        
        if distance <= allowed_loc["radius"]:
            return True
    
    return False


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 지점 간 거리 계산 (미터 단위)"""
    # Haversine 공식 사용
    R = 6371000  # 지구 반경 (미터)
    
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lng = radians(lng2 - lng1)
    
    a = sin(delta_lat / 2) ** 2 + \
        cos(lat1_rad) * cos(lat2_rad) * sin(delta_lng / 2) ** 2
    c = 2 * asin(sqrt(a))
    
    return R * c
