// painting/index.js - 페인팅 시스템 통합 진입점

import { init as initPaintingMode, activatePaintingMode, deactivatePaintingMode, isPaintingModeActive } from './paintingMode.js';
import { init as initDrawingTools, setupDrawingEvents, setTool, setBrushColor, setBrushSize, setBrushOpacity, getCurrentTool, clearAll, undo, redo } from './drawingTools.js';

/**
 * 페인팅 시스템 전체 초기화
 * @param {Konva.Stage} stage - 메인 Konva stage
 * @param {Konva.Layer} layer - 메인 Konva layer
 */
export function init(stage, layer) {
    console.log('🎨 Initializing Painting System...');
    
    // 페인팅 모드 초기화
    initPaintingMode(stage, layer);
    
    // 그리기 도구 초기화
    initDrawingTools();
    
    console.log('✅ Painting System initialized successfully');
}

/**
 * 페인팅 모드 시작 (컨텍스트 메뉴에서 호출)
 * @param {Konva.Image} imageNode - 그림을 그릴 이미지
 */
export function startPainting(imageNode) {
    if (!imageNode) {
        console.error('No image provided for painting');
        return false;
    }
    
    if (isPaintingModeActive()) {
        console.warn('Painting mode is already active');
        return false;
    }
    
    console.log('🎨 Starting painting on image:', imageNode);
    
    // 페인팅 모드 활성화
    activatePaintingMode(imageNode);
    
    // 잠시 후 그리기 이벤트 설정 (DOM이 준비된 후)
    setTimeout(() => {
        setupDrawingEvents();
    }, 100);
    
    return true;
}

/**
 * 페인팅 모드 종료
 */
export function stopPainting() {
    if (!isPaintingModeActive()) {
        console.warn('Painting mode is not active');
        return false;
    }
    
    console.log('🎨 Stopping painting mode');
    deactivatePaintingMode();
    return true;
}

/**
 * 페인팅 모드 활성 상태 확인
 */
export function isActive() {
    return isPaintingModeActive();
}

// 그리기 도구 함수들 재-export
export {
    setTool,
    setBrushColor,
    setBrushSize,
    setBrushOpacity,
    getCurrentTool,
    clearAll,
    undo,
    redo
};