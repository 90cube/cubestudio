// components/imageEditor/tools/filters.js

/**
 * Filters 도구 모듈
 * 이미지에 다양한 색상 필터와 효과를 적용합니다.
 */

let layer;

export function init(konvaLayer) {
    layer = konvaLayer;
}

/**
 * 밝기 조정
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {number} brightness - 밝기 값 (-1 ~ 1)
 */
export function adjustBrightness(imageNode, brightness) {
    if (!imageNode) return;
    
    imageNode.cache();
    const currentFilters = imageNode.filters() || [];
    const previousBrightness = imageNode.brightness() || 0;
    
    // 기존 brightness 필터 제거
    const filteredFilters = currentFilters.filter(f => f !== Konva.Filters.Brighten);
    
    // 새로운 brightness 적용
    imageNode.brightness(Math.max(-1, Math.min(1, brightness)));
    filteredFilters.push(Konva.Filters.Brighten);
    imageNode.filters(filteredFilters);
    
    layer.batchDraw();
    
    return {
        previousBrightness,
        newBrightness: imageNode.brightness()
    };
}

/**
 * 대비 조정
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {number} contrast - 대비 값 (-100 ~ 100)
 */
export function adjustContrast(imageNode, contrast) {
    if (!imageNode) return;
    
    imageNode.cache();
    const currentFilters = imageNode.filters() || [];
    const previousContrast = imageNode.contrast() || 0;
    
    // 기존 contrast 필터 제거
    const filteredFilters = currentFilters.filter(f => f !== Konva.Filters.Contrast);
    
    // 새로운 contrast 적용
    imageNode.contrast(Math.max(-100, Math.min(100, contrast)));
    filteredFilters.push(Konva.Filters.Contrast);
    imageNode.filters(filteredFilters);
    
    layer.batchDraw();
    
    return {
        previousContrast,
        newContrast: imageNode.contrast()
    };
}

/**
 * 색상 필터 적용
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {string} filterType - 필터 타입 ('grayscale', 'sepia', 'invert')
 */
export function applyColorFilter(imageNode, filterType) {
    if (!imageNode) return;
    
    imageNode.cache();
    const currentFilters = imageNode.filters() || [];
    
    // 기존 컬러 필터들 제거
    const filteredFilters = currentFilters.filter(f => 
        f !== Konva.Filters.Grayscale && 
        f !== Konva.Filters.Sepia && 
        f !== Konva.Filters.Invert
    );
    
    const previousFilters = [...currentFilters];
    
    switch (filterType) {
        case 'grayscale':
            filteredFilters.push(Konva.Filters.Grayscale);
            break;
        case 'sepia':
            filteredFilters.push(Konva.Filters.Sepia);
            break;
        case 'invert':
            filteredFilters.push(Konva.Filters.Invert);
            break;
        default:
            console.warn('Unknown filter type:', filterType);
            return;
    }
    
    imageNode.filters(filteredFilters);
    layer.batchDraw();
    
    return {
        previousFilters,
        newFilters: [...filteredFilters],
        appliedFilter: filterType
    };
}

/**
 * 블러 효과 적용
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {number} intensity - 블러 강도 (0 이상)
 */
export function applyBlur(imageNode, intensity) {
    if (!imageNode || intensity < 0) return;
    
    imageNode.cache();
    const currentFilters = imageNode.filters() || [];
    const previousBlurRadius = imageNode.blurRadius() || 0;
    
    // 기존 블러 필터 제거
    const filteredFilters = currentFilters.filter(f => f !== Konva.Filters.Blur);
    
    imageNode.blurRadius(intensity);
    if (intensity > 0) {
        filteredFilters.push(Konva.Filters.Blur);
    }
    imageNode.filters(filteredFilters);
    
    layer.batchDraw();
    
    return {
        previousBlurRadius,
        newBlurRadius: intensity
    };
}

/**
 * 선명화 효과 적용
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {number} intensity - 선명화 강도 (0 ~ 1)
 */
export function applySharpen(imageNode, intensity = 0.3) {
    if (!imageNode) return;
    
    imageNode.cache();
    const currentFilters = imageNode.filters() || [];
    const previousEnhance = imageNode.enhance() || 0;
    
    // 기존 선명화 필터 제거
    const filteredFilters = currentFilters.filter(f => f !== Konva.Filters.Enhance);
    
    imageNode.enhance(Math.max(0, Math.min(1, intensity)));
    if (intensity > 0) {
        filteredFilters.push(Konva.Filters.Enhance);
    }
    imageNode.filters(filteredFilters);
    
    layer.batchDraw();
    
    return {
        previousEnhance,
        newEnhance: intensity
    };
}

/**
 * HSL 조정 (색조, 채도, 명도)
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {number} hue - 색조 (-180 ~ 180)
 * @param {number} saturation - 채도 (-2 ~ 10)
 * @param {number} luminance - 명도 (-2 ~ 2)
 */
export function adjustHSL(imageNode, hue, saturation, luminance) {
    if (!imageNode) return;
    
    imageNode.cache();
    const currentFilters = imageNode.filters() || [];
    
    const previousHSL = {
        hue: imageNode.hue() || 0,
        saturation: imageNode.saturation() || 0,
        luminance: imageNode.luminance() || 0
    };
    
    // 기존 HSL 필터 제거
    const filteredFilters = currentFilters.filter(f => f !== Konva.Filters.HSL);
    
    imageNode.hue(Math.max(-180, Math.min(180, hue)));
    imageNode.saturation(Math.max(-2, Math.min(10, saturation)));
    imageNode.luminance(Math.max(-2, Math.min(2, luminance)));
    
    filteredFilters.push(Konva.Filters.HSL);
    imageNode.filters(filteredFilters);
    
    layer.batchDraw();
    
    return {
        previousHSL,
        newHSL: {
            hue: imageNode.hue(),
            saturation: imageNode.saturation(),
            luminance: imageNode.luminance()
        }
    };
}

/**
 * 모든 필터 리셋
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 */
export function resetFilters(imageNode) {
    if (!imageNode) return;
    
    const previousState = {
        filters: [...(imageNode.filters() || [])],
        brightness: imageNode.brightness() || 0,
        contrast: imageNode.contrast() || 0,
        blurRadius: imageNode.blurRadius() || 0,
        enhance: imageNode.enhance() || 0,
        hue: imageNode.hue() || 0,
        saturation: imageNode.saturation() || 0,
        luminance: imageNode.luminance() || 0
    };
    
    imageNode.filters([]);
    imageNode.brightness(0);
    imageNode.contrast(0);
    imageNode.blurRadius(0);
    imageNode.enhance(0);
    imageNode.hue(0);
    imageNode.saturation(0);
    imageNode.luminance(0);
    imageNode.clearCache();
    
    layer.batchDraw();
    
    return {
        previousState,
        newState: 'reset'
    };
}