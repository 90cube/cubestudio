# LoRA Format Compatibility Analysis
## ComfyUI vs Diffusers Format Differences

**Generated**: 2025-10-06
**File Analyzed**: `ILXL_YH_Style_DNF.safetensors`

---

## 1. Executive Summary

**Root Cause**: The LoRA file is in **ComfyUI/Kohya/A1111 format** (SGM-based), which is **incompatible** with Diffusers library's validation requirements.

**Key Finding**: Diffusers validation checks that ALL keys contain the substring `"lora"`, but ComfyUI format has 1,680 keys (51.4%) that fail this check, including:
- `diffusion_model.input_blocks.0.0.alpha`
- `diffusion_model.input_blocks.0.0.diff_b`
- All `*.diff` and `*.diff_b` parameters

**Impact**: `load_lora_weights()` raises `ValueError("Invalid LoRA checkpoint")` at validation stage, **before** any conversion logic runs.

---

## 2. Format Identification

### File Structure
```
File: ILXL_YH_Style_DNF.safetensors
Format: ComfyUI/Kohya/A1111 (SGM-based)
Total Keys: 3,268
```

### Key Distribution
| Category | Count | Percentage | Contains "lora" |
|----------|-------|------------|-----------------|
| LoRA weights | 1,588 | 48.6% | ✅ Yes |
| Alpha/Diff params | 1,680 | 51.4% | ❌ No |

### Key Structure Breakdown
```
diffusion_model.input_blocks.X.Y.component
├── lora_down.weight     ✅ Contains "lora"
├── lora_up.weight       ✅ Contains "lora"
├── alpha                ❌ Missing "lora"
├── diff                 ❌ Missing "lora"
└── diff_b               ❌ Missing "lora"
```

**Block Types** (SGM Format):
- `input_blocks` (0-8) → Down blocks
- `middle_block` (0-2) → Mid block
- `output_blocks` (0-8) → Up blocks

---

## 3. Diffusers Expected Format

### Valid Formats

Diffusers accepts **two** LoRA formats:

#### A) Native Diffusers Format
```
lora_unet_down_blocks_0_resnets_0_conv1.lora_down.weight
lora_unet_down_blocks_0_resnets_0_conv1.lora_up.weight
lora_te_text_model_encoder_layers_0_self_attn_q_proj.lora_down.weight
```

**Requirements**:
- Prefix: `lora_unet_*` (UNet layers) or `lora_te_*` / `lora_te1_*` / `lora_te2_*` (Text Encoders)
- ALL keys must contain substring `"lora"`

#### B) Legacy Format (with auto-conversion)
```
lora_unet_input_blocks_0_0_conv1.lora_down.weight
lora_unet_input_blocks_0_0_conv1.alpha
```

**Requirements**:
- Prefix: `lora_unet_*` or `lora_te_*`
- SGM blocks (`input_blocks`, `middle_block`, `output_blocks`) will be auto-converted to Diffusers blocks
- ALL keys must contain `"lora"`

---

## 4. Validation Failure Analysis

### Failure Location
**File**: `diffusers/loaders/lora.py`
**Lines**: 73-75

```python
is_correct_format = all("lora" in key for key in state_dict.keys())
if not is_correct_format:
    raise ValueError("Invalid LoRA checkpoint.")
```

### Why ComfyUI Format Fails

