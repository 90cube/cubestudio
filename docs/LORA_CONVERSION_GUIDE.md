# LoRA Format Conversion Guide

## Executive Summary

**Good News**: Your Kohya/ComfyUI LoRAs can be loaded directly in Diffusers without conversion!

The latest Diffusers library (v0.21+) natively supports Kohya-style LoRAs through `load_lora_weights()` with the `weight_name` parameter.

## Format Detection Results

### Your LoRA Formats

1. **YHILXL-000001.safetensors** - Kohya Standard Format
   - Keys: `lora_unet_input_blocks_*`, `lora_unet_output_blocks_*`
   - Format: Standard LoRA with `lora_down.weight` and `lora_up.weight`
   - Total keys: 2,166

2. **korean idol-noob-V1.safetensors** - LyCORIS/LoHA Format
   - Keys: `lora_te1_text_model_encoder_layers_*`
   - Format: Hadamard product with `hada_w1_a`, `hada_w1_b`, `hada_w2_a`, `hada_w2_b`
   - Total keys: 5,260

## Loading Methods

### Method 1: Direct Loading (RECOMMENDED)

Diffusers natively supports Kohya LoRAs:

```python
from diffusers import StableDiffusionXLPipeline
import torch

# Load base model
pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16
).to("cuda")

# Load Kohya LoRA - Method A (Directory + Filename)
pipe.load_lora_weights(
    "models/loras/SDXL/ILXL",              # Directory path
    weight_name="YHILXL-000001.safetensors", # Filename
    adapter_name="yhilxl"                   # Unique adapter name
)

# OR Method B (Full path) - for Diffusers-native format
pipe.load_lora_weights(
    "models/loras/SDXL/ILXL/YHILXL-000001.safetensors",
    adapter_name="yhilxl"
)

# Activate with specific weight
pipe.set_adapters(["yhilxl"], adapter_weights=[0.75])
```

### Method 2: Multiple LoRAs

```python
# Load multiple LoRAs
pipe.load_lora_weights(
    "models/loras/SDXL/ILXL",
    weight_name="YHILXL-000001.safetensors",
    adapter_name="style1"
)

pipe.load_lora_weights(
    "models/loras/SDXL/NOOB",
    weight_name="korean idol-noob-V1.safetensors",
    adapter_name="character1"
)

# Activate both with different weights
pipe.set_adapters(
    ["style1", "character1"],
    adapter_weights=[0.8, 0.6]
)
```

### Method 3: Manual Conversion (Fallback)

If direct loading fails, use the conversion utility:

```python
from backend.utils.lora_converter import LoRAConverter
from pathlib import Path

# Convert LoRA
converted_dict, format_type = LoRAConverter.convert_to_diffusers(
    lora_path=Path("models/loras/SDXL/ILXL/YHILXL-000001.safetensors"),
    output_path=Path("models/loras/converted/YHILXL-diffusers.safetensors"),
    alpha=1.0
)

print(f"Converted from {format_type} format")
print(f"Output keys: {len(converted_dict)}")
```

## Key Format Mapping

### Kohya to Diffusers Key Conversion

**Text Encoder:**
- `lora_te1_text_model_encoder_layers_0_mlp_fc1`
- → `text_encoder.text_model.encoder.layers.0.mlp.fc1`

**UNet Input Blocks:**
- `lora_unet_input_blocks_4_1_proj_in`
- → `unet.down_blocks.1.attentions.1.proj_in`

**UNet Output Blocks:**
- `lora_unet_output_blocks_8_1_transformer_blocks_0_attn1_to_k`
- → `unet.up_blocks.2.attentions.2.transformer_blocks.0.attn1.to_k`

## Format Types

### 1. Kohya Standard
```
lora_unet_input_blocks_4_1_proj_in.alpha
lora_unet_input_blocks_4_1_proj_in.lora_down.weight
lora_unet_input_blocks_4_1_proj_in.lora_up.weight
```

### 2. LyCORIS/LoHA (Hadamard)
```
lora_te1_text_model_encoder_layers_0_mlp_fc1.alpha
lora_te1_text_model_encoder_layers_0_mlp_fc1.hada_w1_a
lora_te1_text_model_encoder_layers_0_mlp_fc1.hada_w1_b
lora_te1_text_model_encoder_layers_0_mlp_fc1.hada_w2_a
lora_te1_text_model_encoder_layers_0_mlp_fc1.hada_w2_b
```

**LyCORIS Conversion Formula:**
- Hadamard: `W = W0 + alpha * (hada_w1_a @ hada_w1_b) ⊙ (hada_w2_a @ hada_w2_b)`
- Approximation: `lora_down ≈ hada_w1_a * hada_w2_a`, `lora_up ≈ hada_w1_b * hada_w2_b`

### 3. Diffusers Native
```
unet.down_blocks.1.attentions.1.proj_in.lora_down.weight
unet.down_blocks.1.attentions.1.proj_in.lora_up.weight
text_encoder.text_model.encoder.layers.0.mlp.fc1.lora_down.weight
```

## Testing Strategy

### 1. Test Direct Loading
```python
# Test with your existing LoRA
from diffusers import StableDiffusionXLPipeline

pipe = StableDiffusionXLPipeline.from_pretrained(
    "path/to/checkpoint.safetensors",
    torch_dtype=torch.float16
).to("cuda")

# Try direct load
try:
    pipe.load_lora_weights(
        "models/loras/SDXL/ILXL",
        weight_name="YHILXL-000001.safetensors",
        adapter_name="test"
    )
    print("✓ Direct loading works!")
except Exception as e:
    print(f"✗ Direct loading failed: {e}")
```

