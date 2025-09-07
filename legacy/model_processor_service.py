#!/usr/bin/env python3
"""
CUBE Studio - New Model Processor Service (Renewal Architecture)
- Direct PyTorch implementation for loading local preprocessor models.
"""

import os
import base64
import io
from pathlib import Path
from typing import Dict, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
import numpy as np
import torch
import torch.nn.functional as F
from torchvision.transforms import Compose, Resize, ToTensor, Normalize

# --- Configuration ---
SERVICE_PORT = 9002
MODELS_PREPROCESSORS_PATH = Path("models") / "preprocessors"

# --- Pydantic Models for API Schema ---

class ModelProcessingRequest(BaseModel):
    model_id: str
    image_base64: str
    params: Optional[Dict] = None

class ModelProcessingResponse(BaseModel):
    success: bool
    image_base64: Optional[str] = None
    model_used: str
    message: Optional[str] = None

# --- FastAPI App Initialization ---

app = FastAPI(
    title="CUBE Studio - Local Model Processor Service",
    version="2.2.0",
    description="Directly loads and processes local models using PyTorch.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Model & Image Processing Logic ---

# Cache for loaded models to avoid reloading
MODEL_CACHE = {}

def get_model(model_name: str):
    """Loads a model from the local path into cache or gets it from cache."""
    if model_name in MODEL_CACHE:
        print(f"Loading {model_name} from cache.")
        return MODEL_CACHE[model_name]

    model_path = MODELS_PREPROCESSORS_PATH / model_name
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found at {model_path}")

    print(f"Loading {model_name} from disk...")
    # Load model onto CPU. Change to 'cuda' if GPU is available and configured.
    model = torch.load(model_path, map_location="cpu")
    model.eval()
    MODEL_CACHE[model_name] = model
    print(f"{model_name} loaded successfully.")
    return model

def decode_base64_to_image(base64_string: str) -> Image.Image:
    if "base64," in base64_string:
        base64_string = base64_string.split("base64,")[1]
    image_bytes = base64.b64decode(base64_string)
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")

def encode_image_to_base64(image: Image.Image) -> str:
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

def process_depth_map(image: Image.Image, model_name: str) -> Image.Image:
    """Processes an image to create a depth map using a loaded MiDaS model."""
    model = get_model(model_name)
    
    # MiDaS DPT models have a specific transform
    transform = Compose([
        Resize((384, 384)),
        ToTensor(),
        Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
    ])

    original_width, original_height = image.size
    transformed_image = transform(image).unsqueeze(0)

    with torch.no_grad():
        prediction = model(transformed_image)
        prediction = F.interpolate(
            prediction.unsqueeze(1),
            size=(original_height, original_width),
            mode="bicubic",
            align_corners=False,
        ).squeeze()

    output_numpy = prediction.cpu().numpy()
    
    # Normalize output to 0-255 for visualization
    output_normalized = (output_numpy - np.min(output_numpy)) / (np.max(output_numpy) - np.min(output_numpy))
    output_image = Image.fromarray((output_normalized * 255.0).astype(np.uint8))

    return output_image

# --- API Endpoints ---

@app.get("/")
def root():
    return {"message": "CUBE Studio Local Model Processor Service is running."}

@app.post("/api/v2/process", response_model=ModelProcessingResponse)
async def process_image_request(req: ModelProcessingRequest):
    # Map frontend model_id to actual local filenames
    # This is where you hard-code the models you want to use.
    model_file_map = {
        "dpt_hybrid": "dpt_hybrid-midas-501f0c75.pt",
        "midas_v21": "midas_v21_384.pt",
        "zoedepth": "ZoeD_M12_N.pt",
        # Add other mappings here, e.g., "hed": "res101.pth"
    }

    model_filename = model_file_map.get(req.model_id)
    if not model_filename:
        raise HTTPException(status_code=404, detail=f"Model ID '{req.model_id}' is not configured in the backend.")

    try:
        input_image = decode_base64_to_image(req.image_base64)
        
        # Here you could add routing for different processor types if needed
        # For now, we assume all requests are for depth maps.
        output_image = process_depth_map(input_image, model_filename)
        
        output_base64 = encode_image_to_base64(output_image)

        return ModelProcessingResponse(
            success=True,
            image_base64=output_base64,
            model_used=req.model_id,
            message=f"Processing complete with local model: {model_filename}"
        )

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        return ModelProcessingResponse(
            success=False,
            model_used=req.model_id,
            message=f"An error occurred: {str(e)}"
        )

# --- Main Execution ---

if __name__ == "__main__":
    print("--- CUBE Studio: Local Model Processor Service ---")
    print(f"Starting server on http://localhost:{SERVICE_PORT}")
    print(f"Watching for models in: {MODELS_PREPROCESSORS_PATH.absolute()}")
    print("API docs available at http://localhost:9002/docs")
    
    uvicorn.run(
        "model_processor_service:app",
        host="0.0.0.0",
        port=SERVICE_PORT,
        reload=True,
        log_level="info"
    )