#!/usr/bin/env python3
"""
CUBE Studio - Model Explorer Service
Handles checkpoint and VAE model discovery, file listing, and preview management.

This service is responsible ONLY for:
- Checkpoint model file discovery (.safetensors, .ckpt, .pt, .bin)
- VAE model file discovery (.safetensors, .ckpt, .pt, .bin)
- LoRA model file discovery (.safetensors, .ckpt, .pt, .bin)
- Preview image serving for model files
- File metadata extraction (size, subfolder organization)

NOT responsible for:
- Image processing or depth estimation
- ControlNet functionality
"""

import os
import logging
from pathlib import Path
from typing import List, Dict, Optional
from fastapi import HTTPException
from fastapi.responses import FileResponse

from ..models.data_models import ModelFile

# Configure logging
logger = logging.getLogger(__name__)


class ModelExplorerService:
    """Service for managing model file discovery and preview serving"""
    
    def __init__(self, models_base_path: Path):
        self.models_base_path = Path(models_base_path)
        self.checkpoints_path = self.models_base_path / "checkpoints"
        self.vaes_path = self.models_base_path / "vae"
        self.loras_path = self.models_base_path / "loras"
        
        # Supported model file extensions
        self.model_extensions = ['.safetensors', '.ckpt', '.pt', '.bin']
        
        # Supported preview image extensions
        self.preview_extensions = ['.png', '.jpg', '.jpeg', '.webp']
        
        logger.info(f"Model Explorer Service initialized with base path: {self.models_base_path}")
        
    def _get_model_files(self, base_path: Path, extensions: List[str]) -> List[ModelFile]:
        """Get model files from specified path with given extensions"""
        model_files = []
        
        if not base_path.exists():
            logger.warning(f"Path does not exist: {base_path}")
            return model_files
        
        logger.info(f"Scanning for model files in: {base_path}")
        
        for file_path in base_path.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in extensions:
                relative_path = file_path.relative_to(base_path)
                subfolder = str(relative_path.parent) if relative_path.parent != Path(".") else ""
                
                # Look for preview image
                preview_image = self._find_preview_image(file_path, base_path)
                
                model_file = ModelFile(
                    name=file_path.name,
                    path=str(relative_path),
                    subfolder=subfolder,
                    size=file_path.stat().st_size if file_path.exists() else None,
                    preview_image=preview_image
                )
                
                model_files.append(model_file)
                logger.debug(f"Found model file: {relative_path}")
        
        logger.info(f"Found {len(model_files)} model files in {base_path}")
        return model_files
    
    def _find_preview_image(self, model_file_path: Path, base_path: Path) -> Optional[str]:
        """Find preview image for a model file"""
        # Remove model extension and try preview extensions
        base_name = model_file_path.stem
        model_dir = model_file_path.parent
        
        for ext in self.preview_extensions:
            preview_path = model_dir / f"{base_name}{ext}"
            if preview_path.exists():
                relative_preview = preview_path.relative_to(base_path)
                logger.debug(f"Found preview image: {relative_preview}")
                return str(relative_preview)
        
        return None
    
    def get_checkpoints(self) -> List[ModelFile]:
        """Get all checkpoint model files"""
        logger.info("Fetching checkpoint models")
        try:
            return self._get_model_files(self.checkpoints_path, self.model_extensions)
        except Exception as e:
            logger.error(f"Error fetching checkpoints: {e}")
            raise HTTPException(status_code=500, detail=f"체크포인트 로딩 실패: {str(e)}")
    
    def get_vaes(self) -> List[ModelFile]:
        """Get all VAE model files"""
        logger.info("Fetching VAE models")
        try:
            return self._get_model_files(self.vaes_path, self.model_extensions)
        except Exception as e:
            logger.error(f"Error fetching VAEs: {e}")
            raise HTTPException(status_code=500, detail=f"VAE 로딩 실패: {str(e)}")
    
    def get_loras(self) -> List[ModelFile]:
        """Get all LoRA model files"""
        logger.info("Fetching LoRA models")
        try:
            return self._get_model_files(self.loras_path, self.model_extensions)
        except Exception as e:
            logger.error(f"Error fetching LoRAs: {e}")
            raise HTTPException(status_code=500, detail=f"LoRA 로딩 실패: {str(e)}")
    
    def get_model_preview(self, preview_path: str) -> FileResponse:
        """Get preview image for a model file"""
        logger.info(f"Fetching model preview: {preview_path}")
        
        try:
            # Construct full path to preview image
            full_preview_path = self.models_base_path / preview_path
            
            # Security check: ensure path is within models directory
            if not str(full_preview_path.resolve()).startswith(str(self.models_base_path.resolve())):
                logger.warning(f"Security violation: attempted access outside models directory: {preview_path}")
                raise HTTPException(status_code=403, detail="Access denied: path outside models directory")
            
            # Check if preview file exists
            if not full_preview_path.exists() or not full_preview_path.is_file():
                logger.warning(f"Preview image not found: {full_preview_path}")
                raise HTTPException(status_code=404, detail="Preview image not found")
            
            # Determine media type from file extension
            ext = full_preview_path.suffix.lower()
            media_type_map = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp'
            }
            
            media_type = media_type_map.get(ext, 'application/octet-stream')
            
            logger.debug(f"Serving preview image: {full_preview_path} as {media_type}")
            
            return FileResponse(
                path=full_preview_path,
                media_type=media_type,
                filename=full_preview_path.name
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error serving preview image {preview_path}: {e}")
            raise HTTPException(status_code=500, detail=f"미리보기 이미지 로딩 실패: {str(e)}")
    
    def get_model_info(self, model_type: str, model_path: str) -> Dict:
        """Get detailed information about a specific model file"""
        logger.info(f"Fetching model info: {model_type}/{model_path}")
        
        try:
            # Determine base path based on model type
            type_path_map = {
                'checkpoints': self.checkpoints_path,
                'vae': self.vaes_path,
                'loras': self.loras_path
            }
            
            if model_type not in type_path_map:
                raise HTTPException(status_code=400, detail=f"Invalid model type: {model_type}")
            
            base_path = type_path_map[model_type]
            full_model_path = base_path / model_path
            
            # Security check
            if not str(full_model_path.resolve()).startswith(str(base_path.resolve())):
                logger.warning(f"Security violation: attempted access outside {model_type} directory: {model_path}")
                raise HTTPException(status_code=403, detail="Access denied: invalid path")
            
            if not full_model_path.exists() or not full_model_path.is_file():
                logger.warning(f"Model file not found: {full_model_path}")
                raise HTTPException(status_code=404, detail="Model file not found")
            
            # Get file stats
            stat = full_model_path.stat()
            relative_path = full_model_path.relative_to(base_path)
            
            # Find preview image
            preview_image = self._find_preview_image(full_model_path, base_path)
            
            model_info = {
                'name': full_model_path.name,
                'path': str(relative_path),
                'subfolder': str(relative_path.parent) if relative_path.parent != Path(".") else "",
                'size': stat.st_size,
                'modified': stat.st_mtime,
                'preview_image': preview_image,
                'type': model_type,
                'extension': full_model_path.suffix,
                'size_mb': round(stat.st_size / (1024 * 1024), 2)
            }
            
            logger.debug(f"Model info retrieved: {model_info}")
            return model_info
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting model info for {model_type}/{model_path}: {e}")
            raise HTTPException(status_code=500, detail=f"모델 정보 조회 실패: {str(e)}")
    
    def get_stats(self) -> Dict:
        """Get statistics about available models"""
        logger.info("Calculating model statistics")
        
        try:
            checkpoint_count = len(self.get_checkpoints()) if self.checkpoints_path.exists() else 0
            vae_count = len(self.get_vaes()) if self.vaes_path.exists() else 0
            lora_count = len(self.get_loras()) if self.loras_path.exists() else 0
            
            stats = {
                'checkpoints': checkpoint_count,
                'vaes': vae_count,
                'loras': lora_count,
                'total_models': checkpoint_count + vae_count + lora_count,
                'paths': {
                    'checkpoints': str(self.checkpoints_path),
                    'vaes': str(self.vaes_path),
                    'loras': str(self.loras_path)
                },
                'path_exists': {
                    'checkpoints': self.checkpoints_path.exists(),
                    'vaes': self.vaes_path.exists(),
                    'loras': self.loras_path.exists()
                }
            }
            
            logger.info(f"Model statistics: {stats}")
            return stats
            
        except Exception as e:
            logger.error(f"Error calculating model statistics: {e}")
            return {
                'checkpoints': 0,
                'vaes': 0,
                'loras': 0,
                'total_models': 0,
                'error': str(e)
            }