"""
Generation API
Provides endpoints for Stable Diffusion T2I and I2I image generation.
"""

import logging
import io
import base64
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
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
    model: Optional[str] = None
    prompt: Optional[str] = None
    denoise: float = 0.4


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


        # Check if pipeline is initialized
        status = sd_service.get_status()
        if not status.get("initialized"):
            # Initialize with base model if provided
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
                    "path": lora.path if not lora.subfolder else f"{lora.subfolder}/{lora.name}",
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
                # Save to output folder
                filename = f"generated_{timestamp}_{len(all_images)}.png"
                output_path = output_dir / filename
                img.save(output_path)
                logger.info(f"Image saved to: {output_path}")

                # Return relative file path instead of base64
                all_images.append(filename)

        # Apply detailers if active
        if request.detailers:
            all_images = await apply_detailers(
                images=all_images,
                detailers=request.detailers,
                api_request=api_request
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
    api_request: Request
) -> List[str]:
    """
    Apply detailer post-processing to generated images

    Args:
        images: List of base64 encoded images
        detailers: Active detailer configurations
        api_request: FastAPI request object

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

        processed_images = []

        for img_str in images:
            # Decode image
            img_data = base64.b64decode(img_str)
            img = Image.open(io.BytesIO(img_data)).convert("RGB")

            # Apply each detailer sequentially
            for detailer_name, detailer_config in active_detailers.items():
                logger.info(f"Applying detailer: {detailer_name}")

                # TODO: Implement detailer processing
                # This will integrate with existing detailer models
                # For now, pass through without modification
                pass

            # Convert back to base64
            buffered = io.BytesIO()
            img.save(buffered, format="PNG")
            processed_img_str = base64.b64encode(buffered.getvalue()).decode()
            processed_images.append(processed_img_str)

        return processed_images

    except Exception as e:
        logger.error(f"Detailer processing error: {e}")
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
