"""
Generation WebSocket API
Provides real-time progress updates for image generation using WebSockets.
"""

import logging
import io
import base64
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from pydantic import BaseModel
from PIL import Image

from .generation import GenerationRequest, LoRAConfig

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections"""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept and register new WebSocket connection"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"WebSocket connected: {client_id}")

    def disconnect(self, client_id: str):
        """Remove WebSocket connection"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"WebSocket disconnected: {client_id}")

    async def send_message(self, client_id: str, message: dict):
        """Send message to specific client"""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception as e:
                logger.error(f"Failed to send message to {client_id}: {e}")
                self.disconnect(client_id)

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected = []
        for client_id, websocket in self.active_connections.items():
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to broadcast to {client_id}: {e}")
                disconnected.append(client_id)

        # Clean up disconnected clients
        for client_id in disconnected:
            self.disconnect(client_id)


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/generate/{client_id}")
async def websocket_generate_endpoint(
    websocket: WebSocket,
    client_id: str
):
    """
    WebSocket endpoint for real-time image generation with progress updates

    Client sends: GenerationRequest JSON
    Server sends: Progress updates and final result

    Message types:
    - {"type": "status", "message": "...", "stage": "..."}
    - {"type": "progress", "current": N, "total": M, "percent": X}
    - {"type": "image", "index": N, "data": "base64..."}
    - {"type": "complete", "images": [...], "metadata": {...}}
    - {"type": "error", "error": "..."}
    """
    await manager.connect(websocket, client_id)

    try:
        # Wait for generation request
        data = await websocket.receive_json()

        # Parse request
        try:
            request = GenerationRequest(**data)
        except Exception as e:
            await manager.send_message(client_id, {
                "type": "error",
                "error": f"Invalid request format: {str(e)}"
            })
            return

        # Get services from websocket app state
        if not hasattr(websocket.app.state, 'sd_pipeline_service'):
            await manager.send_message(client_id, {
                "type": "error",
                "error": "SD pipeline service not initialized"
            })
            return

        sd_service = websocket.app.state.sd_pipeline_service

        # Send initial status
        await manager.send_message(client_id, {
            "type": "status",
            "message": "Starting generation...",
            "stage": "init"
        })

        # Check if pipeline is initialized
        status = sd_service.get_status()
        if not status.get("initialized"):
            if request.base_model:
                await manager.send_message(client_id, {
                    "type": "status",
                    "message": "Loading model...",
                    "stage": "model_loading"
                })

                init_result = sd_service.initialize_pipeline(
                    checkpoint_path=request.base_model,
                    vae_path=request.vae
                )

                if not init_result["success"]:
                    await manager.send_message(client_id, {
                        "type": "error",
                        "error": f"Failed to initialize pipeline: {init_result.get('error')}"
                    })
                    return
            else:
                await manager.send_message(client_id, {
                    "type": "error",
                    "error": "No base model loaded. Please load a checkpoint first."
                })
                return

        # Set scheduler
        await manager.send_message(client_id, {
            "type": "status",
            "message": "Configuring sampler...",
            "stage": "scheduler"
        })

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

        scheduler_name = sampler_map.get(request.sampler, request.sampler.lower())
        sd_service.set_scheduler(scheduler_name=scheduler_name, use_karras=request.use_karras)

        # Load LoRAs if provided
        if request.loras:
            await manager.send_message(client_id, {
                "type": "status",
                "message": f"Loading {len(request.loras)} LoRA(s)...",
                "stage": "lora_loading"
            })

            lora_configs = [
                {
                    "path": lora.path if not lora.subfolder else f"{lora.subfolder}/{lora.name}",
                    "weight": lora.weight
                }
                for lora in request.loras
            ]
            sd_service.load_loras(lora_configs)

        # Determine generation mode
        is_i2i = request.init_image is not None
        all_images = []

        # Calculate total steps
        total_repeats = request.repeat_count
        total_steps = total_repeats * request.steps
        current_step = 0

        # Generate images
        for repeat in range(request.repeat_count):
            current_seed = request.seed if request.seed >= 0 else -1
            if current_seed >= 0 and repeat > 0:
                current_seed += repeat

            await manager.send_message(client_id, {
                "type": "status",
                "message": f"Generating image {repeat + 1}/{total_repeats}...",
                "stage": "generating",
                "repeat": repeat + 1,
                "total_repeats": total_repeats
            })

            if is_i2i:
                # I2I generation
                try:
                    image_data = base64.b64decode(request.init_image)
                    init_image = Image.open(io.BytesIO(image_data)).convert("RGB")
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
                    await manager.send_message(client_id, {
                        "type": "error",
                        "error": f"I2I generation failed: {str(e)}"
                    })
                    return
            else:
                # T2I generation with progress callback
                def progress_callback(step: int, total: int):
                    """Callback for progress updates during generation"""
                    nonlocal current_step
                    current_step += 1

                    asyncio.create_task(manager.send_message(client_id, {
                        "type": "progress",
                        "current": current_step,
                        "total": total_steps,
                        "percent": int((current_step / total_steps) * 100),
                        "step": step,
                        "total_steps_this_image": total
                    }))

                result = sd_service.generate_t2i(
                    prompt=request.positive_prompt,
                    negative_prompt=request.negative_prompt,
                    width=request.width,
                    height=request.height,
                    num_inference_steps=request.steps,
                    guidance_scale=request.cfg_scale,
                    seed=current_seed,
                    batch_size=request.batch_count,
                    callback=progress_callback
                )

            if not result["success"]:
                await manager.send_message(client_id, {
                    "type": "error",
                    "error": f"Generation failed: {result.get('error')}"
                })
                return

            # Convert and send each generated image
            output_dir = Path("output")
            output_dir.mkdir(exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            for idx, img in enumerate(result["images"]):
                # Convert to base64
                buffered = io.BytesIO()
                img.save(buffered, format="PNG")
                img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
                img_data_uri = f"data:image/png;base64,{img_base64}"
                all_images.append(img_data_uri)

                # Save to disk
                filename = f"generated_{timestamp}_{len(all_images) - 1}.png"
                output_path = output_dir / filename
                img.save(output_path)
                logger.info(f"Image saved to: {output_path}")

                # Send image to client
                logger.info(f"Sending image {len(all_images) - 1} to client {client_id}")
                await manager.send_message(client_id, {
                    "type": "image",
                    "index": len(all_images) - 1,
                    "data": img_data_uri,
                    "filename": filename
                })
                logger.info(f"Image {len(all_images) - 1} sent successfully")

        # Send completion message
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
        }

        logger.info(f"Sending completion message with {len(all_images)} images")
        await manager.send_message(client_id, {
            "type": "complete",
            "success": True,
            "images": all_images,
            "metadata": metadata
        })

        logger.info(f"Generation completed: {len(all_images)} images")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {client_id}")
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for {client_id}: {e}", exc_info=True)
        try:
            await manager.send_message(client_id, {
                "type": "error",
                "error": str(e)
            })
        except:
            pass
        manager.disconnect(client_id)
