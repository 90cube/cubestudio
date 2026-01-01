"""
YAML 기반 설정 관리자
config.yaml 파일을 읽어서 모든 모델 경로와 설정을 중앙에서 관리
"""

import os
import yaml
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)

class ConfigManager:
    """YAML 기반 설정 관리 클래스"""
    
    def __init__(self, config_file: str = "config.yaml"):
        self.project_root = Path(__file__).parent.parent.parent.resolve()
        self.config_file = self.project_root / config_file
        self._config = None
        self._load_config()
    
    def _load_config(self):
        """config.yaml 파일 로드"""
        try:
            if not self.config_file.exists():
                logger.warning(f"Config file not found: {self.config_file}")
                self._create_default_config()
            
            with open(self.config_file, 'r', encoding='utf-8') as f:
                self._config = yaml.safe_load(f)
            
            logger.info(f"Configuration loaded from: {self.config_file}")
            
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
            self._config = self._get_default_config()
    
    def _create_default_config(self):
        """기본 config.yaml 파일 생성"""
        default_config = self._get_default_config()
        
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                yaml.safe_dump(default_config, f, default_flow_style=False, allow_unicode=True)
            logger.info(f"Created default config file: {self.config_file}")
        except Exception as e:
            logger.error(f"Failed to create default config: {e}")
    
    def _get_default_config(self) -> Dict[str, Any]:
        """기본 설정 반환"""
        return {
            'models': {
                'base_path': './models',
                'checkpoints': 'checkpoints',
                'vae': 'vae',
                'loras': 'loras',
                'preprocessors': 'preprocessors',
                'upscalers': 'upscale_models',
                'controlnet': 'controlnet',
                'clip': 'clip',
                'embeddings': 'embeddings',
                'hypernetworks': 'hypernetworks'
            },
            'server': {
                'host': '127.0.0.1',
                'port': 8080,
                'debug': False,
                'cors_enabled': True,
                'log_level': 'info'
            },
            'api': {
                'title': 'CUBE Studio Unified Backend',
                'version': '4.0.0',
                'description': '통합 AI 이미지 생성 및 전처리 백엔드'
            },
            'external': {
                'midas_path': None,
                'comfyui_models_path': None
            },
            'output': {
                'directory': './output',
                'temp_directory': './temp'
            },
            'processing': {
                'max_concurrent': 4,
                'default_format': 'png',
                'max_image_size': 4096
            }
        }
    
    def get(self, key: str, default: Any = None) -> Any:
        """설정값 가져오기 (dot notation 지원)"""
        keys = key.split('.')
        value = self._config
        
        try:
            for k in keys:
                value = value[k]
            return value
        except (KeyError, TypeError):
            return default
    
    def get_model_path(self, model_type: str) -> Path:
        """모델 타입별 경로 반환"""
        base_path = self.get('models.base_path', './models')
        model_subpath = self.get(f'models.{model_type}', model_type)
        
        # 절대경로로 변환
        if not os.path.isabs(base_path):
            base_path = self.project_root / base_path
        else:
            base_path = Path(base_path)
        
        return base_path / model_subpath
    
    @property
    def models_base_path(self) -> Path:
        """전체 모델 루트 경로"""
        base_path = self.get('models.base_path', './models')
        if not os.path.isabs(base_path):
            return self.project_root / base_path
        return Path(base_path)
    
    @property
    def checkpoints_path(self) -> Path:
        """체크포인트 모델 경로"""
        return self.get_model_path('checkpoints')
    
    @property
    def vae_path(self) -> Path:
        """VAE 모델 경로"""
        return self.get_model_path('vae')
    
    @property
    def loras_path(self) -> Path:
        """LoRA 모델 경로"""
        return self.get_model_path('loras')
    
    @property
    def preprocessors_path(self) -> Path:
        """전처리기 모델 경로"""
        return self.get_model_path('preprocessors')
    
    @property
    def upscalers_path(self) -> Path:
        """업스케일러 모델 경로"""
        return self.get_model_path('upscalers')
    
    @property
    def controlnet_path(self) -> Path:
        """ControlNet 모델 경로"""
        return self.get_model_path('controlnet')
    
    @property
    def clip_path(self) -> Path:
        """CLIP 모델 경로"""
        return self.get_model_path('clip')
    
    @property
    def embeddings_path(self) -> Path:
        """임베딩 모델 경로"""
        return self.get_model_path('embeddings')
    
    @property
    def hypernetworks_path(self) -> Path:
        """하이퍼네트워크 모델 경로"""
        return self.get_model_path('hypernetworks')
    
    @property
    def output_directory(self) -> Path:
        """출력 디렉토리"""
        output_dir = self.get('output.directory', './output')
        if not os.path.isabs(output_dir):
            return self.project_root / output_dir
        return Path(output_dir)

    @property
    def logs_directory(self) -> Path:
        """로그 디렉토리"""
        logs_dir = self.get('output.logs_directory', './logs')
        if not os.path.isabs(logs_dir):
            return self.project_root / logs_dir
        return Path(logs_dir)
    
    @property
    def checkpoint_extensions(self) -> List[str]:
        """체크포인트 모델 파일 확장자"""
        return ['.ckpt', '.pt', '.pth', '.safetensors', '.bin']
    
    @property
    def vae_extensions(self) -> List[str]:
        """VAE 모델 파일 확장자"""
        return ['.ckpt', '.pt', '.pth', '.safetensors', '.bin']
    
    @property
    def preview_extensions(self) -> List[str]:
        """프리뷰 이미지 파일 확장자"""
        return ['.png', '.jpg', '.jpeg', '.webp']
    
    @property
    def image_extensions(self) -> List[str]:
        """이미지 파일 확장자 (preview_extensions 별칭)"""
        return self.preview_extensions

    @property
    def real_model_files(self) -> Dict[str, str]:
        """실제 모델 파일 매핑"""
        return {
            "dpt_hybrid": "dpt_hybrid-midas-501f0c75.pt",
            "dpt_beit_large_512": "dpt_beit_large_512.pt", 
            "midas_v21": "midas_v21_384.pt",
            "depth_anything_v2_vitb": "depth_anything_v2_vitb.pth",
            "hed": "ControlNetHED.pth",
            "network_bsds500": "network-bsds500.pth", 
            "body_pose": "body_pose_model.pth",
            "hand_pose": "hand_pose_model.pth",
            "dw_openpose": "DWPose/dw-ll_ucoco_384.onnx",
            "yolox_l": "DWPose/yolox_l.onnx",
            "oneformer_coco": "OneFormer_coco_swin_large.pth",
            "oneformer_ade20k": "OneFormer_ade20k_swin_large.pth",
            "mlsd": "mlsd_large_512_fp32.pth",
            "clip": "clip_g.safetensors",
            "lama": "big-lama.pt",
            "realesrgan": "RealESRGAN_x4plus.pth"
        }

    @property
    def temp_directory(self) -> Path:
        """임시 디렉토리"""
        temp_dir = self.get('output.temp_directory', './temp')
        if not os.path.isabs(temp_dir):
            return self.project_root / temp_dir
        return Path(temp_dir)
    
    @property
    def server_host(self) -> str:
        """서버 호스트"""
        return self.get('server.host', '127.0.0.1')
    
    @property
    def server_port(self) -> int:
        """서버 포트"""
        return self.get('server.port', 8080)
    
    @property
    def debug_mode(self) -> bool:
        """디버그 모드"""
        return self.get('server.debug', False)
    
    @property
    def cors_enabled(self) -> bool:
        """CORS 활성화"""
        return self.get('server.cors_enabled', True)
    
    @property
    def log_level(self) -> str:
        """로그 레벨"""
        return self.get('server.log_level', 'info')
    
    @property
    def api_title(self) -> str:
        """API 제목"""
        return self.get('api.title', 'CUBE Studio Unified Backend')
    
    @property
    def api_version(self) -> str:
        """API 버전"""
        return self.get('api.version', '4.0.0')
    
    @property
    def api_description(self) -> str:
        """API 설명"""
        return self.get('api.description', '통합 AI 이미지 생성 및 전처리 백엔드')
    
    def validate_paths(self) -> Dict[str, bool]:
        """모든 경로 유효성 검사"""
        paths_to_check = {
            'models_base': self.models_base_path,
            'checkpoints': self.checkpoints_path,
            'vae': self.vae_path,
            'loras': self.loras_path,
            'preprocessors': self.preprocessors_path,
            'upscalers': self.upscalers_path,
            'controlnet': self.controlnet_path,
            'clip': self.clip_path,
            'embeddings': self.embeddings_path,
            'hypernetworks': self.hypernetworks_path,
            'output': self.output_directory,
            'temp': self.temp_directory
        }
        
        results = {}
        for name, path in paths_to_check.items():
            results[name] = path.exists()
            if not path.exists():
                logger.warning(f"Path not found: {name} -> {path}")
        
        return results
    
    def create_missing_directories(self):
        """누락된 디렉토리 생성"""
        paths_to_create = [
            self.models_base_path,
            self.checkpoints_path,
            self.vae_path,
            self.loras_path,
            self.preprocessors_path,
            self.upscalers_path,
            self.controlnet_path,
            self.clip_path,
            self.embeddings_path,
            self.hypernetworks_path,
            self.output_directory,
            self.temp_directory
        ]
        
        for path in paths_to_create:
            if not path.exists():
                try:
                    path.mkdir(parents=True, exist_ok=True)
                    logger.info(f"Created directory: {path}")
                except Exception as e:
                    logger.error(f"Failed to create directory {path}: {e}")
    
    def print_configuration(self):
        """현재 설정 상태 출력"""
        print("=== CUBE Studio Configuration (YAML) ===")
        print(f"Config File: {self.config_file}")
        print(f"Project Root: {self.project_root}")
        print()
        print("Model Paths:")
        print(f"  Base: {self.models_base_path}")
        print(f"  Checkpoints: {self.checkpoints_path}")
        print(f"  VAE: {self.vae_path}")
        print(f"  LoRAs: {self.loras_path}")
        print(f"  Preprocessors: {self.preprocessors_path}")
        print(f"  Upscalers: {self.upscalers_path}")
        print(f"  ControlNet: {self.controlnet_path}")
        print()
        print("Server Settings:")
        print(f"  Host: {self.server_host}")
        print(f"  Port: {self.server_port}")
        print(f"  Debug: {self.debug_mode}")
        print(f"  CORS: {self.cors_enabled}")
        print()
        
        # 경로 유효성 검사
        validation = self.validate_paths()
        missing_paths = [name for name, exists in validation.items() if not exists]
        
        if missing_paths:
            print("Missing Paths:")
            for name in missing_paths:
                print(f"  - {name}")
        else:
            print("All paths are valid")
        print()

# 싱글톤 인스턴스
_config_manager = None

def get_config_manager() -> ConfigManager:
    """ConfigManager 싱글톤 인스턴스 반환"""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager