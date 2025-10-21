"""
LoRA Format Converter for SDXL
Converts Kohya/ComfyUI format LoRAs to Diffusers-compatible format
"""

import torch
from safetensors.torch import load_file, save_file
from pathlib import Path
from typing import Dict, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class LoRAConverter:
    """Converts LoRA weights between different formats"""

    # Kohya to Diffusers key mapping for SDXL
    UNET_KEY_MAPPING = {
        # Input blocks
        "lora_unet_input_blocks": "down_blocks",
        # Middle block
        "lora_unet_middle_block": "mid_block",
        # Output blocks
        "lora_unet_output_blocks": "up_blocks",
        # Time embedding
        "lora_unet_time_embed": "time_embedding",
    }

    TEXT_ENCODER_MAPPING = {
        "lora_te1_text_model": "text_encoder",
        "lora_te2_text_model": "text_encoder_2",
    }

    @staticmethod
    def detect_lora_format(state_dict: Dict[str, torch.Tensor]) -> str:
        """
        Detect LoRA format from keys

        Returns:
            - 'kohya': Kohya/ComfyUI format (lora_unet_, lora_te_)
            - 'diffusers': Diffusers format (unet., text_encoder.)
            - 'lycoris': LyCORIS format (hada_w1_a, hada_w1_b)
            - 'comfyui': ComfyUI diffusion_model format (incompatible with Diffusers)
            - 'unknown': Unknown format
        """
        keys = list(state_dict.keys())

        if not keys:
            return 'unknown'

        first_key = keys[0]

        # Check for ComfyUI diffusion_model format (BEFORE other checks)
        # This is the most common incompatible format
        if 'diffusion_model.' in first_key:
            return 'comfyui'

        # Check for LyCORIS/LoHA format
        if any('hada_w1_a' in k or 'hada_w1_b' in k for k in keys[:10]):
            return 'lycoris'

        # Check for Kohya format
        if first_key.startswith('lora_unet_') or first_key.startswith('lora_te'):
            return 'kohya'

        # Check for Diffusers format
        if 'unet.' in first_key or 'text_encoder.' in first_key:
            return 'diffusers'

        return 'unknown'

    @staticmethod
    def convert_comfyui_to_diffusers_key(key: str) -> Optional[str]:
        """
        Convert ComfyUI diffusion_model format to Diffusers format

        ComfyUI format: diffusion_model.input_blocks.0.0.lora_down.weight
        Diffusers format: lora_unet_down_blocks_0_resnets_0.lora_down.weight
        """
        # Skip keys without lora (alpha, diff, diff_b fail Diffusers validation)
        if 'lora_down' not in key and 'lora_up' not in key:
            logger.debug(f"Skipping non-LoRA key: {key}")
            return None

        # Convert diffusion_model → lora_unet
        new_key = key.replace('diffusion_model.', 'lora_unet_')

        # Map SGM blocks to Diffusers blocks
        new_key = new_key.replace('input_blocks', 'down_blocks')
        new_key = new_key.replace('middle_block', 'mid_block')
        new_key = new_key.replace('output_blocks', 'up_blocks')
        new_key = new_key.replace('time_embed', 'time_embedding')
        new_key = new_key.replace('label_emb', 'add_embedding')

        # Replace dots with underscores (except for lora_down/lora_up)
        # lora_unet_down_blocks.0.0.lora_down.weight → lora_unet_down_blocks_0_0.lora_down.weight
        parts = new_key.split('.lora_')
        if len(parts) == 2:
            base_part = parts[0].replace('.', '_')
            lora_part = 'lora_' + parts[1]
            new_key = base_part + '.' + lora_part

        logger.debug(f"Converted: {key} → {new_key}")
        return new_key

    @staticmethod
    def convert_kohya_to_diffusers_key(key: str) -> Optional[str]:
        """Convert Kohya-style key to Diffusers-style key"""

        # Handle text encoders
        if key.startswith('lora_te1_'):
            new_key = key.replace('lora_te1_', 'text_encoder.')
            # Fix layer naming
            new_key = new_key.replace('text_model_encoder_layers_', 'text_model.encoder.layers.')
            new_key = new_key.replace('_', '.')
            return new_key

        if key.startswith('lora_te2_'):
            new_key = key.replace('lora_te2_', 'text_encoder_2.')
            new_key = new_key.replace('text_model_encoder_layers_', 'text_model.encoder.layers.')
            new_key = new_key.replace('_', '.')
            return new_key

        # Handle UNet
        if key.startswith('lora_unet_'):
            new_key = key.replace('lora_unet_', 'unet.')

            # Convert block naming
            if 'input_blocks' in new_key:
                # input_blocks_4_1 -> down_blocks.0.attentions.1
                parts = new_key.split('_')
                try:
                    block_idx = int(parts[parts.index('blocks') + 1])
                    sub_idx = int(parts[parts.index('blocks') + 2]) if len(parts) > parts.index('blocks') + 2 else 0

                    # Map to down_blocks
                    down_block = block_idx // 3
                    attn_idx = block_idx % 3

                    new_key = new_key.replace(f'input_blocks_{block_idx}_{sub_idx}',
                                             f'down_blocks.{down_block}.attentions.{attn_idx}')
                except (ValueError, IndexError):
                    pass

            elif 'middle_block' in new_key:
                new_key = new_key.replace('middle_block', 'mid_block')

            elif 'output_blocks' in new_key:
                # Similar conversion for output_blocks -> up_blocks
                parts = new_key.split('_')
                try:
                    block_idx = int(parts[parts.index('blocks') + 1])
                    sub_idx = int(parts[parts.index('blocks') + 2]) if len(parts) > parts.index('blocks') + 2 else 0

                    up_block = block_idx // 3
                    attn_idx = block_idx % 3

                    new_key = new_key.replace(f'output_blocks_{block_idx}_{sub_idx}',
                                             f'up_blocks.{up_block}.attentions.{attn_idx}')
                except (ValueError, IndexError):
                    pass

            # Replace underscores with dots (but preserve lora_down, lora_up)
            parts = new_key.split('.')
            for i, part in enumerate(parts):
                if '_' in part and 'lora_' not in part:
                    parts[i] = part.replace('_', '.')
            new_key = '.'.join(parts)

            return new_key

        return None

    @staticmethod
    def convert_lycoris_to_standard(state_dict: Dict[str, torch.Tensor],
                                    alpha: float = 1.0) -> Dict[str, torch.Tensor]:
        """
        Convert LyCORIS/LoHA format to standard LoRA format

        LyCORIS uses hadamard product: W = W0 + alpha * (hada_w1_a @ hada_w1_b) ⊙ (hada_w2_a @ hada_w2_b)
        Standard LoRA: W = W0 + alpha * (lora_up @ lora_down)

        This is an approximation that combines the hadamard components
        """
        converted = {}
        processed_keys = set()

        for key in state_dict.keys():
            if key in processed_keys or '.alpha' in key:
                continue

            base_key = key.rsplit('.', 1)[0]

            # Check if this is a LyCORIS layer
            if f'{base_key}.hada_w1_a' in state_dict:
                # Get all hadamard components
                w1_a = state_dict.get(f'{base_key}.hada_w1_a')
                w1_b = state_dict.get(f'{base_key}.hada_w1_b')
                w2_a = state_dict.get(f'{base_key}.hada_w2_a')
                w2_b = state_dict.get(f'{base_key}.hada_w2_b')

                if all(x is not None for x in [w1_a, w1_b, w2_a, w2_b]):
                    # Combine hadamard products into standard LoRA
                    # This is an approximation: (A@B) ⊙ (C@D) ≈ (A⊙C) @ (B⊙D)
                    try:
                        # For 2D tensors
                        if w1_a.dim() == 2:
                            lora_down = w1_a * w2_a  # Element-wise product
                            lora_up = w1_b * w2_b
                        # For 4D conv tensors
                        else:
                            lora_down = w1_a * w2_a
                            lora_up = w1_b * w2_b

                        converted[f'{base_key}.lora_down.weight'] = lora_down
                        converted[f'{base_key}.lora_up.weight'] = lora_up

                        # Copy alpha if exists
                        if f'{base_key}.alpha' in state_dict:
                            converted[f'{base_key}.alpha'] = state_dict[f'{base_key}.alpha']

                        # Mark as processed
                        processed_keys.update([
                            f'{base_key}.hada_w1_a',
                            f'{base_key}.hada_w1_b',
                            f'{base_key}.hada_w2_a',
                            f'{base_key}.hada_w2_b',
                        ])
                    except Exception as e:
                        logger.warning(f"Failed to convert LyCORIS layer {base_key}: {e}")
                        continue

            # Copy non-LyCORIS keys as-is
            elif key not in processed_keys:
                converted[key] = state_dict[key]

        return converted

    @classmethod
    def convert_to_diffusers(cls,
                           lora_path: Path,
                           output_path: Optional[Path] = None,
                           alpha: float = 1.0) -> Tuple[Dict[str, torch.Tensor], str]:
        """
        Convert LoRA to Diffusers format

        Args:
            lora_path: Path to input LoRA file
            output_path: Optional path to save converted LoRA
            alpha: Alpha value for LyCORIS conversion

        Returns:
            Tuple of (converted_state_dict, format_detected)
        """
        logger.info(f"Loading LoRA from {lora_path}")
        state_dict = load_file(lora_path)

        # Detect format
        format_type = cls.detect_lora_format(state_dict)
        logger.info(f"Detected format: {format_type}")

        # Convert based on format
        if format_type == 'diffusers':
            logger.info("Already in Diffusers format")
            converted = state_dict

        elif format_type == 'comfyui':
            logger.info("Converting ComfyUI diffusion_model format to Diffusers")
            converted = {}
            skipped_keys = []
            for key, value in state_dict.items():
                new_key = cls.convert_comfyui_to_diffusers_key(key)
                if new_key:
                    converted[new_key] = value
                else:
                    skipped_keys.append(key)

            logger.info(f"Converted {len(converted)} keys, skipped {len(skipped_keys)} non-LoRA keys")
            if skipped_keys:
                logger.debug(f"Skipped keys (first 10): {skipped_keys[:10]}")

        elif format_type == 'lycoris':
            logger.info("Converting LyCORIS to standard LoRA format")
            converted = cls.convert_lycoris_to_standard(state_dict, alpha)
            # Then convert keys
            final_converted = {}
            for key, value in converted.items():
                new_key = cls.convert_kohya_to_diffusers_key(key)
                if new_key:
                    final_converted[new_key] = value
                else:
                    final_converted[key] = value
            converted = final_converted

        elif format_type == 'kohya':
            logger.info("Converting Kohya format to Diffusers")
            converted = {}
            for key, value in state_dict.items():
                new_key = cls.convert_kohya_to_diffusers_key(key)
                if new_key:
                    converted[new_key] = value
                else:
                    converted[key] = value

        else:
            logger.warning(f"Unknown format, returning original state dict")
            converted = state_dict

        # Save if output path provided
        if output_path:
            logger.info(f"Saving converted LoRA to {output_path}")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            save_file(converted, str(output_path))

        return converted, format_type

    @staticmethod
    def apply_lora_to_pipeline(pipeline,
                              lora_state_dict: Dict[str, torch.Tensor],
                              alpha: float = 0.75,
                              adapter_name: str = "default"):
        """
        Apply LoRA weights directly to a pipeline

        This is a fallback method when load_lora_weights doesn't work
        """
        # Separate UNet and text encoder weights
        unet_lora = {}
        te_lora = {}
        te2_lora = {}

        for key, value in lora_state_dict.items():
            if 'text_encoder_2.' in key:
                te2_lora[key.replace('text_encoder_2.', '')] = value
            elif 'text_encoder.' in key:
                te_lora[key.replace('text_encoder.', '')] = value
            elif 'unet.' in key:
                unet_lora[key.replace('unet.', '')] = value

        logger.info(f"UNet LoRA keys: {len(unet_lora)}")
        logger.info(f"Text Encoder 1 LoRA keys: {len(te_lora)}")
        logger.info(f"Text Encoder 2 LoRA keys: {len(te2_lora)}")

        # Apply to pipeline components
        # This would require implementing the actual LoRA application logic
        # For now, this is a placeholder for the structure

        raise NotImplementedError("Direct LoRA application not yet implemented")


def convert_lora_cli():
    """Command-line interface for LoRA conversion"""
    import argparse

    parser = argparse.ArgumentParser(description="Convert LoRA formats")
    parser.add_argument("input", type=Path, help="Input LoRA file")
    parser.add_argument("output", type=Path, help="Output LoRA file")
    parser.add_argument("--alpha", type=float, default=1.0, help="Alpha value for LyCORIS conversion")

    args = parser.parse_args()

    converted, format_type = LoRAConverter.convert_to_diffusers(
        args.input,
        args.output,
        args.alpha
    )

    print(f"Conversion complete!")
    print(f"Input format: {format_type}")
    print(f"Output keys: {len(converted)}")
    print(f"Saved to: {args.output}")


if __name__ == "__main__":
    convert_lora_cli()
