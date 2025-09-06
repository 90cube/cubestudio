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
import cv2
import numpy as np
import base64
import io
from PIL import Image
from PIL.ExifTags import TAGS
import datetime
import re
import shutil

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
PREPROCESSORS_PATH = MODELS_BASE_PATH / "preprocessors"

class ModelFile(BaseModel):
    """모델 파일 정보"""
    name: str
    path: str
    subfolder: str
    size: Optional[int] = None
    preview_image: Optional[str] = None

class PreprocessRequest(BaseModel):
    """전처리 요청 데이터"""
    image: str  # Base64 encoded image
    model: str  # 전처리 모델 ID
    params: Optional[Dict] = None

class PreprocessResponse(BaseModel):
    """전처리 응답 데이터"""
    success: bool
    processed_image: Optional[str] = None
    model_used: str
    error: Optional[str] = None

class SaveImageRequest(BaseModel):
    """이미지 저장 요청 데이터"""
    image: str  # Base64 encoded image
    filename: str  # 파일명
    path: str  # 저장 경로
    type: str  # 이미지 타입 (t2i, detail, upscaled, preprocessor 등)
    metadata: Optional[Dict] = None  # 메타데이터 (EXIF)
    quality_settings: Optional[Dict] = None  # 품질 설정

class SaveImageResponse(BaseModel):
    """이미지 저장 응답 데이터"""
    success: bool
    saved_path: Optional[str] = None
    filename: str
    file_size: Optional[int] = None
    error: Optional[str] = None

class DepthRequest(BaseModel):
    """Depth 전처리 요청 데이터"""
    image: str  # Base64 encoded image
    model: str  # Depth 모델 ID
    params: Optional[Dict] = None

class DepthResponse(BaseModel):
    """Depth 전처리 응답 데이터"""
    success: bool
    depth_map: Optional[str] = None
    model_used: str
    error: Optional[str] = None

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

class PreprocessorManager:
    """전처리기 모델 매니저"""
    
    def __init__(self):
        self.models = {}
        self.load_models()
    
    def load_models(self):
        """사용 가능한 모델들 로드"""
        model_configs = {
            'builtin': {'name': 'Built-in Algorithm (JavaScript)', 'type': 'builtin'},
            'opencv_canny': {'name': 'OpenCV Canny', 'type': 'opencv'},
            'network-bsds500': {'name': 'HED Edge Detection', 'type': 'model', 'file': 'network-bsds500.pth'},
            'table5_pidinet': {'name': 'PiDiNet Edge Detection', 'type': 'model', 'file': 'table5_pidinet.pth'},
            'ControlNetHED': {'name': 'ControlNet HED', 'type': 'model', 'file': 'ControlNetHED.pth'},
            'dpt_hybrid-midas': {'name': 'MiDaS Depth', 'type': 'model', 'file': 'dpt_hybrid-midas-501f0c75.pt'},
            'midas_v21_384': {'name': 'MiDaS v2.1', 'type': 'model', 'file': 'midas_v21_384.pt'},
            'ZoeD_M12_N': {'name': 'ZoeDepth', 'type': 'model', 'file': 'ZoeD_M12_N.pt'},
        }
        
        for model_id, config in model_configs.items():
            if config['type'] in ['builtin', 'opencv']:
                self.models[model_id] = config
            else:
                # 실제 모델 파일이 존재하는지 확인
                model_path = PREPROCESSORS_PATH / config['file']
                if model_path.exists():
                    config['path'] = str(model_path)
                    self.models[model_id] = config
                else:
                    print(f"Model file not found: {model_path}")
    
    def process_image(self, image_data: str, model_id: str, params: Dict = None) -> str:
        """이미지 전처리 실행"""
        if model_id not in self.models:
            raise ValueError(f"Unknown model: {model_id}")
        
        model = self.models[model_id]
        
        # Base64 이미지를 numpy 배열로 변환
        image_array = self.decode_image(image_data)
        
        # 모델 타입에 따라 처리
        if model_id == 'opencv_canny':
            result = self.process_opencv_canny(image_array, params or {})
        elif model['type'] == 'model':
            # 실제 모델은 플레이스홀더로 처리 (실제 구현에서는 모델 로드 필요)
            result = self.process_placeholder(image_array, model['name'])
        else:
            raise ValueError(f"Unsupported model type: {model['type']}")
        
        # 결과를 Base64로 인코딩하여 반환
        return self.encode_image(result)
    
    def decode_image(self, base64_data: str) -> np.ndarray:
        """Base64 이미지를 numpy 배열로 변환"""
        # data:image/png;base64, 제거
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        # Base64 디코딩
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # RGB로 변환하고 numpy 배열로 변환
        if image.mode == 'RGBA':
            image = image.convert('RGB')
        
        return np.array(image)
    
    def encode_image(self, image_array: np.ndarray) -> str:
        """numpy 배열을 Base64 이미지로 변환"""
        # numpy 배열을 PIL 이미지로 변환
        if len(image_array.shape) == 3:
            image = Image.fromarray(image_array.astype(np.uint8))
        else:
            # 그레이스케일인 경우
            image = Image.fromarray(image_array.astype(np.uint8), mode='L')
        
        # Base64로 인코딩
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)
        
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    def process_opencv_canny(self, image: np.ndarray, params: Dict) -> np.ndarray:
        """OpenCV Canny 엣지 검출"""
        # RGB를 그레이스케일로 변환
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        # 파라미터 추출
        low_threshold = params.get('lowThreshold', 100)
        high_threshold = params.get('highThreshold', 200)
        
        # Canny 엣지 검출
        edges = cv2.Canny(gray, int(low_threshold), int(high_threshold))
        
        # 3채널로 변환 (흰색 엣지, 검은색 배경)
        result = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        
        return result
    
    def process_placeholder(self, image: np.ndarray, model_name: str) -> np.ndarray:
        """플레이스홀더 처리 (실제 모델 구현 예정)"""
        height, width = image.shape[:2]
        result = np.zeros((height, width, 3), dtype=np.uint8)
        
        # 플레이스홀더 텍스트 그리기
        result.fill(50)  # 어두운 배경
        
        # OpenCV로 텍스트 그리기
        font = cv2.FONT_HERSHEY_SIMPLEX
        text = f"TODO: {model_name}"
        text_size = cv2.getTextSize(text, font, 0.7, 2)[0]
        text_x = (width - text_size[0]) // 2
        text_y = (height + text_size[1]) // 2
        
        cv2.putText(result, text, (text_x, text_y), font, 0.7, (100, 150, 255), 2)
        
        return result