**Step-by-step breakdown**:
1. LoRA file loaded: 3,268 keys
2. Validation check: `all("lora" in key for key in state_dict.keys())`
3. Result: **FALSE** (1,680 keys don't contain "lora")
4. Raises: `ValueError("Invalid LoRA checkpoint")`
5. **Conversion logic never reached** ❌

### Keys That Fail Validation
```
diffusion_model.input_blocks.0.0.alpha          ❌ No "lora"
diffusion_model.input_blocks.0.0.diff_b         ❌ No "lora"
diffusion_model.input_blocks.1.0.in_layers.0.diff  ❌ No "lora"
diffusion_model.input_blocks.1.0.out_layers.0.diff_b  ❌ No "lora"
...and 1,676 more similar keys
```

---

## 5. Format Incompatibility Issues

### Issue 1: Missing `lora_unet_` Prefix
```
❌ ComfyUI:  diffusion_model.input_blocks.0.0.lora_down.weight
✅ Diffusers: lora_unet_down_blocks_0_resnets_0_conv1.lora_down.weight
```

### Issue 2: Non-LoRA Parameter Keys
ComfyUI format includes additional parameters:
- **`alpha`**: LoRA scaling factor (rank/dimension related)
- **`diff_b`**: Bias differences (bias adaptation)
- **`diff`**: Weight differences (extended LoRA variants like LoCon/LoHa)

These parameters **do not** contain `"lora"` substring → Validation fails.

### Issue 3: Conversion Logic Never Reached
Diffusers has conversion functions:
- `_convert_non_diffusers_lora_to_diffusers()` - Converts `lora_unet_*` to Diffusers format
- `_maybe_map_sgm_blocks_to_diffusers()` - Maps SGM blocks to Diffusers blocks

**Problem**: Both functions require keys to **already** have `lora_unet_` prefix and pass validation.

---

## 6. Key Mapping Reference

### Block Structure Mapping
| ComfyUI (SGM) | Diffusers | Description |
|--------------|-----------|-------------|
| `diffusion_model.input_blocks` | `lora_unet_down_blocks` | Encoder (downsampling) |
| `diffusion_model.middle_block` | `lora_unet_mid_block` | Bottleneck (latent) |
| `diffusion_model.output_blocks` | `lora_unet_up_blocks` | Decoder (upsampling) |
| `diffusion_model.time_embed` | `lora_unet_time_embedding` | Timestep embedding |
| `diffusion_model.label_emb` | `lora_unet_add_embedding` | Conditional embedding |

### Component Mapping
| ComfyUI Component | Diffusers Component | Notes |
|------------------|---------------------|-------|
| `.lora_down.weight` | `.lora_down.weight` | LoRA down-projection |
| `.lora_up.weight` | `.lora_up.weight` | LoRA up-projection |
| `.alpha` | `.alpha` | Scaling factor |
| `.diff_b` | **Unknown** | Bias adaptation (extended LoRA) |
| `.diff` | **Unknown** | Weight adaptation (extended LoRA) |

---

## 7. Current Backend Implementation

**File**: `backend/services/sd_pipeline_service.py:272-286`

```python
try:
    self.txt2img_pipe.load_lora_weights(
        str(full_lora_path.parent),  # Directory path
        weight_name=full_lora_path.name,  # Filename
        adapter_name=full_lora_path.stem
    )
except Exception as e:
    # Fallback: Try full path (Diffusers-native format)
    self.txt2img_pipe.load_lora_weights(
        str(full_lora_path),
        adapter_name=full_lora_path.stem
    )
```

**Issue**: Both methods call the same validation logic → Both fail for ComfyUI format.

---

## 8. Solutions

### ✅ **Option 1: Use ComfyUI Backend (RECOMMENDED)**
Load LoRA using ComfyUI's native loader:
- **Pros**: Native support, no conversion needed, handles all LoRA variants (LoCon, LoHa, etc.)
- **Cons**: Requires ComfyUI integration, different API

**Implementation**:
```python
# Use ComfyUI LoRA loader
from comfy.sd import load_lora_for_models
lora_model = load_lora_for_models(model, clip, lora_path, strength)
```

---

### ✅ **Option 2: Create Format Converter**
Convert ComfyUI → Diffusers format:

```python
def convert_comfyui_lora_to_diffusers(state_dict):
    """Convert ComfyUI/Kohya format to Diffusers format"""
    new_state_dict = {}

    for key, value in state_dict.items():
        # Skip non-lora parameters for now (alpha, diff, diff_b)
        if 'lora_down' not in key and 'lora_up' not in key:
            continue

        # Convert prefix: diffusion_model → lora_unet
        new_key = key.replace('diffusion_model.', 'lora_unet_')

        # Map SGM blocks to Diffusers blocks
        new_key = new_key.replace('input_blocks', 'down_blocks')
        new_key = new_key.replace('middle_block', 'mid_block')
        new_key = new_key.replace('output_blocks', 'up_blocks')

        new_state_dict[new_key] = value

    return new_state_dict
```

**Pros**: Clean conversion, Diffusers compatibility
**Cons**: May lose extended LoRA features (diff_b, diff), requires testing

---

### ⚠️ **Option 3: Patch Diffusers Validation**
Modify validation to accept ComfyUI format:

```python
# Monkey-patch LoraLoaderMixin.load_lora_weights
original_load = LoraLoaderMixin.load_lora_weights

def patched_load(self, pretrained_model_name_or_path_or_dict, **kwargs):
    # Pre-convert ComfyUI format if detected
    if isinstance(pretrained_model_name_or_path_or_dict, str):
        state_dict = sf.load_file(pretrained_model_name_or_path_or_dict)
        if any('diffusion_model' in k for k in state_dict.keys()):
            state_dict = convert_comfyui_lora_to_diffusers(state_dict)
            return original_load(self, state_dict, **kwargs)

    return original_load(self, pretrained_model_name_or_path_or_dict, **kwargs)

LoraLoaderMixin.load_lora_weights = patched_load
```

**Pros**: Works with existing Diffusers pipeline
**Cons**: Monkey-patching, maintenance burden, may break with Diffusers updates

---

### ⚠️ **Option 4: Use External Converter**
Use existing conversion tools:
- **kohya-ss/sd-scripts**: `convert_lora_to_diffusers.py`
- **bmaltais/kohya_ss**: GUI-based converter

**Pros**: Battle-tested conversion logic
**Cons**: External dependency, manual conversion step

---

## 9. Recommended Solution

### **Primary: ComfyUI Backend Integration**

**Rationale**:
1. Native support for all LoRA formats (ComfyUI, Kohya, A1111, LoCon, LoHa, etc.)
2. No conversion loss (preserves alpha, diff_b, diff parameters)
3. Already have ComfyUI models symlinked
4. Better compatibility with existing LoRA ecosystem

**Implementation Path**:
```python
# backend/services/comfyui_lora_service.py
class ComfyUILoraService:
    def load_lora(self, model, clip, lora_path, strength):
        from comfy.sd import load_lora_for_models
        return load_lora_for_models(model, clip, lora_path, strength)
```

---

### **Fallback: Format Converter**

For Diffusers-only workflows:
1. Implement `convert_comfyui_lora_to_diffusers()`
2. Pre-convert LoRA on first load
3. Cache converted version
4. Load from cache on subsequent requests

---

## 10. Additional Notes

### Extended LoRA Variants
The presence of `diff` and `diff_b` parameters suggests this may be an extended LoRA variant:
- **LoCon** (LoRA for Convolution): Adds convolution layer adaptations
- **LoHa** (LoRA with Hadamard Product): Adds element-wise product adaptations
- **Full Fine-Tuning** components: Additional trainable parameters

### Diffusers Support Status
As of Diffusers v0.35.1:
- ✅ Standard LoRA (lora_down/lora_up/alpha)
- ✅ DoRA (Directional LoRA) - **experimental**
- ❌ LoCon - **not supported**
- ❌ LoHa - **not supported**
- ❌ Extended parameters (diff, diff_b) - **not supported**

---

## 11. Testing Protocol

### Verify LoRA Format
```python
import safetensors.torch as sf

lora_path = "path/to/lora.safetensors"
state_dict = sf.load_file(lora_path)

# Check format
has_diffusion_model = any('diffusion_model' in k for k in state_dict.keys())
has_lora_prefix = any(k.startswith(('lora_unet_', 'lora_te_')) for k in state_dict.keys())

if has_diffusion_model:
    print("Format: ComfyUI/Kohya/A1111")
elif has_lora_prefix:
    print("Format: Diffusers")
else:
    print("Format: Unknown")
```

### Test Diffusers Validation
```python
is_valid = all("lora" in key for key in state_dict.keys())
print(f"Diffusers validation: {'PASS' if is_valid else 'FAIL'}")
```

---

## 12. References

### Diffusers Code Locations
- Validation: `diffusers/loaders/lora.py:73-75`
- Conversion: `diffusers/loaders/lora_conversion_utils.py:0-115`
- SGM mapping: `diffusers/loaders/lora_conversion_utils.py:_maybe_map_sgm_blocks_to_diffusers`

### Format Documentation
- Diffusers LoRA: https://huggingface.co/docs/diffusers/using-diffusers/loading_adapters
- ComfyUI LoRA: https://github.com/comfyanonymous/ComfyUI/wiki/LoRA
- Kohya LoRA: https://github.com/kohya-ss/sd-scripts

---

**Conclusion**: The LoRA file is in ComfyUI format, which is fundamentally incompatible with Diffusers' validation. Use ComfyUI backend for native support, or implement a converter for Diffusers compatibility.
