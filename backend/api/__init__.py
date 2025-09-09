"""
API Module

Flask 웹 API 엔드포인트 담당 모듈
- RESTful API 엔드포인트 정의
- 요청/응답 데이터 검증
- 인증 및 권한 관리 (필요시)
- API 문서화 및 스웨거 통합

주요 기능:
- 이미지 생성 API 엔드포인트
- 모델 관리 API (목록, 로드, 언로드)
- 전처리기 API (실행, 파라미터 설정)
- 파일 업로드/다운로드 API
- 시스템 상태 모니터링 API

예상 클래스:
- ImageAPI: 이미지 생성 관련 엔드포인트
- ModelAPI: 모델 관리 엔드포인트  
- PreprocessorAPI: 전처리기 엔드포인트
- SystemAPI: 시스템 정보 엔드포인트
"""