class ImageSaveManager:
    """이미지 저장 관리자"""
    
    def __init__(self):
        # 기본 출력 경로들
        self.base_output_path = Path("output")
        self.default_paths = {
            't2i': self.base_output_path / 't2i',
            'i2i': self.base_output_path / 'i2i',
            'detail': self.base_output_path / 'detail',
            'upscaled': self.base_output_path / 'upscaled',
            'preprocessor': self.base_output_path / 'preprocessor',
            'controlnet': self.base_output_path / 'controlnet',
            'custom': self.base_output_path / 'custom'
        }
        
        # 지원하는 이미지 포맷
        self.supported_formats = {
            'png': {'ext': '.png', 'pil_format': 'PNG'},
            'jpg': {'ext': '.jpg', 'pil_format': 'JPEG'},
            'jpeg': {'ext': '.jpg', 'pil_format': 'JPEG'},
            'webp': {'ext': '.webp', 'pil_format': 'WebP'}
        }
    
    def ensure_directory(self, path: Path):
        """디렉토리가 없으면 생성"""
        path.mkdir(parents=True, exist_ok=True)
    
    def sanitize_filename(self, filename: str) -> str:
        """파일명에서 위험한 문자들 제거"""
        # Windows 금지 문자들 제거
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        # 제어 문자 제거
        filename = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', filename)
        # 연속된 공백이나 점 정리
        filename = re.sub(r'[\s.]+', '_', filename)
        # 앞뒤 공백/점 제거
        filename = filename.strip('. _')
        
        return filename or 'untitled'
    
    def generate_unique_filename(self, directory: Path, base_filename: str) -> str:
        """중복되지 않는 파일명 생성"""
        name_part = base_filename.rsplit('.', 1)[0]
        ext_part = '.' + base_filename.rsplit('.', 1)[1] if '.' in base_filename else ''
        
        counter = 1
        unique_filename = base_filename
        
        while (directory / unique_filename).exists():
            unique_filename = f"{name_part}_{counter:03d}{ext_part}"
            counter += 1
            
            # 무한 루프 방지
            if counter > 9999:
                unique_filename = f"{name_part}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')}{ext_part}"
                break
        
        return unique_filename
    
    def decode_base64_image(self, base64_data: str) -> Image.Image:
        """Base64 이미지를 PIL Image로 변환"""
        # data:image/png;base64, 제거
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        # Base64 디코딩
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        return image
    
    def add_metadata(self, image: Image.Image, metadata: Dict) -> Image.Image:
        """이미지에 EXIF 메타데이터 추가"""
        if not metadata:
            return image
        
        try:
            # PNG는 메타데이터를 info에 저장
            if image.format == 'PNG' or not hasattr(image, 'format'):
                image.info.update(metadata)
            else:
                # JPEG 등은 EXIF 데이터 사용
                # 실제 EXIF 구현은 복잡하므로 간단한 info 저장
                image.info.update(metadata)
        except Exception as e:
            print(f"Warning: Failed to add metadata: {e}")
        
        return image
    
    def save_image(self, 
                   base64_image: str, 
                   filename: str, 
                   save_path: str, 
                   image_type: str,
                   metadata: Dict = None,
                   quality_settings: Dict = None) -> Dict:
        """이미지를 지정된 경로에 저장"""
        try:
            # 기본 품질 설정
            default_quality = {
                'format': 'png',
                'png_compression': 6,
                'jpg_quality': 90,
                'webp_quality': 90,
                'save_metadata': True
            }
            
            if quality_settings:
                default_quality.update(quality_settings)
            
            # Base64 이미지 디코딩
            image = self.decode_base64_image(base64_image)
            
            # 메타데이터 추가
            if default_quality['save_metadata'] and metadata:
                image = self.add_metadata(image, metadata)
            
            # 저장 경로 설정
            if save_path.startswith('./'):
                save_directory = Path(save_path[2:])  # ./ 제거
            else:
                save_directory = Path(save_path)
            
            # 절대 경로로 변환
            if not save_directory.is_absolute():
                save_directory = Path.cwd() / save_directory
            
            # 디렉토리 생성
            self.ensure_directory(save_directory)
            
            # 파일명 정리
            clean_filename = self.sanitize_filename(filename)
            
            # 파일 확장자 확인/추가
            image_format = default_quality['format'].lower()
            if image_format not in self.supported_formats:
                image_format = 'png'
            
            format_info = self.supported_formats[image_format]
            if not clean_filename.endswith(format_info['ext']):
                clean_filename += format_info['ext']
            
            # 중복 파일명 처리
            unique_filename = self.generate_unique_filename(save_directory, clean_filename)
            full_path = save_directory / unique_filename
            
            # 이미지 저장
            save_kwargs = {}
            
            if image_format == 'png':
                save_kwargs['optimize'] = True
                save_kwargs['compress_level'] = default_quality['png_compression']
            elif image_format in ['jpg', 'jpeg']:
                save_kwargs['quality'] = default_quality['jpg_quality']
                save_kwargs['optimize'] = True
                # JPEG는 RGBA를 지원하지 않음
                if image.mode in ('RGBA', 'LA'):
                    # 흰색 배경으로 합성
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    if image.mode == 'LA':
                        image = image.convert('RGBA')
                    background.paste(image, mask=image.split()[-1])
                    image = background
            elif image_format == 'webp':
                save_kwargs['quality'] = default_quality['webp_quality']
                save_kwargs['optimize'] = True
            
            # 저장 실행
            image.save(full_path, format_info['pil_format'], **save_kwargs)
            
            # 결과 반환
            file_size = full_path.stat().st_size
            
            return {
                'success': True,
                'saved_path': str(full_path),
                'filename': unique_filename,
                'file_size': file_size,
                'directory': str(save_directory),
                'format': image_format
            }
            
        except Exception as e:
            print(f"Error saving image: {e}")
            return {
                'success': False,
                'error': str(e),
                'filename': filename
            }

