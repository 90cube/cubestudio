"""
Generation API
Provides endpoints for Stable Diffusion T2I and I2I image generation.
"""

import logging
import io
import base64
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
try:
    from pydantic import ConfigDict
    _HAS_PYDANTIC_V2 = True
except ImportError:  # Pydantic v1 fallback
    ConfigDict = None
    _HAS_PYDANTIC_V2 = False
from PIL import Image

logger = logging.getLogger(__name__)

router = APIRouter()


class LoRAConfig(BaseModel):
    """LoRA configuration"""
    path: str
    name: str
    weight: float = 1.0
    subfolder: Optional[str] = None


class DetailerConfig(BaseModel):
    """Detailer configuration"""
    active: bool = True
    detection_model: Optional[str] = Field(default=None, alias="detectionModel")
    confidence: float = 0.3
    mask_padding: int = Field(default=32, alias="maskPadding")
    mask_blur: int = Field(default=4, alias="maskBlur")
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = Field(default=None, alias="negativePrompt")
    denoise: float = Field(default=0.4, alias="denoisingStrength")
    sampler: Optional[str] = None
    steps: int = 25
    cfg_scale: float = Field(default=7.0, alias="cfgScale")

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True, extra="allow")
    else:
        class Config:
            allow_population_by_field_name = True
            extra = "allow"


class ControlNetConfig(BaseModel):
    """ControlNet configuration from frontend"""
    enabled: bool = True
    index: int
    type: str  # depth, canny, openpose
    preprocessor_type: str = Field(alias="preprocessorType")
    model: Optional[Dict[str, Any]] = None
    weight: float = 1.0
    image: str  # 🔧 FIX: Base64 encoded ControlNet image (already resized)

    if _HAS_PYDANTIC_V2:
        model_config = ConfigDict(populate_by_name=True, extra="allow")
    else:
        class Config:
            allow_population_by_field_name = True
            extra = "allow"


class GenerationRequest(BaseModel):
    """Request model for image generation"""
    # Prompts
    positive_prompt: str = Field(..., description="Positive prompt")
    negative_prompt: str = Field(default="", description="Negative prompt")

    # Basic parameters
    width: int = Field(default=512, ge=64, le=2048)
    height: int = Field(default=512, ge=64, le=2048)
    batch_count: int = Field(default=1, ge=1, le=10)
    repeat_count: int = Field(default=1, ge=1, le=100)

    # Generation parameters
    steps: int = Field(default=20, ge=1, le=150)
    cfg_scale: float = Field(default=7.5, ge=1.0, le=30.0)
    sampler: str = Field(default="dpm++_2m", description="Sampler name")
    use_karras: bool = Field(default=True, description="Use Karras sigmas")
    seed: int = Field(default=-1, description="Random seed (-1 for random)")

    # Model configuration
    base_model: Optional[str] = Field(None, description="Base checkpoint model")
    vae: Optional[str] = Field(None, description="Custom VAE")
    clip_skip: int = Field(default=1, ge=1, le=12)

    # LoRA
    loras: List[LoRAConfig] = Field(default_factory=list, description="LoRA configurations")

    # I2I parameters
    init_image: Optional[str] = Field(None, description="Base64 encoded initial image for I2I")
    denoise: float = Field(default=0.75, ge=0.0, le=1.0)

    # Detailers
    detailers: Dict[str, DetailerConfig] = Field(default_factory=dict, description="Active detailers")

    # ControlNet
    controlnets: List[ControlNetConfig] = Field(default_factory=list, description="ControlNet configurations")


class GenerationResponse(BaseModel):
    """Response model for image generation"""
    success: bool
    images: List[str] = Field(default_factory=list, description="Image file paths (relative to output folder)")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Generation metadata")
    error: Optional[str] = None


@router.options("/generate")
async def generate_options():
    """Handle CORS preflight for generate endpoint"""
    return {}


