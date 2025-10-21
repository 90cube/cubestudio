# LoRA Format Quick Reference

## TL;DR

**Problem**: ComfyUI LoRA has 1,680 keys (51.4%) without "lora" substring → Diffusers validation fails

**Root Cause**:
```python
# diffusers/loaders/lora.py:73-75
is_correct_format = all("lora" in key for key in state_dict.keys())
if not is_correct_format:
    raise ValueError("Invalid LoRA checkpoint.")  # ← FAILS HERE
```

**Failed Keys Examples**:
- `diffusion_model.input_blocks.0.0.alpha` ❌
- `diffusion_model.input_blocks.0.0.diff_b` ❌

---

## Format Comparison

| Aspect | ComfyUI Format | Diffusers Format |
|--------|---------------|------------------|
| **Prefix** | `diffusion_model.*` | `lora_unet_*` / `lora_te_*` |
| **Blocks** | `input_blocks`, `middle_block`, `output_blocks` | `down_blocks`, `mid_block`, `up_blocks` |
| **Validation** | ❌ 51.4% keys fail | ✅ All keys pass |
| **Extra Params** | `alpha`, `diff`, `diff_b` | Only `alpha` supported |
| **Extended LoRA** | ✅ LoCon, LoHa support | ❌ Not supported |

---

## Key Mapping

```
ComfyUI:  diffusion_model.input_blocks.0.0.lora_down.weight
          └─────┬──────┘ └────┬─────┘
                │             │
Diffusers: lora_unet_down_blocks_0_resnets_0.lora_down.weight
           └─────┬─────┘ └────┬──────┘
                 │             │
         Required prefix   Converted block
```

---

## Solutions

### 1. ComfyUI Backend (Recommended)
```python
from comfy.sd import load_lora_for_models
lora_model = load_lora_for_models(model, clip, lora_path, strength)
```
**Pros**: Native support, no conversion loss
**Cons**: Requires ComfyUI integration

---

### 2. Format Converter
```python
def convert_comfyui_to_diffusers(state_dict):
    new_dict = {}
    for key, value in state_dict.items():
        if 'lora_down' not in key and 'lora_up' not in key:
            continue  # Skip alpha, diff, diff_b

        new_key = (key
            .replace('diffusion_model.', 'lora_unet_')
            .replace('input_blocks', 'down_blocks')
            .replace('middle_block', 'mid_block')
            .replace('output_blocks', 'up_blocks'))

        new_dict[new_key] = value

    return new_dict
```
**Pros**: Diffusers compatibility
**Cons**: May lose extended features

---

### 3. Monkey Patch Diffusers
```python
original_load = LoraLoaderMixin.load_lora_weights

def patched_load(self, path, **kwargs):
    state_dict = sf.load_file(path)
    if any('diffusion_model' in k for k in state_dict.keys()):
        state_dict = convert_comfyui_to_diffusers(state_dict)
        return original_load(self, state_dict, **kwargs)
    return original_load(self, path, **kwargs)

LoraLoaderMixin.load_lora_weights = patched_load
```
**Pros**: Works with existing code
**Cons**: Monkey-patching risks

---

## Detection Script

```python
import safetensors.torch as sf

def detect_lora_format(lora_path):
    state_dict = sf.load_file(lora_path)

    has_diffusion_model = any('diffusion_model' in k for k in state_dict.keys())
    has_lora_prefix = any(k.startswith(('lora_unet_', 'lora_te_')) for k in state_dict.keys())
    is_valid = all("lora" in key for key in state_dict.keys())

    if has_diffusion_model:
        return "ComfyUI/Kohya/A1111", is_valid
    elif has_lora_prefix:
        return "Diffusers", is_valid
    else:
        return "Unknown", is_valid

format_type, passes_validation = detect_lora_format("lora.safetensors")
print(f"Format: {format_type}")
print(f"Diffusers validation: {'PASS' if passes_validation else 'FAIL'}")
```

---

## Current Backend Status

**Location**: `backend/services/sd_pipeline_service.py:272-286`

**Current Implementation**:
```python
try:
    # Method 1: Directory + weight_name
    self.txt2img_pipe.load_lora_weights(
        str(full_lora_path.parent),
        weight_name=full_lora_path.name,
        adapter_name=full_lora_path.stem
    )
except:
    # Method 2: Full path
    self.txt2img_pipe.load_lora_weights(
        str(full_lora_path),
        adapter_name=full_lora_path.stem
    )
```

**Issue**: Both methods hit same validation → Both fail for ComfyUI format

---

## Extended LoRA Variants

| Variant | Parameters | Diffusers Support |
|---------|-----------|-------------------|
| **Standard LoRA** | `lora_down`, `lora_up`, `alpha` | ✅ Yes |
| **DoRA** | `+ dora_scale` | ⚠️ Experimental |
| **LoCon** | `+ diff`, `diff_b` (conv) | ❌ No |
| **LoHa** | `+ diff`, `diff_b` (hadamard) | ❌ No |

**Detection**: Presence of `diff`/`diff_b` indicates extended variant

---

## References

- **Analysis**: `LORA_FORMAT_ANALYSIS.md` (full details)
- **Diffusers Code**: `diffusers/loaders/lora.py:73-75`
- **Converter**: `diffusers/loaders/lora_conversion_utils.py`