class DepthProcessor:
    """Depth Map 전처리 프로세서"""
    
    def __init__(self):
        self.models = {
            'builtin_depth': {'name': 'Built-in Depth (JavaScript)', 'type': 'builtin'},
            'midas_v3': {'name': 'MiDaS v3.1 (DPT-Large)', 'type': 'ai_model'},
            'midas_v2': {'name': 'MiDaS v2.1 (ResNet)', 'type': 'ai_model'},
            'dpt_hybrid': {'name': 'DPT-Hybrid', 'type': 'ai_model'},
            'depth_anything': {'name': 'Depth Anything V2', 'type': 'ai_model'}
        }
    
    def process_depth(self, image_data: str, model_id: str, params: Dict = None) -> str:
        """Depth Map 생성"""
        if model_id not in self.models:
            raise ValueError(f"Unknown depth model: {model_id}")
        
        model = self.models[model_id]
        
        # Base64 이미지를 numpy 배열로 변환
        image_array = self.decode_image(image_data)
        
        # 모델 타입에 따라 처리
        if model_id == 'builtin_depth':
            result = self.process_builtin_depth(image_array, params or {})
        elif model['type'] == 'ai_model':
            # 실제 AI 모델은 플레이스홀더로 처리
            result = self.process_ai_depth_placeholder(image_array, model['name'])
        else:
            raise ValueError(f"Unsupported depth model type: {model['type']}")
        
        # 결과를 Base64로 인코딩하여 반환
        return self.encode_image(result)
    
    def decode_image(self, base64_data: str) -> np.ndarray:
        """Base64 이미지를 numpy 배열로 변환"""
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        if image.mode == 'RGBA':
            image = image.convert('RGB')
        
        return np.array(image)
    
    def encode_image(self, image_array: np.ndarray) -> str:
        """numpy 배열을 Base64 이미지로 변환"""
        if len(image_array.shape) == 3:
            image = Image.fromarray(image_array.astype(np.uint8))
        else:
            image = Image.fromarray(image_array.astype(np.uint8), mode='L')
        
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)
        
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    def process_builtin_depth(self, image: np.ndarray, params: Dict) -> np.ndarray:
        """내장 Depth Map 알고리즘 (단순한 그레이스케일 + 블러)"""
        try:
            # 그레이스케일 변환
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            
            # 파라미터 추출 및 범위 제한
            contrast = max(0.1, min(3.0, params.get('contrast', 1.2)))
            brightness = max(-1.0, min(1.0, params.get('brightness', 0.1)))
            smoothing = max(0, min(10, int(params.get('smoothing', 2))))
            
            # 간단한 깊이 추정 (밝기 기반)
            depth = gray.astype(np.float32)
            
            # 대비와 밝기 조정
            depth = (depth - 128) * contrast + 128 + brightness * 255
            depth = np.clip(depth, 0, 255).astype(np.uint8)
            
            # 스무딩 적용
            if smoothing > 0 and min(image.shape[:2]) > smoothing * 2:
                kernel_size = smoothing * 2 + 1
                depth = cv2.GaussianBlur(depth, (kernel_size, kernel_size), 0)
            
            # 3채널로 변환 (그레이스케일 깊이 맵)
            result = cv2.cvtColor(depth, cv2.COLOR_GRAY2RGB)
            
            return result
            
        except Exception as e:
            print(f"Error in builtin depth processing: {e}")
            # 에러 시 원본 이미지를 그레이스케일로 반환
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            return cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
    
    def process_ai_depth_placeholder(self, image: np.ndarray, model_name: str) -> np.ndarray:
        """AI 모델 플레이스홀더 (실제 구현 예정)"""
        height, width = image.shape[:2]
        
        # 최소 크기 체크
        if height < 2 or width < 2:
            # 매우 작은 이미지인 경우 단순 그레이스케일 반환
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            return cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
        
        # 간단한 그라디언트 깊이 맵 생성
        result = np.zeros((height, width, 3), dtype=np.uint8)
        
        # 중앙에서 가장자리로 갈수록 어두워지는 깊이 맵
        center_x, center_y = width // 2, height // 2
        max_distance = np.sqrt(center_x**2 + center_y**2)
        
        # max_distance가 0인 경우 방지
        if max_distance == 0:
            max_distance = 1
        
        for y in range(height):
            for x in range(width):
                distance = np.sqrt((x - center_x)**2 + (y - center_y)**2)
                depth_value = int(255 * (1 - min(distance / max_distance, 1.0)))
                depth_value = max(0, min(255, depth_value))  # 값 범위 제한
                result[y, x] = [depth_value, depth_value, depth_value]
        
        # 원본 이미지의 밝기 정보 추가
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        gray_3ch = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
        
        # 결합
        result = cv2.addWeighted(result, 0.7, gray_3ch, 0.3, 0)
        
        return result