@router.post("/generate")
async def generate_images(
    request: GenerationRequest,
    api_request: Request
) -> GenerationResponse:
    """
    Generate images using Stable Diffusion T2I or I2I pipeline

    This endpoint handles:
    - Text-to-Image (T2I) generation
    - Image-to-Image (I2I) generation
    - LoRA loading and application
    - Custom schedulers and samplers
    - Post-processing with detailers
    """
    try:
        logger.info(f"Generation request: {request.width}x{request.height}, "
                   f"steps={request.steps}, cfg={request.cfg_scale}, "
                   f"loras={len(request.loras)}, detailers={len(request.detailers)}")

        # Get services from app state
        if not hasattr(api_request.app.state, 'sd_pipeline_service'):
            raise HTTPException(
                status_code=500,
                detail="SD pipeline service not initialized"
            )

        sd_service = api_request.app.state.sd_pipeline_service
        origin = api_request.headers.get("origin")
        logger.info(f"Generation request origin: {origin}")


        # Check if pipeline is initialized / needs checkpoint swap
        status = sd_service.get_status()
        config_manager = getattr(api_request.app.state, 'config', None)
        checkpoints_root = Path(config_manager.checkpoints_path) if config_manager else None

        def normalize_path(path_value):
            if not path_value:
                return None
            candidate = Path(path_value)
            if checkpoints_root and not candidate.is_absolute():
                candidate = checkpoints_root / candidate
            try:
                candidate = candidate.resolve()
            except Exception:
                pass
            normalized = candidate.as_posix()
            if os.name == "nt":
                normalized = normalized.lower()
            return normalized

        current_checkpoint = status.get("checkpoint")
        current_normalized = normalize_path(current_checkpoint)
        requested_normalized = normalize_path(request.base_model)

        needs_reload = not status.get("initialized")
        if not needs_reload and requested_normalized and requested_normalized != current_normalized:
            logger.info(f"Checkpoint change requested: {current_normalized} -> {requested_normalized}")
            needs_reload = True

        if needs_reload:
            if request.base_model:
                init_result = sd_service.initialize_pipeline(
                    checkpoint_path=request.base_model,
                    vae_path=request.vae
                )
                if not init_result["success"]:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to initialize pipeline: {init_result.get('error')}"
                    )
            else:
                # Try to use the currently loaded checkpoint if available
                if current_checkpoint:
                    logger.info(f"No base model specified in request, using current: {current_checkpoint}")
                    # If pipeline is not initialized but we have a checkpoint name, try to reload it
                    init_result = sd_service.initialize_pipeline(
                        checkpoint_path=current_checkpoint,
                        vae_path=request.vae
                    )
                    if not init_result["success"]:
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to restore pipeline: {init_result.get('error')}"
                        )
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="No base model loaded. Please load a checkpoint first."
                    )

        # Map UI sampler names to internal scheduler names
        sampler_map = {
            "DPM++ 2M": "dpm++_2m",
            "DPM++ 2M Karras": "dpm++_2m",
            "DPM++ SDE": "dpm++_sde",
            "DPM++ SDE Karras": "dpm++_sde",
            "Euler": "euler",
            "Euler a": "euler_a",
            "Heun": "heun",
            "DDIM": "ddim",
            "DDPM": "ddpm",
            "LMS": "lms",
            "PNDM": "pndm",
            "UniPC": "unipc",
            "DPM2": "dpm2",
            "DPM2 a": "dpm2_a"
        }

        # Get internal scheduler name
        scheduler_name = sampler_map.get(request.sampler, request.sampler.lower())

        # Set scheduler
        scheduler_result = sd_service.set_scheduler(
            scheduler_name=scheduler_name,
            use_karras=request.use_karras
        )
        if not scheduler_result["success"]:
            logger.warning(f"Failed to set scheduler: {scheduler_result.get('error')}")

        # Load LoRAs if provided
        if request.loras:
            lora_configs = [
                {
                    "path": lora.path if not lora.subfolder else f"{lora.subfolder}/{lora.path}",
                    "weight": lora.weight
                }
                for lora in request.loras
            ]
            lora_result = sd_service.load_loras(lora_configs)
            if not lora_result["success"]:
                logger.warning(f"Failed to load LoRAs: {lora_result.get('error')}")

        # Determine generation mode (T2I or I2I)
        is_i2i = request.init_image is not None

        all_images = []

        # Generate images (handle batch_count and repeat_count)
        for repeat in range(request.repeat_count):
            # Adjust seed for each repeat
            current_seed = request.seed if request.seed >= 0 else -1
            if current_seed >= 0 and repeat > 0:
                current_seed += repeat

            if is_i2i:
                # I2I generation
                try:
                    # Decode base64 image
                    image_data = base64.b64decode(request.init_image)
                    init_image = Image.open(io.BytesIO(image_data)).convert("RGB")

                    # Resize to target dimensions
                    init_image = init_image.resize((request.width, request.height), Image.Resampling.LANCZOS)

                    result = sd_service.generate_i2i(
                        prompt=request.positive_prompt,
                        init_image=init_image,
                        negative_prompt=request.negative_prompt,
                        strength=request.denoise,
                        num_inference_steps=request.steps,
                        guidance_scale=request.cfg_scale,
                        seed=current_seed,
                        batch_size=request.batch_count
                    )

                except Exception as e:
                    logger.error(f"I2I generation error: {e}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"I2I generation failed: {str(e)}"
                    )
            else:
                # T2I generation
                result = sd_service.generate_t2i(
                    prompt=request.positive_prompt,
                    negative_prompt=request.negative_prompt,
                    width=request.width,
                    height=request.height,
                    num_inference_steps=request.steps,
                    guidance_scale=request.cfg_scale,
                    seed=current_seed,
                    batch_size=request.batch_count
                )

            if not result["success"]:
                raise HTTPException(
                    status_code=500,
                    detail=f"Generation failed: {result.get('error')}"
                )

            # Save images to output folder and return file paths
            output_dir = Path("output")
            output_dir.mkdir(exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            for idx, img in enumerate(result["images"]):
                # Convert image to base64
                buffered = io.BytesIO()
                img.save(buffered, format="PNG")
                img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
                all_images.append(f"data:image/png;base64,{img_str}")

                # Optionally, still save to output folder for record-keeping
                filename = f"generated_{timestamp}_{len(all_images) - 1}.png"
                output_path = output_dir / filename
                img.save(output_path)
                logger.info(f"Image saved to: {output_path}")

        # Apply detailers if active
        if request.detailers:
            all_images = await apply_detailers(
                images=all_images,
                detailers=request.detailers,
                api_request=api_request,
                main_prompt=request.positive_prompt,
                main_negative=request.negative_prompt
            )

        # Prepare metadata
        metadata = {
            "mode": "i2i" if is_i2i else "t2i",
            "prompt": request.positive_prompt,
            "negative_prompt": request.negative_prompt,
            "width": request.width,
            "height": request.height,
            "steps": request.steps,
            "cfg_scale": request.cfg_scale,
            "sampler": request.sampler,
            "use_karras": request.use_karras,
            "seed": request.seed,
            "batch_count": request.batch_count,
            "repeat_count": request.repeat_count,
            "total_images": len(all_images),
            "base_model": request.base_model,
            "loras": [{"path": lora.path, "weight": lora.weight} for lora in request.loras],
            "detailers_applied": len(request.detailers)
        }

        logger.info(f"Generation completed: {len(all_images)} images")

        return GenerationResponse(
            success=True,
            images=all_images,
            metadata=metadata
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Generation error: {e}", exc_info=True)
        return GenerationResponse(
            success=False,
            error=str(e)
        )


async def apply_detailers(
    images: List[str],
    detailers: Dict[str, DetailerConfig],
    api_request: Request,
    main_prompt: str = '',
    main_negative: str = ''
) -> List[str]:
    """
    Apply detailer post-processing to generated images with object detection

    Args:
        images: List of base64 encoded images
        detailers: Active detailer configurations
        api_request: FastAPI request object
        main_prompt: Main positive prompt (used if detailer prompt is empty)
        main_negative: Main negative prompt (used if detailer negative is empty)

    Returns:
        List of processed base64 encoded images
    """
    try:
        # Get active detailers
        active_detailers = {
            name: config for name, config in detailers.items()
            if config.active
        }

        if not active_detailers:
            return images

        logger.info(f"Applying {len(active_detailers)} detailers")

        if not hasattr(api_request.app.state, 'sd_pipeline_service'):
            logger.warning('SD pipeline service not available, skipping detailers')
            return images

        sd_service = api_request.app.state.sd_pipeline_service

        # Get detailer service
        if not hasattr(api_request.app.state, 'detailer_service'):
            from backend.services.detailer_service import DetailerService

            config_manager = getattr(api_request.app.state, 'config', None)
            models_base_path = str(config_manager.models_base_path) if config_manager else None

            api_request.app.state.detailer_service = DetailerService(
                models_base_path=models_base_path
            )

        detailer_service = api_request.app.state.detailer_service

        sampler_map = {
            "DPM++ 2M": "dpm++_2m",
            "DPM++ 2M Karras": "dpm++_2m",
            "DPM++ SDE": "dpm++_sde",
            "DPM++ SDE Karras": "dpm++_sde",
            "Euler": "euler",
            "Euler a": "euler_a",
            "Heun": "heun",
            "DDIM": "ddim",
            "DDPM": "ddpm",
            "LMS": "lms",
            "PNDM": "pndm",
            "UniPC": "unipc",
            "DPM2": "dpm2",
            "DPM2 a": "dpm2_a"
        }

        processed_images = []
        header_prefix = "data:image/png;base64,"

        # Sort detailers to ensure deterministic application order
        sorted_detailers = sorted(
            active_detailers.items(),
            key=lambda item: int(item[0]) if str(item[0]).isdigit() else item[0]
        )

        for img_str in images:
            base64_data = img_str.split(',', 1)[1] if img_str.startswith(header_prefix) else img_str
            img_data = base64.b64decode(base64_data)
            current_image = Image.open(io.BytesIO(img_data)).convert("RGB")

            for detailer_name, detailer_config in sorted_detailers:
                if not detailer_config.active:
                    continue

                detection_model = detailer_config.detection_model
                confidence = detailer_config.confidence or 0.3
                mask_padding = detailer_config.mask_padding or 32
                mask_blur = detailer_config.mask_blur or 4

                logger.info(
                    f"Applying detailer '{detailer_name}': model={detection_model}, "
                    f"confidence={confidence}, sampler={detailer_config.sampler}, steps={detailer_config.steps}"
                )

                # Check if detection model is specified
                if not detection_model or detection_model == '':
                    logger.warning(f"Detailer {detailer_name}: No detection model specified, using full image I2I")
                    use_detection = False
                else:
                    use_detection = True

                try:
                    if use_detection:
                        # Perform object detection
                        logger.info(f"Detecting objects with model: {detection_model}")
                        detections = detailer_service.detect_objects(
                            current_image,
                            detection_model,
                            confidence=confidence
                        )

                        if not detections:
                            logger.info(f"No objects detected with confidence >= {confidence}, skipping detailer")
                            continue

                        logger.info(f"Detected {len(detections)} objects")

                        # Set scheduler
                        sampler_key = detailer_config.sampler or ''
                        scheduler_name = sampler_map.get(sampler_key, sampler_key.lower().replace(' ', '_') if sampler_key else None)
                        use_karras = 'karras' in sampler_key.lower() if sampler_key else False

                        if scheduler_name:
                            scheduler_result = sd_service.set_scheduler(
                                scheduler_name=scheduler_name,
                                use_karras=use_karras
                            )
                            if not scheduler_result.get('success'):
                                logger.warning(
                                    f"Detailer {detailer_name}: failed to set scheduler {scheduler_name} - {scheduler_result.get('error')}"
                                )

                        # Prepare detailer parameters
                        denoise = max(0.0, min(1.0, detailer_config.denoise if detailer_config.denoise is not None else 0.4))
                        steps = detailer_config.steps or 20
                        guidance_scale = detailer_config.cfg_scale if detailer_config.cfg_scale is not None else 7.0

                        # Use main prompt if detailer prompt is empty
                        prompt = detailer_config.prompt if detailer_config.prompt else main_prompt
                        negative_prompt = detailer_config.negative_prompt if detailer_config.negative_prompt else main_negative

                        logger.info(
                            f"Applying ComfyUI-style detailer: "
                            f"detections={len(detections)}, denoise={denoise}, "
                            f"steps={steps}, prompt={'custom' if detailer_config.prompt else 'inherited'}"
                        )

                        # ✅ Use ComfyUI-style Latent-based Detailer
                        # Refinement Pass DISABLED to prevent "mushing" of details
                        detail_result = sd_service.generate_detailer(
                            image=current_image,
                            detections=detections,
                            prompt=prompt,
                            negative_prompt=negative_prompt,
                            guide_size=512,  # 고정 guide size (추후 config로 변경 가능)
                            crop_factor=3.0,  # BBox 확장 비율 (3.0 for hands/small objects)
                            feather_pixels=32,  # Feathering 범위 (16 → 32 증가)
                            strength=denoise,
                            num_inference_steps=steps,
                            guidance_scale=guidance_scale,
                            seed=-1,  # Random seed (추후 사용자 입력 가능)
                            refine_whole=False,  # ⚡ Disable Refinement Pass (Fixes blurry faces)
                            refine_strength=0.0,
                            min_crop_size=32  # 최소 crop 크기 (32 for hands)
                        )

                        if detail_result.get('success') and detail_result.get('images'):
                            current_image = detail_result['images'][0]
                            processed_count = detail_result.get('processed_count', 0)

                            logger.info(
                                f"Detailer {detailer_name} applied successfully: "
                                f"{processed_count} detections processed"
                            )
                        else:
                            logger.warning(
                                f"Detailer {detailer_name} failed: {detail_result.get('error')}"
                            )

                    else:
                        # Fallback to full image I2I without detection
                        sampler_key = detailer_config.sampler or ''
                        scheduler_name = sampler_map.get(sampler_key, sampler_key.lower().replace(' ', '_') if sampler_key else None)
                        use_karras = 'karras' in sampler_key.lower() if sampler_key else False

                        if scheduler_name:
                            scheduler_result = sd_service.set_scheduler(
                                scheduler_name=scheduler_name,
                                use_karras=use_karras
                            )
                            if not scheduler_result.get('success'):
                                logger.warning(
                                    f"Detailer {detailer_name}: failed to set scheduler {scheduler_name} - {scheduler_result.get('error')}"
                                )

                        denoise = max(0.0, min(1.0, detailer_config.denoise if detailer_config.denoise is not None else 0.4))
                        steps = detailer_config.steps or 20
                        guidance_scale = detailer_config.cfg_scale if detailer_config.cfg_scale is not None else 7.0

                        # Use main prompt if detailer prompt is empty
                        prompt = detailer_config.prompt if detailer_config.prompt else main_prompt
                        negative_prompt = detailer_config.negative_prompt if detailer_config.negative_prompt else main_negative

                        detail_result = sd_service.generate_i2i(
                            prompt=prompt,
                            init_image=current_image,
                            negative_prompt=negative_prompt,
                            strength=denoise,
                            num_inference_steps=steps,
                            guidance_scale=guidance_scale,
                            seed=-1,
                            batch_size=1
                        )

                        if detail_result.get('success') and detail_result.get('images'):
                            current_image = detail_result['images'][0]
                            if not isinstance(current_image, Image.Image):
                                current_image = Image.open(io.BytesIO(current_image)).convert("RGB")
                            logger.info(f"Detailer {detailer_name} applied successfully without detection")
                        else:
                            logger.warning(
                                f"Detailer {detailer_name} failed: {detail_result.get('error')}"
                            )

                except Exception as detail_error:
                    logger.error(f"Detailer {detailer_name} processing error: {detail_error}", exc_info=True)

            buffered = io.BytesIO()
            current_image.save(buffered, format="PNG")
            processed_img_str = base64.b64encode(buffered.getvalue()).decode()
            processed_images.append(f"{header_prefix}{processed_img_str}")

        return processed_images

    except Exception as e:
        logger.error(f"Detailer processing error: {e}", exc_info=True)
        # Return original images if detailer fails
        return images


@router.get("/pipeline/status")
async def get_pipeline_status(api_request: Request) -> Dict[str, Any]:
    """Get current SD pipeline status"""
    try:
        if not hasattr(api_request.app.state, 'sd_pipeline_service'):
            return {
                "initialized": False,
                "error": "SD pipeline service not available"
            }

        sd_service = api_request.app.state.sd_pipeline_service
        origin = api_request.headers.get("origin")
        logger.info(f"Generation request origin: {origin}")

        return sd_service.get_status()

    except Exception as e:
        logger.error(f"Error getting pipeline status: {e}")
        return {
            "error": str(e)
        }


@router.post("/pipeline/initialize")
async def initialize_pipeline(
    checkpoint_path: str,
    vae_path: Optional[str] = None,
    api_request: Request = None
) -> Dict[str, Any]:
    """Initialize SD pipeline with checkpoint"""
    try:
        if not hasattr(api_request.app.state, 'sd_pipeline_service'):
            raise HTTPException(
                status_code=500,
                detail="SD pipeline service not initialized"
            )

        sd_service = api_request.app.state.sd_pipeline_service
        origin = api_request.headers.get("origin")
        logger.info(f"Generation request origin: {origin}")


        result = sd_service.initialize_pipeline(
            checkpoint_path=checkpoint_path,
            vae_path=vae_path
        )

        if not result["success"]:
            raise HTTPException(
                status_code=500,
                detail=result.get("error")
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pipeline initialization error: {e}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@router.post("/pipeline/unload")
async def unload_pipeline(api_request: Request) -> Dict[str, Any]:
    """Unload SD pipeline and free GPU memory"""
    try:
        if not hasattr(api_request.app.state, 'sd_pipeline_service'):
            return {"success": False, "error": "SD pipeline service not available"}

        sd_service = api_request.app.state.sd_pipeline_service
        origin = api_request.headers.get("origin")
        logger.info(f"Generation request origin: {origin}")

        sd_service.unload_pipeline()

        return {"success": True}

    except Exception as e:
        logger.error(f"Pipeline unload error: {e}")
        return {"success": False, "error": str(e)}
