"""
Stable Diffusion Pipeline Service
Handles T2I and I2I generation with LoRA support and various schedulers.
"""

import logging
import torch
import gc
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any, List
from PIL import Image
from safetensors.torch import load_file
from diffusers import (
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
    StableDiffusionImg2ImgPipeline,
    StableDiffusionXLImg2ImgPipeline,
    StableDiffusionControlNetPipeline,
    StableDiffusionXLControlNetPipeline,
    StableDiffusionControlNetImg2ImgPipeline,
    StableDiffusionXLControlNetImg2ImgPipeline,
    DPMSolverMultistepScheduler,
    DPMSolverSinglestepScheduler,
    EulerAncestralDiscreteScheduler,
    EulerDiscreteScheduler,
    DDIMScheduler,
    DDPMScheduler,
    LMSDiscreteScheduler,
    PNDMScheduler,
    UniPCMultistepScheduler,
    HeunDiscreteScheduler,
    KDPM2DiscreteScheduler,
    KDPM2AncestralDiscreteScheduler,
)

logger = logging.getLogger(__name__)

# Import LoRA converter for format detection and conversion
import sys
from pathlib import Path as PathLib
sys.path.append(str(PathLib(__file__).parent.parent))
from utils.lora_converter import LoRAConverter


class SDPipelineService:
    """Stable Diffusion pipeline service for T2I and I2I generation"""

    def __init__(self, config_manager, checkpoint_loader):
        self.config_manager = config_manager
        self.checkpoint_loader = checkpoint_loader
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Pipeline instances
        self.txt2img_pipe = None
        self.img2img_pipe = None

        # Current pipeline configuration
        self.current_checkpoint = None
        self.current_vae = None
        self.loaded_loras = []

        # ControlNet instances
        self.loaded_controlnets = {}  # {model_name: controlnet_model}
        self.controlnet_pipe = None

        logger.info(f"SDPipelineService initialized on device: {self.device}")

    def initialize_pipeline(self, checkpoint_path: str, vae_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Initialize Stable Diffusion pipeline from checkpoint

        Args:
            checkpoint_path: Path to checkpoint model
            vae_path: Optional path to VAE model

        Returns:
            Dict with initialization results
        """
        try:
            logger.info(f"Initializing SD pipeline with checkpoint: {checkpoint_path}")

            # Resolve full checkpoint path
            if not Path(checkpoint_path).is_absolute():
                full_checkpoint_path = Path(self.config_manager.checkpoints_path) / checkpoint_path
            else:
                full_checkpoint_path = Path(checkpoint_path)

            if not full_checkpoint_path.exists():
                raise FileNotFoundError(f"Checkpoint not found: {full_checkpoint_path}")

            # Unload previous pipelines
            if self.txt2img_pipe is not None or self.img2img_pipe is not None:
                self.unload_pipeline()

            # Load checkpoint
            checkpoint_result = self.checkpoint_loader.load_checkpoint(checkpoint_path)
            if not checkpoint_result["success"]:
                raise RuntimeError(f"Failed to load checkpoint: {checkpoint_result.get('error')}")

            # Detect model type (SD 1.5 vs SDXL) from path or name
            is_sdxl = any(keyword in checkpoint_path.upper() for keyword in ['SDXL', 'XL'])
            pipeline_class = StableDiffusionXLPipeline if is_sdxl else StableDiffusionPipeline

            logger.info(f"Detected model type: {'SDXL' if is_sdxl else 'SD 1.5'}")

            # Initialize T2I pipeline from checkpoint
            # SDXL and SD 1.5 have different initialization parameters
            import time
            load_start = time.time()
            logger.info("⏱️ Starting pipeline loading from checkpoint...")

            if is_sdxl:
                # SDXL: No safety_checker parameters
                self.txt2img_pipe = pipeline_class.from_single_file(
                    str(full_checkpoint_path),
                    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                    use_safetensors=full_checkpoint_path.suffix == '.safetensors',
                    local_files_only=False  # Allow HuggingFace downloads on first load
                )
            else:
                # SD 1.5: Disable safety_checker
                self.txt2img_pipe = pipeline_class.from_single_file(
                    str(full_checkpoint_path),
                    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                    load_safety_checker=False,
                    use_safetensors=full_checkpoint_path.suffix == '.safetensors',
                    local_files_only=False  # Allow HuggingFace downloads on first load
                )

            load_time = time.time() - load_start
            logger.info(f"⏱️ Pipeline loaded in {load_time:.2f}s")

            # Move to device
            device_start = time.time()
            logger.info("⏱️ Moving pipeline to GPU...")
            self.txt2img_pipe = self.txt2img_pipe.to(self.device)
            device_time = time.time() - device_start
            logger.info(f"⏱️ Moved to device in {device_time:.2f}s")

            # Enable memory optimizations
            if torch.cuda.is_available():
                self.txt2img_pipe.enable_attention_slicing()
                self.txt2img_pipe.enable_vae_slicing()

            # Initialize I2I pipeline (shares components with T2I)
            img2img_class = StableDiffusionXLImg2ImgPipeline if is_sdxl else StableDiffusionImg2ImgPipeline

            if is_sdxl:
                # SDXL has dual text encoders
                self.img2img_pipe = img2img_class(
                    vae=self.txt2img_pipe.vae,
                    text_encoder=self.txt2img_pipe.text_encoder,
                    text_encoder_2=self.txt2img_pipe.text_encoder_2,
                    tokenizer=self.txt2img_pipe.tokenizer,
                    tokenizer_2=self.txt2img_pipe.tokenizer_2,
                    unet=self.txt2img_pipe.unet,
                    scheduler=self.txt2img_pipe.scheduler,
                    force_zeros_for_empty_prompt=False,
                    add_watermarker=False
                )
            else:
                # SD 1.5
                self.img2img_pipe = img2img_class(
                    vae=self.txt2img_pipe.vae,
                    text_encoder=self.txt2img_pipe.text_encoder,
                    tokenizer=self.txt2img_pipe.tokenizer,
                    unet=self.txt2img_pipe.unet,
                    scheduler=self.txt2img_pipe.scheduler,
                    safety_checker=None,
                    feature_extractor=None,
                    requires_safety_checker=False
                )

            self.current_checkpoint = checkpoint_path

            # Load custom VAE if provided
            if vae_path:
                vae_result = self.load_vae(vae_path)
                if not vae_result["success"]:
                    logger.warning(f"Failed to load VAE: {vae_result.get('error')}")

            logger.info("SD pipeline initialized successfully")

            return {
                "success": True,
                "checkpoint": checkpoint_path,
                "vae": vae_path,
                "device": str(self.device)
            }

        except Exception as e:
            logger.error(f"Error initializing pipeline: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def load_vae(self, vae_path: str) -> Dict[str, Any]:
        """
        Load custom VAE model

        Args:
            vae_path: Path to VAE model

        Returns:
            Dict with loading results
        """
        try:
            if self.txt2img_pipe is None:
                raise RuntimeError("Pipeline not initialized")

            logger.info(f"Loading custom VAE: {vae_path}")

            vae_result = self.checkpoint_loader.load_vae(vae_path)
            if not vae_result["success"]:
                raise RuntimeError(f"Failed to load VAE: {vae_result.get('error')}")

            # Replace VAE in both pipelines
            from diffusers import AutoencoderKL

            # Resolve full VAE path
            if not Path(vae_path).is_absolute():
                full_vae_path = Path(self.config_manager.vae_path) / vae_path
            else:
                full_vae_path = Path(vae_path)

            vae = AutoencoderKL.from_single_file(
                str(full_vae_path),
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
            ).to(self.device)

            self.txt2img_pipe.vae = vae
            self.img2img_pipe.vae = vae

            self.current_vae = vae_path

            return {
                "success": True,
                "vae_path": vae_path
            }

        except Exception as e:
            logger.error(f"Error loading VAE: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def load_loras(self, loras: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Load LoRA models

        Args:
            loras: List of LoRA configs [{path, weight}]

        Returns:
            Dict with loading results
        """
        try:
            if self.txt2img_pipe is None:
                raise RuntimeError("Pipeline not initialized")

            logger.info(f"Loading {len(loras)} LoRA models")

            # Clear loaded LoRAs list (diffusers handles adapter replacement automatically)
            self.loaded_loras = []

            # Accumulate adapter names and weights
            adapter_names = []
            adapter_weights = []

            # Load each LoRA
            for lora_config in loras:
                lora_path = lora_config.get("path")
                lora_weight = lora_config.get("weight", 1.0)

                if not lora_path:
                    logger.warning(f"LoRA config missing 'path': {lora_config}")
                    continue

                # Resolve full LoRA path
                if not Path(lora_path).is_absolute():
                    full_lora_path = Path(self.config_manager.loras_path) / lora_path
                else:
                    full_lora_path = Path(lora_path)

                if not full_lora_path.exists():
                    logger.warning(f"❌ LoRA not found: {full_lora_path}")
                    continue

                # Detect LoRA format and convert if necessary
                logger.info(f"Loading LoRA: {full_lora_path.name}")

                # Load state dict to detect format
                state_dict = load_file(str(full_lora_path))
                lora_format = LoRAConverter.detect_lora_format(state_dict)
                logger.info(f"Detected format: {lora_format}")

                # Handle ComfyUI format (auto-convert to Kohya)
                if lora_format == 'comfyui':
                    logger.info("ComfyUI format detected - converting to Diffusers format via LoRAConverter...")

                    import hashlib

                    project_root = Path(self.config_manager.project_root)
                    cache_dir = project_root / "cache" / "loras"
                    cache_dir.mkdir(parents=True, exist_ok=True)

                    file_hash = hashlib.md5(str(full_lora_path).encode()).hexdigest()[:8]
                    diffusers_cache = cache_dir / f"{full_lora_path.stem}_{file_hash}_diffusers.safetensors"

                    try:
                        if diffusers_cache.exists():
                            logger.info(f"Using cached Diffusers format: {diffusers_cache.name}")
                            converted_state = load_file(str(diffusers_cache))
                        else:
                            converted_state, _ = LoRAConverter.convert_to_diffusers(
                                full_lora_path,
                                output_path=diffusers_cache
                            )
                            logger.info(f"Saved Diffusers format to cache: {diffusers_cache.name}")
                    except Exception as conversion_error:
                        logger.error(f"Failed to convert LoRA {full_lora_path.name}: {conversion_error}")
                        continue

                    try:
                        self.txt2img_pipe.load_lora_weights(
                            converted_state,
                            adapter_name=full_lora_path.stem
                        )
                        logger.info(f"✅ Loaded converted LoRA: {full_lora_path.stem}")
                    except Exception as e:
                        logger.error(f"Failed to load converted LoRA: {e}")
                        continue

                elif lora_format in ['kohya', 'diffusers']:
                    try:
                        self.txt2img_pipe.load_lora_weights(
                            str(full_lora_path.parent),
                            weight_name=full_lora_path.name,
                            adapter_name=full_lora_path.stem
                        )
                        logger.info(f"✅ Loaded {lora_format} format LoRA: {full_lora_path.stem}")
                    except Exception as e:
                        logger.warning(f"Directory method failed: {e}, trying full path...")
                        self.txt2img_pipe.load_lora_weights(
                            str(full_lora_path),
                            adapter_name=full_lora_path.stem
                        )
                        logger.info(f"✅ Loaded via full path: {full_lora_path.stem}")
                else:
                    logger.error(f"❌ Unsupported LoRA format: {lora_format}")
                    continue

                # Accumulate adapter info
                adapter_names.append(full_lora_path.stem)
                adapter_weights.append(lora_weight)

                self.loaded_loras.append(lora_config)
                logger.info(f"Loaded LoRA: {lora_path} (weight: {lora_weight})")

            # Activate all LoRAs together (after loop)
            if adapter_names:
                self.txt2img_pipe.set_adapters(
                    adapter_names,
                    adapter_weights=adapter_weights
                )
                logger.info(f"Activated {len(adapter_names)} LoRAs for T2I: {adapter_names} with weights {adapter_weights}")

                # Also activate for I2I pipeline if it exists
                if self.img2img_pipe:
                    self.img2img_pipe.set_adapters(
                        adapter_names,
                        adapter_weights=adapter_weights
                    )
                    logger.info(f"Activated {len(adapter_names)} LoRAs for I2I: {adapter_names} with weights {adapter_weights}")

            return {
                "success": True,
                "loaded_loras": len(self.loaded_loras)
            }

        except Exception as e:
            logger.error(f"Error loading LoRAs: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def unload_loras(self):
        """
        Unload all LoRA models

        NOTE: Only called during pipeline unload, NOT during LoRA reload.
        Calling unload_lora_weights() corrupts adapter state and causes
        "Invalid LoRA checkpoint" errors on subsequent loads.
        """
        try:
            if self.txt2img_pipe and self.loaded_loras:
                logger.info("Unloading LoRAs")
                self.txt2img_pipe.unload_lora_weights()
                self.loaded_loras = []
        except Exception as e:
            logger.error(f"Error unloading LoRAs: {e}")

    def unload_controlnet_models(self):
        """
        Unload all ControlNet models and free GPU memory
        """
        try:
            if self.loaded_controlnets:
                logger.info(f"Unloading {len(self.loaded_controlnets)} ControlNet model(s)")

                # Clear ControlNet instances
                for model_name in list(self.loaded_controlnets.keys()):
                    del self.loaded_controlnets[model_name]

                self.loaded_controlnets = {}
                self.controlnet_pipe = None

                # Force garbage collection
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

                logger.info("ControlNet models unloaded")
        except Exception as e:
            logger.error(f"Error unloading ControlNet models: {e}")

    def load_controlnet_models(self, controlnet_configs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Load ControlNet models with automatic unload-first logic

        Args:
            controlnet_configs: List of ControlNet configurations with 'type' and 'model' fields

        Returns:
            Dict with success status and loaded model info
        """
        try:
            # Step 1: Unload existing ControlNet models first
            if self.loaded_controlnets:
                logger.info("Unloading existing ControlNet models before loading new ones")
                self.unload_controlnet_models()

            # Step 2: Load new ControlNet models
            from diffusers import ControlNetModel

            # Get ControlNet models base path from config
            controlnet_base_path = Path(self.config_manager.checkpoints_path).parent / "controlnet"
            logger.info(f"ControlNet base path: {controlnet_base_path}")

            loaded_models = {}
            for config in controlnet_configs:
                cn_type = config.get('type', 'depth')
                cn_model_info = config.get('model')

                if not cn_model_info:
                    logger.warning(f"No model specified for ControlNet type {cn_type}, skipping")
                    continue

                model_name = cn_model_info.get('name', f'controlnet_{cn_type}')
                model_path = cn_model_info.get('path')

                if not model_path:
                    logger.warning(f"No model path for {model_name}, skipping")
                    continue

                # Build full path to safetensors file
                full_model_path = controlnet_base_path / model_path

                if not full_model_path.exists():
                    logger.error(f"ControlNet model file not found: {full_model_path}")
                    continue

                logger.info(f"Loading ControlNet model from: {full_model_path}")

                # Determine base config based on model type and ControlNet type
                is_sdxl = 'SDXL' in str(full_model_path) or 'xl' in model_name.lower()

                # Map ControlNet types to appropriate configs
                controlnet_config_map = {
                    'canny': {
                        'sdxl': "diffusers/controlnet-canny-sdxl-1.0",
                        'sd15': "lllyasviel/control_v11p_sd15_canny"
                    },
                    'depth': {
                        'sdxl': "diffusers/controlnet-depth-sdxl-1.0",
                        'sd15': "lllyasviel/control_v11f1p_sd15_depth"
                    },
                    'openpose': {
                        'sdxl': "thibaud/controlnet-openpose-sdxl-1.0",
                        'sd15': "lllyasviel/control_v11p_sd15_openpose"
                    },
                    'lineart': {
                        'sdxl': "diffusers/controlnet-lineart-sdxl-1.0",
                        'sd15': "lllyasviel/control_v11p_sd15_lineart"
                    }
                }

                # Get appropriate config for the ControlNet type
                model_type = 'sdxl' if is_sdxl else 'sd15'
                base_config = controlnet_config_map.get(cn_type, {}).get(
                    model_type,
                    "diffusers/controlnet-canny-sdxl-1.0" if is_sdxl else "lllyasviel/control_v11p_sd15_canny"
                )

                logger.info(f"Using base config for {cn_type} ({model_type}): {base_config}")

                # Load ControlNet model from single safetensors file with config
                import time
                cn_load_start = time.time()
                logger.info(f"⏱️ Loading ControlNet from safetensors ({full_model_path.stat().st_size / 1024**3:.2f} GB)...")

                controlnet = ControlNetModel.from_single_file(
                    str(full_model_path),
                    torch_dtype=torch.float16 if self.device.type == 'cuda' else torch.float32,
                    config=base_config
                )

                cn_load_time = time.time() - cn_load_start
                logger.info(f"⏱️ ControlNet loaded from file in {cn_load_time:.2f}s")

                cn_device_start = time.time()
                logger.info("⏱️ Moving ControlNet to GPU...")
                controlnet = controlnet.to(self.device)

                cn_device_time = time.time() - cn_device_start
                logger.info(f"⏱️ ControlNet moved to GPU in {cn_device_time:.2f}s")

                loaded_models[model_name] = {
                    'model': controlnet,
                    'type': cn_type,
                    'path': str(full_model_path)
                }

                logger.info(f"✅ ControlNet model loaded: {model_name}")

            self.loaded_controlnets = loaded_models

            return {
                "success": True,
                "loaded_models": list(loaded_models.keys()),
                "count": len(loaded_models)
            }

        except Exception as e:
            logger.error(f"Error loading ControlNet models: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    def set_scheduler(self, scheduler_name: str, use_karras: bool = False) -> Dict[str, Any]:
        """
        Set scheduler for generation

        Args:
            scheduler_name: Name of scheduler (dpm++_2m, euler_a, ddim, etc.)
            use_karras: Use Karras sigmas for compatible schedulers

        Returns:
            Dict with scheduler info
        """
        try:
            if self.txt2img_pipe is None:
                raise RuntimeError("Pipeline not initialized")

            logger.info(f"Setting scheduler: {scheduler_name} (karras: {use_karras})")

            scheduler_map = {
                "dpm++_2m": DPMSolverMultistepScheduler,
                "dpm++_2m_karras": DPMSolverMultistepScheduler,
                "dpm++_sde": DPMSolverSinglestepScheduler,
                "dpm++_sde_karras": DPMSolverSinglestepScheduler,
                "euler": EulerDiscreteScheduler,
                "euler_a": EulerAncestralDiscreteScheduler,
                "heun": HeunDiscreteScheduler,
                "ddim": DDIMScheduler,
                "ddpm": DDPMScheduler,
                "lms": LMSDiscreteScheduler,
                "pndm": PNDMScheduler,
                "unipc": UniPCMultistepScheduler,
                "dpm2": KDPM2DiscreteScheduler,
                "dpm2_a": KDPM2AncestralDiscreteScheduler,
            }

            scheduler_class = scheduler_map.get(scheduler_name.lower())
            if not scheduler_class:
                raise ValueError(f"Unknown scheduler: {scheduler_name}")

            # Create scheduler config
            scheduler_config = self.txt2img_pipe.scheduler.config.copy()

            # Apply Karras sigmas if supported and requested
            if use_karras and hasattr(scheduler_class, "use_karras_sigmas"):
                scheduler = scheduler_class.from_config(scheduler_config, use_karras_sigmas=True)
            else:
                scheduler = scheduler_class.from_config(scheduler_config)

            # Set scheduler for both pipelines
            self.txt2img_pipe.scheduler = scheduler
            self.img2img_pipe.scheduler = scheduler

            return {
                "success": True,
                "scheduler": scheduler_name,
                "karras": use_karras
            }

        except Exception as e:
            logger.error(f"Error setting scheduler: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def generate_t2i(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: int = 512,
        height: int = 512,
        num_inference_steps: int = 20,
        guidance_scale: float = 7.5,
        seed: int = -1,
        batch_size: int = 1,
        callback: Optional[callable] = None,
        controlnets: Optional[List[Dict[str, Any]]] = None  # 🔧 FIX: ControlNet parameter
    ) -> Dict[str, Any]:
        """
        Generate images from text (T2I)

        Args:
            prompt: Positive prompt
            negative_prompt: Negative prompt
            width: Image width
            height: Image height
            num_inference_steps: Number of denoising steps
            guidance_scale: Guidance scale for classifier-free guidance
            seed: Random seed (-1 for random)
            controlnets: ControlNet configurations (optional)
            batch_size: Number of images to generate
            callback: Optional callback function for progress updates (step, total_steps)

        Returns:
            Dict with generated images and metadata
        """
        try:
            if self.txt2img_pipe is None:
                raise RuntimeError("Pipeline not initialized")

            # 🔧 FIX: Load ControlNet models if needed
            controlnet_status = "disabled"
            if controlnets and len(controlnets) > 0:
                controlnet_status = f"{len(controlnets)} ControlNets enabled"

                # Load ControlNet models (will auto-unload existing models)
                load_result = self.load_controlnet_models(controlnets)
                if not load_result.get("success"):
                    logger.warning(f"Failed to load ControlNet models: {load_result.get('error')}")
                    controlnet_status = "disabled (load failed)"
                else:
                    logger.info(f"✅ Loaded {load_result.get('count', 0)} ControlNet model(s)")
                    for cn in controlnets:
                        cn_type = cn.get('type', 'unknown')
                        cn_weight = cn.get('weight', 1.0)
                        cn_image = cn.get('image')
                        image_info = f"{cn_image.size}" if cn_image and hasattr(cn_image, 'size') else 'No image'
                        logger.info(f"  🎮 ControlNet: {cn_type} (weight={cn_weight}, image={image_info})")

            logger.info(f"Generating T2I ({controlnet_status}): {width}x{height}, steps={num_inference_steps}, cfg={guidance_scale}")
            logger.debug(f"T2I Parameters: prompt={prompt[:50] if prompt else 'None'}..., "
                        f"negative_prompt={negative_prompt[:50] if negative_prompt else 'None'}..., "
                        f"batch_size={batch_size}, seed={seed}")

            # Set seed
            generator = None
            if seed >= 0:
                generator = torch.Generator(device=self.device).manual_seed(seed)

            # Ensure negative_prompt is a string (diffusers doesn't handle None well in some checks)
            if negative_prompt is None:
                negative_prompt = ""

            # Ensure prompt is a string and not empty
            if prompt is None or prompt == "":
                raise ValueError("Prompt cannot be None or empty")

            # Prepare callback wrapper for Diffusers pipeline
            callback_on_step_end = None
            if callback is not None:
                def step_callback(pipe, step_index, timestep, callback_kwargs):
                    """Wrapper for Diffusers callback format"""
                    callback(step_index + 1, num_inference_steps)
                    return callback_kwargs
                callback_on_step_end = step_callback

            # Prepare ControlNet parameters if available
            controlnet_images_list = []
            controlnet_conditioning_scale = []

            if controlnets and len(controlnets) > 0 and self.loaded_controlnets:
                for cn in controlnets:
                    cn_image = cn.get('image')
                    if cn_image:
                        controlnet_images_list.append(cn_image)
                        controlnet_conditioning_scale.append(cn.get('weight', 1.0))

            # Generate images with or without ControlNet
            if controlnet_images_list and self.loaded_controlnets:
                # Use ControlNet pipeline
                logger.info(f"🎮 Generating with {len(controlnet_images_list)} ControlNet(s)")

                # Create temporary ControlNet pipeline from existing pipeline
                from diffusers import StableDiffusionXLControlNetPipeline, StableDiffusionControlNetPipeline

                # Get ControlNet models
                controlnet_models = [info['model'] for info in self.loaded_controlnets.values()]

                # Choose pipeline class based on model type
                is_sdxl = isinstance(self.txt2img_pipe, StableDiffusionXLPipeline)
                cn_pipeline_class = StableDiffusionXLControlNetPipeline if is_sdxl else StableDiffusionControlNetPipeline

                # Create ControlNet pipeline using components from existing pipeline
                if is_sdxl:
                    cn_pipe = cn_pipeline_class(
                        vae=self.txt2img_pipe.vae,
                        text_encoder=self.txt2img_pipe.text_encoder,
                        text_encoder_2=self.txt2img_pipe.text_encoder_2,
                        tokenizer=self.txt2img_pipe.tokenizer,
                        tokenizer_2=self.txt2img_pipe.tokenizer_2,
                        unet=self.txt2img_pipe.unet,
                        controlnet=controlnet_models if len(controlnet_models) > 1 else controlnet_models[0],
                        scheduler=self.txt2img_pipe.scheduler,
                        force_zeros_for_empty_prompt=False,
                        add_watermarker=False
                    )
                else:
                    cn_pipe = cn_pipeline_class(
                        vae=self.txt2img_pipe.vae,
                        text_encoder=self.txt2img_pipe.text_encoder,
                        tokenizer=self.txt2img_pipe.tokenizer,
                        unet=self.txt2img_pipe.unet,
                        controlnet=controlnet_models if len(controlnet_models) > 1 else controlnet_models[0],
                        scheduler=self.txt2img_pipe.scheduler,
                        safety_checker=None,
                        feature_extractor=None
                    )

                result = cn_pipe(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    image=controlnet_images_list if len(controlnet_images_list) > 1 else controlnet_images_list[0],
                    width=width,
                    height=height,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    controlnet_conditioning_scale=controlnet_conditioning_scale if len(controlnet_conditioning_scale) > 1 else controlnet_conditioning_scale[0],
                    num_images_per_prompt=batch_size,
                    generator=generator,
                    callback_on_step_end=callback_on_step_end
                )

                # Clean up temporary pipeline
                del cn_pipe
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            else:
                # Generate without ControlNet
                result = self.txt2img_pipe(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    width=width,
                    height=height,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    num_images_per_prompt=batch_size,
                    generator=generator,
                    callback_on_step_end=callback_on_step_end
                )

            images = result.images

            return {
                "success": True,
                "images": images,
                "metadata": {
                    "prompt": prompt,
                    "negative_prompt": negative_prompt,
                    "width": width,
                    "height": height,
                    "steps": num_inference_steps,
                    "cfg_scale": guidance_scale,
                    "seed": seed,
                    "batch_size": batch_size
                }
            }

        except Exception as e:
            logger.error(f"Error generating T2I: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }

    def generate_i2i(
        self,
        prompt: str,
        init_image: Image.Image,
        negative_prompt: str = "",
        strength: float = 0.75,
        num_inference_steps: int = 20,
        guidance_scale: float = 7.5,
        seed: int = -1,
        batch_size: int = 1,
        controlnets: Optional[List[Dict[str, Any]]] = None  # 🔧 FIX: ControlNet parameter
    ) -> Dict[str, Any]:
        """
        Generate images from image + text (I2I)

        Args:
            prompt: Positive prompt
            controlnets: ControlNet configurations (optional)
            init_image: Initial image
            negative_prompt: Negative prompt
            strength: Denoising strength (0.0-1.0)
            num_inference_steps: Number of denoising steps
            guidance_scale: Guidance scale for classifier-free guidance
            seed: Random seed (-1 for random)
            batch_size: Number of images to generate

        Returns:
            Dict with generated images and metadata
        """
        try:
            if self.img2img_pipe is None:
                raise RuntimeError("Pipeline not initialized")

            # 🔧 FIX: Load ControlNet models if needed
            controlnet_status = "disabled"
            if controlnets and len(controlnets) > 0:
                controlnet_status = f"{len(controlnets)} ControlNets enabled"

                # Load ControlNet models (will auto-unload existing models)
                load_result = self.load_controlnet_models(controlnets)
                if not load_result.get("success"):
                    logger.warning(f"Failed to load ControlNet models: {load_result.get('error')}")
                    controlnet_status = "disabled (load failed)"
                else:
                    logger.info(f"✅ Loaded {load_result.get('count', 0)} ControlNet model(s)")
                    for cn in controlnets:
                        cn_type = cn.get('type', 'unknown')
                        cn_weight = cn.get('weight', 1.0)
                        cn_image = cn.get('image')
                        image_info = f"{cn_image.size}" if cn_image and hasattr(cn_image, 'size') else 'No image'
                        logger.info(f"  🎮 ControlNet: {cn_type} (weight={cn_weight}, image={image_info})")

            logger.info(f"Generating I2I ({controlnet_status}): strength={strength}, steps={num_inference_steps}, cfg={guidance_scale}")

            # Set seed
            generator = None
            if seed >= 0:
                generator = torch.Generator(device=self.device).manual_seed(seed)

            # Prepare ControlNet parameters if available
            controlnet_images_list = []
            controlnet_conditioning_scale = []

            if controlnets and len(controlnets) > 0 and self.loaded_controlnets:
                for cn in controlnets:
                    cn_image = cn.get('image')
                    if cn_image:
                        controlnet_images_list.append(cn_image)
                        controlnet_conditioning_scale.append(cn.get('weight', 1.0))

            # Generate images with or without ControlNet
            if controlnet_images_list and self.loaded_controlnets:
                # Use ControlNet I2I pipeline
                logger.info(f"🎮 Generating I2I with {len(controlnet_images_list)} ControlNet(s)")

                # Create temporary ControlNet pipeline from existing pipeline
                from diffusers import StableDiffusionXLControlNetImg2ImgPipeline, StableDiffusionControlNetImg2ImgPipeline

                # Get ControlNet models
                controlnet_models = [info['model'] for info in self.loaded_controlnets.values()]

                # Choose pipeline class based on model type
                is_sdxl = isinstance(self.img2img_pipe, StableDiffusionXLImg2ImgPipeline)
                cn_pipeline_class = StableDiffusionXLControlNetImg2ImgPipeline if is_sdxl else StableDiffusionControlNetImg2ImgPipeline

                # Create ControlNet pipeline using components from existing pipeline
                if is_sdxl:
                    cn_pipe = cn_pipeline_class(
                        vae=self.img2img_pipe.vae,
                        text_encoder=self.img2img_pipe.text_encoder,
                        text_encoder_2=self.img2img_pipe.text_encoder_2,
                        tokenizer=self.img2img_pipe.tokenizer,
                        tokenizer_2=self.img2img_pipe.tokenizer_2,
                        unet=self.img2img_pipe.unet,
                        controlnet=controlnet_models if len(controlnet_models) > 1 else controlnet_models[0],
                        scheduler=self.img2img_pipe.scheduler,
                        force_zeros_for_empty_prompt=False,
                        add_watermarker=False
                    )
                else:
                    cn_pipe = cn_pipeline_class(
                        vae=self.img2img_pipe.vae,
                        text_encoder=self.img2img_pipe.text_encoder,
                        tokenizer=self.img2img_pipe.tokenizer,
                        unet=self.img2img_pipe.unet,
                        controlnet=controlnet_models if len(controlnet_models) > 1 else controlnet_models[0],
                        scheduler=self.img2img_pipe.scheduler,
                        safety_checker=None,
                        feature_extractor=None
                    )

                result = cn_pipe(
                    prompt=prompt,
                    image=init_image,
                    control_image=controlnet_images_list if len(controlnet_images_list) > 1 else controlnet_images_list[0],
                    negative_prompt=negative_prompt,
                    strength=strength,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    controlnet_conditioning_scale=controlnet_conditioning_scale if len(controlnet_conditioning_scale) > 1 else controlnet_conditioning_scale[0],
                    num_images_per_prompt=batch_size,
                    generator=generator
                )

                # Clean up temporary pipeline
                del cn_pipe
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            else:
                # Generate without ControlNet
                result = self.img2img_pipe(
                    prompt=prompt,
                    image=init_image,
                    negative_prompt=negative_prompt,
                    strength=strength,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    num_images_per_prompt=batch_size,
                    generator=generator
                )

            images = result.images

            return {
                "success": True,
                "images": images,
                "metadata": {
                    "prompt": prompt,
                    "negative_prompt": negative_prompt,
                    "strength": strength,
                    "steps": num_inference_steps,
                    "cfg_scale": guidance_scale,
                    "seed": seed,
                    "batch_size": batch_size,
                    "init_image_size": init_image.size
                }
            }

        except Exception as e:
            logger.error(f"Error generating I2I: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def unload_pipeline(self):
        """Unload pipeline and free GPU memory"""
        try:
            logger.info("Unloading SD pipeline")

            # Unload LoRAs first
            self.unload_loras()

            # Unload ControlNets
            self.unload_controlnet_models()

            # Clear pipelines
            self.txt2img_pipe = None
            self.img2img_pipe = None
            self.controlnet_pipe = None
            self.current_checkpoint = None
            self.current_vae = None

            # Force garbage collection
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

            logger.info("SD pipeline unloaded")

        except Exception as e:
            logger.error(f"Error unloading pipeline: {e}")

    def get_status(self) -> Dict[str, Any]:
        """Get current pipeline status"""
        return {
            "initialized": self.txt2img_pipe is not None,
            "checkpoint": self.current_checkpoint,
            "vae": self.current_vae,
            "loaded_loras": len(self.loaded_loras),
            "loras": self.loaded_loras,
            "device": str(self.device)
        }