# 매니저들 초기화
preprocessor = PreprocessorManager()
image_save_manager = ImageSaveManager()
depth_processor = DepthProcessor()

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

# ControlNet 전처리 API 엔드포인트들
@app.get("/api/preprocessors")
async def get_preprocessors():
    """사용 가능한 전처리기 목록 반환"""
    try:
        models_list = []
        for model_id, config in preprocessor.models.items():
            models_list.append({
                'id': model_id,
                'name': config['name'],
                'type': config['type'],
                'file': config.get('file', ''),
                'available': True
            })
        
        return models_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"전처리기 목록 로딩 실패: {str(e)}")

@app.post("/api/preprocess", response_model=PreprocessResponse)
async def preprocess_image(request: PreprocessRequest):
    """이미지 전처리 실행"""
    try:
        if not request.image or not request.model:
            raise HTTPException(status_code=400, detail="Missing required fields: image, model")
        
        # 전처리 실행
        processed_image = preprocessor.process_image(request.image, request.model, request.params or {})
        
        return PreprocessResponse(
            success=True,
            processed_image=f'data:image/png;base64,{processed_image}',
            model_used=request.model
        )
        
    except ValueError as e:
        return PreprocessResponse(
            success=False,
            processed_image=None,
            model_used=request.model,
            error=str(e)
        )
    except Exception as e:
        print(f"Preprocessing error: {e}")
        raise HTTPException(status_code=500, detail=f"전처리 실패: {str(e)}")

