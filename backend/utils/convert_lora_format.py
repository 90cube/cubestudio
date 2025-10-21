"""
LoRA Format Converter - ComfyUI to Kohya/Diffusers format
"""

import sys
from pathlib import Path
from safetensors.torch import load_file, save_file
import torch

def convert_comfyui_to_kohya(input_path: str, output_path: str = None):
    """
    Convert ComfyUI format LoRA to Kohya format compatible with Diffusers

    ComfyUI format: diffusion_model.input_blocks.0.0.lora_down.weight
    Kohya format: lora_unet_down_blocks_0_resnets_0_lora_down.weight
    """
    input_file = Path(input_path)

    if output_path is None:
        output_path = input_file.parent / f"{input_file.stem}_kohya.safetensors"

    print(f"Loading ComfyUI LoRA: {input_file}")
    state_dict = load_file(str(input_file))

    converted_dict = {}
    skipped_keys = []

    for key, value in state_dict.items():
        # Skip non-LoRA parameters (alpha, diff, etc.)
        if 'lora_down' not in key and 'lora_up' not in key:
            skipped_keys.append(key)
            continue

        # Convert ComfyUI key to Kohya format
        new_key = key.replace('diffusion_model.', 'lora_unet_')

        # Map block names
        new_key = new_key.replace('input_blocks', 'down_blocks')
        new_key = new_key.replace('middle_block', 'mid_block')
        new_key = new_key.replace('output_blocks', 'up_blocks')

        # Convert dot notation to underscore for compatibility
        parts = new_key.split('.')
        if len(parts) > 1:
            # Join module path with underscores, keep weight/bias at the end
            module_path = '_'.join(parts[:-1])
            param_type = parts[-1]
            new_key = f"{module_path}.{param_type}"

        converted_dict[new_key] = value

    print(f"Converted {len(converted_dict)} keys (skipped {len(skipped_keys)} non-LoRA keys)")

    # Save converted LoRA
    print(f"Saving Kohya format LoRA: {output_path}")
    save_file(converted_dict, str(output_path))
    print(f"✅ Conversion complete!")

    return str(output_path)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python convert_lora_format.py <input_lora.safetensors> [output_lora.safetensors]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    convert_comfyui_to_kohya(input_path, output_path)
