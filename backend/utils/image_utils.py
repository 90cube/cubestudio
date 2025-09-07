#!/usr/bin/env python3
"""
CUBE Studio - Image Utilities
Common image processing utilities and image save manager.

This module handles:
- Base64 image encoding/decoding
- Image file saving with metadata
- Path sanitization and security
- File format handling
"""

import os
import io
import base64
import re
import logging
from pathlib import Path
from typing import Dict, Optional
from PIL import Image
from datetime import datetime

from ..models.data_models import SaveImageRequest, SaveImageResponse

# Configure logging
logger = logging.getLogger(__name__)


class ImageSaveManager:
    """Handles image saving operations with security and metadata support"""
    
    def __init__(self, base_output_path: Path):
        self.base_output_path = Path(base_output_path)
        self.default_paths = {
            't2i': self.base_output_path / 't2i',
            'i2i': self.base_output_path / 'i2i',
            'detail': self.base_output_path / 'detail',
            'preprocessor': self.base_output_path / 'preprocessor',
            'controlnet': self.base_output_path / 'controlnet',
            'custom': self.base_output_path / 'custom'
        }
        self.supported_formats = {
            'png': {'ext': '.png', 'pil_format': 'PNG'},
            'jpg': {'ext': '.jpg', 'pil_format': 'JPEG'},
            'jpeg': {'ext': '.jpg', 'pil_format': 'JPEG'},
            'webp': {'ext': '.webp', 'pil_format': 'WebP'}
        }
        
        logger.info(f"ImageSaveManager initialized with base path: {self.base_output_path}")
    
    def ensure_directory(self, path: Path):
        """Ensure directory exists"""
        try:
            path.mkdir(parents=True, exist_ok=True)
            logger.debug(f"Ensured directory exists: {path}")
        except Exception as e:
            logger.error(f"Failed to create directory {path}: {e}")
            raise
    
    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename to prevent security issues"""
        # Remove dangerous characters
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        # Remove control characters
        filename = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', filename)
        # Replace multiple spaces and dots with underscore
        filename = re.sub(r'[\s.]+', '_', filename)
        # Remove leading/trailing spaces, dots, underscores
        filename = filename.strip('. _')
        
        # Ensure we have a valid filename
        if not filename:
            filename = 'untitled'
        
        logger.debug(f"Sanitized filename: '{filename}'")
        return filename
    
    def generate_unique_filename(self, directory: Path, base_filename: str) -> str:
        """Generate unique filename to avoid conflicts"""
        name_part = base_filename.rsplit('.', 1)[0]
        ext_part = '.' + base_filename.rsplit('.', 1)[1] if '.' in base_filename else ''
        
        counter = 1
        unique_filename = base_filename
        
        while (directory / unique_filename).exists():
            unique_filename = f"{name_part}_{counter:03d}{ext_part}"
            counter += 1
            
            # Prevent infinite loops
            if counter > 9999:
                unique_filename = f"{name_part}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}{ext_part}"
                break
        
        logger.debug(f"Generated unique filename: {unique_filename}")
        return unique_filename
    
    def decode_base64_image(self, base64_data: str) -> Image.Image:
        """Decode base64 string to PIL Image"""
        try:
            # Handle data URL format
            if 'base64,' in base64_data:
                base64_data = base64_data.split('base64,')[1]
            
            # Decode base64 to bytes
            image_bytes = base64.b64decode(base64_data)
            
            # Open as PIL Image
            image = Image.open(io.BytesIO(image_bytes))
            
            logger.debug(f"Decoded image: {image.mode} {image.size}")
            return image
            
        except Exception as e:
            logger.error(f"Failed to decode base64 image: {e}")
            raise ValueError(f"Invalid base64 image data: {e}")
    
    def encode_image_to_base64(self, image: Image.Image, format: str = 'PNG') -> str:
        """Encode PIL Image to base64 string"""
        try:
            buffer = io.BytesIO()
            image.save(buffer, format=format)
            buffer.seek(0)
            
            base64_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
            logger.debug(f"Encoded image to base64: {len(base64_data)} characters")
            return base64_data
            
        except Exception as e:
            logger.error(f"Failed to encode image to base64: {e}")
            raise ValueError(f"Failed to encode image: {e}")
    
    def save_image(self, base64_image: str, filename: str, save_path: str, 
                  image_type: str, metadata: Optional[Dict] = None, 
                  quality_settings: Optional[Dict] = None) -> Dict:
        """Save base64 image to specified path with quality settings"""
        try:
            # Default quality settings
            default_quality = {
                'format': 'png',
                'png_compression': 6,
                'jpg_quality': 90,
                'webp_quality': 90,
                'save_metadata': True
            }
            
            if quality_settings:
                default_quality.update(quality_settings)
            
            # Decode image
            image = self.decode_base64_image(base64_image)
            
            # Process save path
            if save_path.startswith('./'):
                save_directory = Path(save_path[2:])
            else:
                save_directory = Path(save_path)
            
            if not save_directory.is_absolute():
                save_directory = Path.cwd() / save_directory
            
            # Ensure directory exists
            self.ensure_directory(save_directory)
            
            # Sanitize filename
            clean_filename = self.sanitize_filename(filename)
            image_format = default_quality['format'].lower()
            
            # Validate format
            if image_format not in self.supported_formats:
                logger.warning(f"Unsupported format {image_format}, using PNG")
                image_format = 'png'
            
            format_info = self.supported_formats[image_format]
            
            # Ensure proper extension
            if not clean_filename.endswith(format_info['ext']):
                clean_filename += format_info['ext']
            
            # Generate unique filename
            unique_filename = self.generate_unique_filename(save_directory, clean_filename)
            full_path = save_directory / unique_filename
            
            # Prepare save arguments
            save_kwargs = {}
            if image_format == 'png':
                save_kwargs['optimize'] = True
                save_kwargs['compress_level'] = default_quality['png_compression']
            elif image_format in ['jpg', 'jpeg']:
                save_kwargs['quality'] = default_quality['jpg_quality']
                save_kwargs['optimize'] = True
                
                # Convert RGBA to RGB for JPEG
                if image.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    if image.mode == 'LA':
                        image = image.convert('RGBA')
                    background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
                    image = background
                    
            elif image_format == 'webp':
                save_kwargs['quality'] = default_quality['webp_quality']
                save_kwargs['optimize'] = True
            
            # Save image
            image.save(full_path, format_info['pil_format'], **save_kwargs)
            file_size = full_path.stat().st_size
            
            logger.info(f"Successfully saved image: {full_path} ({file_size} bytes)")
            
            return {
                'success': True,
                'saved_path': str(full_path),
                'filename': unique_filename,
                'file_size': file_size,
                'format': image_format,
                'directory': str(save_directory)
            }
            
        except Exception as e:
            logger.error(f"Error saving image: {e}")
            return {
                'success': False,
                'error': str(e),
                'filename': filename,
                'attempted_path': save_path
            }
    
    def save_image_from_request(self, request: SaveImageRequest) -> SaveImageResponse:
        """Save image from SaveImageRequest and return SaveImageResponse"""
        try:
            result = self.save_image(
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
            logger.error(f"Error processing save image request: {e}")
            return SaveImageResponse(
                success=False,
                filename=request.filename,
                error=str(e)
            )


def convert_image_format(image: Image.Image, target_format: str) -> Image.Image:
    """Convert image to target format with proper mode conversion"""
    target_format = target_format.upper()
    
    if target_format == 'JPEG' and image.mode in ('RGBA', 'LA', 'P'):
        # Convert to RGB for JPEG
        if image.mode == 'P':
            image = image.convert('RGBA')
        
        # Create white background for transparency
        background = Image.new('RGB', image.size, (255, 255, 255))
        if image.mode in ('RGBA', 'LA'):
            background.paste(image, mask=image.split()[-1] if len(image.split()) > 3 else None)
        else:
            background.paste(image)
        
        return background
    
    elif target_format == 'PNG' and image.mode not in ('RGBA', 'RGB', 'L', 'LA'):
        # Convert to RGBA for PNG
        return image.convert('RGBA')
    
    return image


def validate_image_data(base64_data: str) -> bool:
    """Validate that base64 data represents a valid image"""
    try:
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Basic validation
        if image.size[0] == 0 or image.size[1] == 0:
            return False
        
        # Try to load the image data
        image.load()
        
        return True
        
    except Exception as e:
        logger.debug(f"Image validation failed: {e}")
        return False


def get_image_info(base64_data: str) -> Dict:
    """Get information about a base64 encoded image"""
    try:
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        return {
            'valid': True,
            'format': image.format,
            'mode': image.mode,
            'size': image.size,
            'width': image.size[0],
            'height': image.size[1],
            'data_size': len(image_bytes),
            'has_transparency': image.mode in ('RGBA', 'LA') or 'transparency' in image.info
        }
        
    except Exception as e:
        return {
            'valid': False,
            'error': str(e)
        }