### 2. Find Diffusers-Native LoRA
```python
# Download a Diffusers-trained LoRA for testing
from huggingface_hub import hf_hub_download

lora_path = hf_hub_download(
    repo_id="ostris/super-cereal-sdxl-lora",
    filename="cereal_box_sdxl_v1.safetensors"
)

pipe.load_lora_weights(lora_path)
```

### 3. Compare Key Structures
```python
from safetensors.torch import load_file

# Your Kohya LoRA
kohya_state = load_file("models/loras/SDXL/ILXL/YHILXL-000001.safetensors")
print("Kohya keys:", list(kohya_state.keys())[:5])

# Diffusers LoRA
diffusers_state = load_file(lora_path)
print("Diffusers keys:", list(diffusers_state.keys())[:5])
```

## Current Implementation Status

### Working Code (sd_pipeline_service.py)
```python
# Lines 272-286 - Current implementation
self.txt2img_pipe.load_lora_weights(
    str(full_lora_path.parent),  # Directory path
    weight_name=full_lora_path.name,  # Filename
    adapter_name=full_lora_path.stem
)
```

### Issue Found
Line 279 has error handling that may hide the real issue. The alternate loading method at line 282 should work but needs proper error logging.

### Recommended Fix
```python
try:
    # Primary method: Directory + weight_name (for Kohya)
    self.txt2img_pipe.load_lora_weights(
        str(full_lora_path.parent),
        weight_name=full_lora_path.name,
        adapter_name=full_lora_path.stem
    )
    logger.info(f"✓ Loaded Kohya LoRA: {full_lora_path.stem}")

except Exception as e1:
    logger.warning(f"Primary method failed: {e1}")
    try:
        # Fallback method: Full path (for Diffusers-native)
        self.txt2img_pipe.load_lora_weights(
            str(full_lora_path),
            adapter_name=full_lora_path.stem
        )
        logger.info(f"✓ Loaded Diffusers LoRA: {full_lora_path.stem}")

    except Exception as e2:
        logger.error(f"Both methods failed for {full_lora_path.name}")
        logger.error(f"  Method 1: {e1}")
        logger.error(f"  Method 2: {e2}")
        raise RuntimeError(f"Failed to load LoRA: {full_lora_path.name}") from e2
```

## Conversion Utility Usage

### CLI Conversion
```bash
# Convert single LoRA
python backend/utils/lora_converter.py \
    models/loras/SDXL/ILXL/YHILXL-000001.safetensors \
    models/loras/converted/YHILXL-diffusers.safetensors \
    --alpha 1.0

# Convert LyCORIS with custom alpha
python backend/utils/lora_converter.py \
    models/loras/SDXL/NOOB/korean-idol-noob-V1.safetensors \
    models/loras/converted/korean-idol-diffusers.safetensors \
    --alpha 0.75
```

### Programmatic Conversion
```python
from backend.utils.lora_converter import LoRAConverter
from pathlib import Path

# Batch convert all LoRAs in a directory
lora_dir = Path("models/loras/SDXL/ILXL")
output_dir = Path("models/loras/converted")
output_dir.mkdir(exist_ok=True)

for lora_file in lora_dir.glob("*.safetensors"):
    converted, format_type = LoRAConverter.convert_to_diffusers(
        lora_path=lora_file,
        output_path=output_dir / f"{lora_file.stem}_diffusers.safetensors",
        alpha=1.0
    )
    print(f"Converted {lora_file.name} ({format_type}) -> {len(converted)} keys")
```

## Performance Considerations

### Memory Usage
- **Kohya Standard**: ~2-5 MB per LoRA (rank 32-128)
- **LyCORIS/LoHA**: ~5-10 MB per LoRA (more weights)
- **Multiple LoRAs**: Memory adds up linearly

### Loading Time
- **Direct Load**: 0.5-2 seconds per LoRA
- **Conversion**: 2-5 seconds per LoRA
- **Fusing**: 5-10 seconds (merges into base model)

### Best Practices
1. Load LoRAs in order of importance (style → character → detail)
2. Use `fuse_lora()` for faster inference (permanent merge)
3. Keep weights between 0.5-1.0 for stability
4. Unload unnecessary LoRAs to save memory

## References

### Official Documentation
- [Diffusers LoRA Loading](https://huggingface.co/docs/diffusers/using-diffusers/loading_adapters)
- [Diffusers LoRA Training](https://huggingface.co/docs/diffusers/training/lora)

### Conversion Scripts
- [Official Diffusers Converter](https://github.com/huggingface/diffusers/blob/main/scripts/convert_lora_safetensor_to_diffusers.py)
- [ComfyUI Converter](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/diffusers_convert.py)

### Community Resources
- [Using CivitAI LoRAs with Diffusers](https://medium.com/@natsunoyuki/using-civitai-loras-with-diffusers-e3ef3e47c413)
- [Kohya-style LoRA Support](https://github.com/huggingface/diffusers/issues/4348)

## Troubleshooting

### Common Issues

**Issue 1: "Invalid LoRA checkpoint"**
- Cause: Calling `unload_lora_weights()` between loads
- Solution: Only unload when completely changing pipeline

**Issue 2: Keys not found**
- Cause: Wrong format detection
- Solution: Use conversion utility to standardize format

**Issue 3: LyCORIS not working**
- Cause: Hadamard product not supported natively
- Solution: Convert to standard LoRA format first

**Issue 4: Multiple LoRAs conflict**
- Cause: Overlapping adapter names
- Solution: Use unique `adapter_name` for each LoRA

### Debug Checklist
- [ ] Check Diffusers version ≥0.21.0
- [ ] Verify LoRA file exists and is readable
- [ ] Inspect LoRA keys with safetensors
- [ ] Test with known working LoRA
- [ ] Check pipeline is properly initialized
- [ ] Review error logs for specific failures