@app.post("/api/save-image", response_model=SaveImageResponse)
async def save_image(request: SaveImageRequest):
    """이미지를 지정된 경로에 저장"""
    try:
        if not request.image or not request.filename:
            raise HTTPException(status_code=400, detail="Missing required fields: image, filename")
        
        # 이미지 저장 실행
        result = image_save_manager.save_image(
            base64_image=request.image,
            filename=request.filename,
            save_path=request.path,
            image_type=request.type,
            metadata=request.metadata,
            quality_settings=request.quality_settings
        )
        
        if result['success']:
            return SaveImageResponse(
                success=True,
                saved_path=result['saved_path'],
                filename=result['filename'],
                file_size=result['file_size']
            )
        else:
            return SaveImageResponse(
                success=False,
                filename=request.filename,
                error=result['error']
            )
        
    except Exception as e:
        print(f"Save image error: {e}")
        raise HTTPException(status_code=500, detail=f"이미지 저장 실패: {str(e)}")

@app.post("/api/depth", response_model=DepthResponse)
async def process_depth_map(request: DepthRequest):
    """Depth Map 전처리 실행"""
    try:
        if not request.image or not request.model:
            raise HTTPException(status_code=400, detail="Missing required fields: image, model")
        
        # Depth 전처리 실행
        processed_depth = depth_processor.process_depth(request.image, request.model, request.params or {})
        
        return DepthResponse(
            success=True,
            depth_map=f'data:image/png;base64,{processed_depth}',
            model_used=request.model
        )
        
    except ValueError as e:
        return DepthResponse(
            success=False,
            depth_map=None,
            model_used=request.model,
            error=str(e)
        )
    except Exception as e:
        print(f"Depth processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Depth 전처리 실패: {str(e)}")

@app.get("/api/image-settings/paths")
async def get_image_paths():
    """이미지 저장 경로 목록 반환"""
    try:
        paths = {}
        for path_type, path_obj in image_save_manager.default_paths.items():
            paths[path_type] = {
                'path': str(path_obj),
                'exists': path_obj.exists(),
                'absolute_path': str(path_obj.absolute())
            }
        
        return {
            'success': True,
            'paths': paths,
            'base_output_path': str(image_save_manager.base_output_path.absolute())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"경로 정보 로딩 실패: {str(e)}")

@app.post("/api/image-settings/create-directories")
async def create_image_directories():
    """이미지 저장 디렉토리들 생성"""
    try:
        created_dirs = []
        for path_type, path_obj in image_save_manager.default_paths.items():
            if not path_obj.exists():
                image_save_manager.ensure_directory(path_obj)
                created_dirs.append(str(path_obj))
        
        return {
            'success': True,
            'created_directories': created_dirs,
            'total_directories': len(image_save_manager.default_paths)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"디렉토리 생성 실패: {str(e)}")

@app.get("/api/health")
async def health_check():
    """서버 상태 확인"""
    return {
        'status': 'healthy',
        'models_loaded': len(preprocessor.models),
        'available_models': list(preprocessor.models.keys()),
        'depth_models': list(depth_processor.models.keys()),
        'preprocessors_path': str(PREPROCESSORS_PATH),
        'output_paths': {k: str(v) for k, v in image_save_manager.default_paths.items()},
        'supported_formats': list(image_save_manager.supported_formats.keys())
    }

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