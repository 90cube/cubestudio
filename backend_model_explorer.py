#!/usr/bin/env python3
"""
CUBE Studio - Model Explorer FastAPI Backend
포트: 9001에서 실행되는 모델 탐색기 백엔드
"""

import os
import json
from pathlib import Path
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="CUBE Studio Model Explorer", version="1.0.0")

# CORS 미들웨어 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발용 - 프로덕션에서는 특정 도메인만 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 모델 경로 설정
MODELS_BASE_PATH = Path("models")
CHECKPOINTS_PATH = MODELS_BASE_PATH / "checkpoints"
VAES_PATH = MODELS_BASE_PATH / "vae"
LORAS_PATH = MODELS_BASE_PATH / "loras"

class ModelFile(BaseModel):
    """모델 파일 정보"""
    name: str
    path: str
    subfolder: str
    size: Optional[int] = None
    preview_image: Optional[str] = None

def get_model_files(base_path: Path, extensions: List[str]) -> List[ModelFile]:
    """
    지정된 경로에서 모델 파일들을 찾아 리스트로 반환
    
    Args:
        base_path: 검색할 기본 경로
        extensions: 찾을 파일 확장자 리스트
    
    Returns:
        모델 파일 정보 리스트
    """
    model_files = []
    
    if not base_path.exists():
        return model_files
    
    for file_path in base_path.rglob("*"):
        if file_path.is_file() and file_path.suffix.lower() in extensions:
            # 상대 경로 계산
            relative_path = file_path.relative_to(base_path)
            subfolder = str(relative_path.parent) if relative_path.parent != Path(".") else ""
            
            # 프리뷰 이미지 찾기
            preview_image = find_preview_image(file_path)
            
            model_file = ModelFile(
                name=file_path.name,
                path=str(relative_path),
                subfolder=subfolder,
                size=file_path.stat().st_size if file_path.exists() else None,
                preview_image=preview_image
            )
            
            model_files.append(model_file)
    
    return model_files

def find_preview_image(model_path: Path) -> Optional[str]:
    """
    모델 파일의 프리뷰 이미지를 찾습니다.
    같은 폴더에서 같은 이름의 .png, .jpg, .jpeg 파일을 찾습니다.
    """
    base_name = model_path.stem
    folder = model_path.parent
    
    for ext in ['.png', '.jpg', '.jpeg']:
        preview_path = folder / f"{base_name}{ext}"
        if preview_path.exists():
            # 상대 경로 반환 (웹에서 접근 가능하도록)
            return str(preview_path.relative_to(MODELS_BASE_PATH))
    
    return None

def categorize_models_by_type(models: List[ModelFile]) -> Dict[str, List[ModelFile]]:
    """
    모델들을 타입별로 분류합니다 (SD15, SDXL, 기타)
    """
    categorized = {
        "sd15": [],
        "sdxl": [],
        "기타": []
    }
    
    for model in models:
        subfolder_lower = model.subfolder.lower()
        
        if "sd15" in subfolder_lower:
            categorized["sd15"].append(model)
        elif "sdxl" in subfolder_lower or "ilxl" in subfolder_lower:
            categorized["sdxl"].append(model)
        else:
            categorized["기타"].append(model)
    
    return categorized

@app.get("/")
async def root():
    """루트 엔드포인트"""
    return {"message": "CUBE Studio Model Explorer API", "version": "1.0.0"}

@app.get("/api/models/checkpoints", response_model=List[ModelFile])
async def get_checkpoints():
    """체크포인트 모델 목록 반환"""
    try:
        extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        models = get_model_files(CHECKPOINTS_PATH, extensions)
        return models
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"체크포인트 로딩 실패: {str(e)}")

@app.get("/api/models/vaes", response_model=List[ModelFile])
async def get_vaes():
    """VAE 모델 목록 반환"""
    try:
        extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        models = get_model_files(VAES_PATH, extensions)
        return models
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VAE 로딩 실패: {str(e)}")

@app.get("/api/models/loras", response_model=List[ModelFile])
async def get_loras():
    """LoRA 모델 목록 반환"""
    try:
        extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        models = get_model_files(LORAS_PATH, extensions)
        return models
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LoRA 로딩 실패: {str(e)}")

@app.get("/api/models/checkpoints/categorized")
async def get_checkpoints_categorized():
    """타입별로 분류된 체크포인트 목록 반환"""
    try:
        extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        models = get_model_files(CHECKPOINTS_PATH, extensions)
        categorized = categorize_models_by_type(models)
        return categorized
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"체크포인트 분류 실패: {str(e)}")

@app.get("/api/models/info")
async def get_models_info():
    """전체 모델 정보 요약"""
    try:
        extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        
        checkpoints = get_model_files(CHECKPOINTS_PATH, extensions)
        vaes = get_model_files(VAES_PATH, extensions)
        loras = get_model_files(LORAS_PATH, extensions)
        
        checkpoints_categorized = categorize_models_by_type(checkpoints)
        
        return {
            "checkpoints": {
                "total": len(checkpoints),
                "by_type": {k: len(v) for k, v in checkpoints_categorized.items()}
            },
            "vaes": {
                "total": len(vaes)
            },
            "loras": {
                "total": len(loras)
            },
            "paths": {
                "checkpoints": str(CHECKPOINTS_PATH),
                "vaes": str(VAES_PATH),
                "loras": str(LORAS_PATH)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"모델 정보 로딩 실패: {str(e)}")

@app.get("/api/models/preview/{file_path:path}")
async def get_model_preview(file_path: str):
    """모델 프리뷰 이미지 서비스"""
    try:
        # 보안: 상위 디렉토리 접근 방지
        if ".." in file_path or file_path.startswith("/"):
            raise HTTPException(status_code=400, detail="잘못된 파일 경로")
        
        full_path = MODELS_BASE_PATH / file_path
        
        if not full_path.exists() or not full_path.is_file():
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
        
        # 이미지 파일만 허용
        allowed_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}
        if full_path.suffix.lower() not in allowed_extensions:
            raise HTTPException(status_code=400, detail="지원하지 않는 이미지 형식")
        
        return FileResponse(
            path=str(full_path),
            media_type=f"image/{full_path.suffix[1:]}",
            headers={"Cache-Control": "public, max-age=3600"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이미지 로딩 실패: {str(e)}")

# 정적 파일 서비스 설정 (모델 폴더)
app.mount("/models", StaticFiles(directory="models", html=False), name="models")

if __name__ == "__main__":
    print("CUBE Studio Model Explorer Backend 시작 중...")
    print(f"모델 경로: {MODELS_BASE_PATH.absolute()}")
    print(f"서버 URL: http://localhost:9001")
    print(f"API 문서: http://localhost:9001/docs")
    
    uvicorn.run(
        "backend_model_explorer:app",
        host="0.0.0.0",
        port=9001,
        reload=True,
        log_level="info"
    )