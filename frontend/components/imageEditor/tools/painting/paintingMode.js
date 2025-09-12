// painting/paintingMode.js - 독립적인 페인팅 모드 시스템

import { setTool, setBrushColor, setBrushSize, setBrushOpacity, getCurrentTool, clearAll, undo, redo } from './drawingTools.js';

let isActive = false;
let originalStage;
let originalLayer;
let targetImage;
let targetImagePosition = null; // 원본 이미지의 위치와 크기 정보
let backgroundImageBounds = null; // 페인팅 캔버스 내 배경 이미지의 실제 영역
let paintingOverlay;
let paintingCanvas;
let paintingLayer;
let blockingLayer;

// 키보드 이벤트 차단용
let originalKeyHandlers = new Map();
let paintingKeyHandler;

/**
 * 페인팅 모드 초기화
 * @param {Konva.Stage} stage - 메인 Konva stage
 * @param {Konva.Layer} layer - 메인 Konva layer
 */
export function init(stage, layer) {
    originalStage = stage;
    originalLayer = layer;
    
    console.log('🎨 Painting Mode initialized');
}

/**
 * 페인팅 모드 활성화
 * @param {Konva.Image} imageNode - 그림을 그릴 이미지 노드
 */
export function activatePaintingMode(imageNode) {
    if (isActive) {
        console.warn('Painting mode is already active');
        return;
    }
    
    console.log('🎨 Activating Painting Mode for image:', imageNode);
    
    isActive = true;
    targetImage = imageNode;
    
    // 원본 이미지의 위치와 크기 정보 저장
    targetImagePosition = {
        x: imageNode.x(),
        y: imageNode.y(),
        width: imageNode.width() * imageNode.scaleX(),
        height: imageNode.height() * imageNode.scaleY(),
        offsetX: imageNode.offsetX(),
        offsetY: imageNode.offsetY(),
        rotation: imageNode.rotation()
    };
    
    console.log('📍 Original image position saved:', targetImagePosition);
    
    // 모든 UI 차단
    blockAllUI();
    
    // 페인팅 오버레이 생성
    createPaintingOverlay();
    
    // ESC 키 핸들러 설정
    setupKeyHandlers();
    
    // 페인팅 캔버스 설정
    setupPaintingCanvas();
    
    console.log('✨ Painting Mode activated - Press ESC to exit');
}

/**
 * 페인팅 모드 비활성화
 */
export function deactivatePaintingMode() {
    if (!isActive) {
        console.warn('Painting mode is not active');
        return;
    }
    
    console.log('🎨 Deactivating Painting Mode');
    
    // 페인팅 오버레이 제거
    removePaintingOverlay();
    
    // 키 핸들러 복원
    restoreKeyHandlers();
    
    // UI 차단 해제
    unblockAllUI();
    
    // 상태 초기화
    isActive = false;
    targetImage = null;
    paintingCanvas = null;
    paintingLayer = null;
    
    console.log('✅ Painting Mode deactivated');
}

/**
 * 모든 UI 차단 (페인팅 모드 전용)
 */
function blockAllUI() {
    // 메인 stage의 모든 이벤트 차단
    if (originalStage) {
        originalStage.listening(false);
    }
    
    // body에 차단 오버레이 추가
    blockingLayer = document.createElement('div');
    blockingLayer.id = 'painting-mode-blocker';
    blockingLayer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        z-index: 9998;
        pointer-events: all;
        backdrop-filter: blur(2px);
    `;
    
    document.body.appendChild(blockingLayer);
    
    console.log('🚫 All UI blocked for painting mode');
}

/**
 * UI 차단 해제
 */
function unblockAllUI() {
    // 메인 stage 이벤트 복원
    if (originalStage) {
        originalStage.listening(true);
    }
    
    // 차단 오버레이 제거
    if (blockingLayer) {
        document.body.removeChild(blockingLayer);
        blockingLayer = null;
    }
    
    console.log('✅ UI unblocked');
}

/**
 * 페인팅 오버레이 UI 생성
 */
function createPaintingOverlay() {
    paintingOverlay = document.createElement('div');
    paintingOverlay.id = 'painting-mode-overlay';
    paintingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 9999;
        background: transparent;
        display: flex;
        justify-content: center;
        align-items: center;
        pointer-events: none;
    `;
    
    // 페인팅 툴바 생성
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
        position: absolute;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(30, 30, 30, 0.95);
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        pointer-events: all;
        display: flex;
        gap: 20px;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        min-width: 700px;
    `;
    
    // 타이틀 섹션
    const titleSection = document.createElement('div');
    titleSection.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-right: 20px;
    `;
    
    const title = document.createElement('div');
    title.style.cssText = `
        color: #6cb6ff;
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
    `;
    title.textContent = '🎨 Painting Mode';
    
    const escInfo = document.createElement('div');
    escInfo.style.cssText = `
        color: #9ca3af;
        font-size: 11px;
    `;
    escInfo.textContent = 'Press ESC to exit';
    
    titleSection.appendChild(title);
    titleSection.appendChild(escInfo);
    
    // 구분선
    const separator1 = createSeparator();
    
    // 도구 선택 섹션
    const toolSection = createToolSection();
    
    // 구분선
    const separator2 = createSeparator();
    
    // 브러시 색상 섹션
    const colorSection = createColorSection();
    
    // 구분선
    const separator3 = createSeparator();
    
    // 브러시 크기 섹션
    const sizeSection = createSizeSection();
    
    // 구분선
    const separator4 = createSeparator();
    
    // 불투명도 섹션
    const opacitySection = createOpacitySection();
    
    // 구분선
    const separator5 = createSeparator();
    
    // 액션 버튼 섹션
    const actionSection = createActionSection();
    
    toolbar.appendChild(titleSection);
    toolbar.appendChild(separator1);
    toolbar.appendChild(toolSection);
    toolbar.appendChild(separator2);
    toolbar.appendChild(colorSection);
    toolbar.appendChild(separator3);
    toolbar.appendChild(sizeSection);
    toolbar.appendChild(separator4);
    toolbar.appendChild(opacitySection);
    toolbar.appendChild(separator5);
    toolbar.appendChild(actionSection);
    
    paintingOverlay.appendChild(toolbar);
    document.body.appendChild(paintingOverlay);
    
    console.log('🎨 Painting overlay created');
}

/**
 * 페인팅 오버레이 제거
 */
function removePaintingOverlay() {
    if (paintingOverlay) {
        document.body.removeChild(paintingOverlay);
        paintingOverlay = null;
    }
}

/**
 * 툴바 구분선 생성
 */
function createSeparator() {
    const separator = document.createElement('div');
    separator.style.cssText = `
        width: 1px;
        height: 40px;
        background: rgba(255, 255, 255, 0.2);
    `;
    return separator;
}

/**
 * 브러시 프리셋 정의
 */
const brushPresets = [
    { 
        name: '연필', 
        icon: '✏️',
        size: 2, 
        opacity: 1.0,
        color: '#000000',
        lineCap: 'round',
        lineJoin: 'round'
    },
    { 
        name: '마커', 
        icon: '🖊️',
        size: 15, 
        opacity: 0.7,
        color: null, // 현재 색상 유지
        lineCap: 'round',
        lineJoin: 'round'
    },
    { 
        name: '에어브러시', 
        icon: '🎨',
        size: 30, 
        opacity: 0.3,
        color: null, // 현재 색상 유지
        lineCap: 'round',
        lineJoin: 'round'
    },
    { 
        name: '굵은펜', 
        icon: '🖍️',
        size: 8, 
        opacity: 0.9,
        color: null,
        lineCap: 'round',
        lineJoin: 'round'
    }
];

let currentPreset = null; // 현재 선택된 프리셋

/**
 * 브러시 프리셋 드롭다운 생성
 */
let presetDropdown = null;

function createBrushPresetDropdown(parentButton) {
    // 이미 드롭다운이 있으면 제거
    if (presetDropdown && presetDropdown.parentNode) {
        presetDropdown.parentNode.removeChild(presetDropdown);
        presetDropdown = null;
        return;
    }
    
    // 브러시 버튼의 위치 계산
    const buttonRect = parentButton.getBoundingClientRect();
    
    presetDropdown = document.createElement('div');
    presetDropdown.style.cssText = `
        position: fixed;
        top: ${buttonRect.bottom + 5}px;
        left: ${buttonRect.left}px;
        background: rgba(30, 30, 30, 0.98);
        border: 1px solid rgba(108, 182, 255, 0.5);
        border-radius: 8px;
        padding: 12px;
        z-index: 10002;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        animation: dropdownFadeIn 0.2s ease-out;
        min-width: 150px;
    `;
    
    const title = document.createElement('div');
    title.style.cssText = `
        color: #6cb6ff;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 8px;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid rgba(108, 182, 255, 0.3);
        padding-bottom: 6px;
    `;
    title.textContent = 'Brush Presets';
    
    const presetList = document.createElement('div');
    presetList.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 3px;
    `;
    
    // 프리셋 버튼들 생성
    brushPresets.forEach((preset, index) => {
        const presetItem = document.createElement('button');
        presetItem.style.cssText = `
            background: ${currentPreset === index ? 'rgba(108, 182, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)'};
            border: 1px solid ${currentPreset === index ? '#6cb6ff' : 'rgba(255, 255, 255, 0.1)'};
            border-radius: 4px;
            padding: 8px 10px;
            cursor: pointer;
            transition: all 0.15s ease;
            color: #ffffff;
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            text-align: left;
        `;
        
        const leftContent = document.createElement('div');
        leftContent.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        const icon = document.createElement('span');
        icon.style.fontSize = '16px';
        icon.textContent = preset.icon;
        
        const name = document.createElement('span');
        name.textContent = preset.name;
        
        leftContent.appendChild(icon);
        leftContent.appendChild(name);
        
        const details = document.createElement('span');
        details.style.cssText = `
            font-size: 9px;
            color: #9ca3af;
        `;
        details.textContent = `${preset.size}px`;
        
        presetItem.appendChild(leftContent);
        presetItem.appendChild(details);
        
        // 호버 효과
        presetItem.addEventListener('mouseenter', () => {
            if (currentPreset !== index) {
                presetItem.style.background = 'rgba(108, 182, 255, 0.15)';
                presetItem.style.borderColor = 'rgba(108, 182, 255, 0.3)';
            }
        });
        
        presetItem.addEventListener('mouseleave', () => {
            if (currentPreset !== index) {
                presetItem.style.background = 'rgba(255, 255, 255, 0.05)';
                presetItem.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }
        });
        
        // 클릭 이벤트
        presetItem.addEventListener('click', (e) => {
            e.stopPropagation();
            applyBrushPreset(preset, index);
            
            // 드롭다운 닫기
            if (presetDropdown && presetDropdown.parentNode) {
                presetDropdown.parentNode.removeChild(presetDropdown);
                presetDropdown = null;
            }
        });
        
        presetList.appendChild(presetItem);
    });
    
    presetDropdown.appendChild(title);
    presetDropdown.appendChild(presetList);
    
    document.body.appendChild(presetDropdown);
    
    // 외부 클릭 시 드롭다운 닫기
    setTimeout(() => {
        const closeDropdown = (e) => {
            if (presetDropdown && !presetDropdown.contains(e.target) && e.target !== parentButton) {
                if (presetDropdown.parentNode) {
                    presetDropdown.parentNode.removeChild(presetDropdown);
                    presetDropdown = null;
                }
                document.removeEventListener('click', closeDropdown);
            }
        };
        document.addEventListener('click', closeDropdown);
    }, 100);
    
    // ESC 키로 닫기
    const handleEscape = (e) => {
        if (e.key === 'Escape' && presetDropdown) {
            if (presetDropdown.parentNode) {
                presetDropdown.parentNode.removeChild(presetDropdown);
                presetDropdown = null;
            }
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// 드롭다운 애니메이션 CSS
if (!document.querySelector('#dropdown-animation-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'dropdown-animation-styles';
    styleSheet.textContent = `
        @keyframes dropdownFadeIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;
    document.head.appendChild(styleSheet);
}

/**
 * 브러시 프리셋 적용
 */
function applyBrushPreset(preset, index) {
    console.log(`🎨 Applying brush preset: ${preset.name}`);
    
    // 브러시 도구로 자동 전환
    setTool('brush');
    
    // 브러시 크기 설정
    setBrushSize(preset.size);
    const sizeSlider = document.querySelector('#brush-size-slider');
    const sizeValue = document.querySelector('#brush-size-value');
    if (sizeSlider) sizeSlider.value = preset.size;
    if (sizeValue) sizeValue.textContent = `${preset.size}px`;
    
    // 불투명도 설정
    setBrushOpacity(preset.opacity);
    const opacitySlider = document.querySelector('#brush-opacity-slider');
    const opacityValue = document.querySelector('#brush-opacity-value');
    if (opacitySlider) opacitySlider.value = preset.opacity;
    if (opacityValue) opacityValue.textContent = `${Math.round(preset.opacity * 100)}%`;
    
    // 색상 설정 (프리셋에 색상이 지정된 경우만)
    if (preset.color) {
        setBrushColor(preset.color);
        const colorPicker = document.querySelector('#brush-color-picker');
        if (colorPicker) colorPicker.value = preset.color;
    }
    
    // 도구 버튼 하이라이트 업데이트
    const toolButtons = document.querySelectorAll('[data-tool]');
    toolButtons.forEach(btn => {
        if (btn.dataset.tool === 'brush') {
            btn.style.background = 'rgba(108, 182, 255, 0.3)';
            btn.style.borderColor = '#6cb6ff';
        } else {
            btn.style.background = 'rgba(255, 255, 255, 0.1)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
    });
    
    // 피드백 메시지
    showPresetNotification(`${preset.icon} ${preset.name} 프리셋 적용됨`);
}

/**
 * 프리셋 알림 표시
 */
function showPresetNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(108, 182, 255, 0.9);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: fadeInUp 0.3s ease-out;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 1.5초 후 자동 제거
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(10px)';
            notification.style.transition = 'all 0.3s ease-in';
            
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }
    }, 1500);
}

// CSS 애니메이션 추가
if (!document.querySelector('#preset-animation-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'preset-animation-styles';
    styleSheet.textContent = `
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }
    `;
    document.head.appendChild(styleSheet);
}

/**
 * 도구 선택 섹션 생성
 */
function createToolSection() {
    const section = document.createElement('div');
    section.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    `;
    
    const label = document.createElement('div');
    label.style.cssText = `
        color: #9ca3af;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    label.textContent = 'Tools';
    
    const toolButtons = document.createElement('div');
    toolButtons.style.cssText = `
        display: flex;
        gap: 8px;
    `;
    
    // 브러시 버튼
    const brushBtn = createToolButton('🖌️', 'brush', 'Brush');
    // 지우개 버튼
    const eraserBtn = createToolButton('🧽', 'eraser', 'Eraser');
    // 돋보기 버튼
    const magnifierBtn = createToolButton('🔍', 'magnifier', 'Magnifier');
    
    toolButtons.appendChild(brushBtn);
    toolButtons.appendChild(eraserBtn);
    toolButtons.appendChild(magnifierBtn);
    
    section.appendChild(label);
    section.appendChild(toolButtons);
    
    return section;
}

/**
 * 도구 버튼 생성
 */
function createToolButton(icon, tool, tooltip) {
    const button = document.createElement('button');
    button.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        color: white;
        font-size: 16px;
        width: 40px;
        height: 40px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    button.textContent = icon;
    button.title = tooltip;
    button.setAttribute('data-tool', tool);
    
    // 현재 도구 확인하여 활성 상태 표시
    const currentTool = getCurrentTool();
    if (currentTool.tool === tool) {
        button.style.background = 'rgba(108, 182, 255, 0.3)';
        button.style.borderColor = '#6cb6ff';
    }
    
    button.addEventListener('mouseenter', () => {
        if (getCurrentTool().tool !== tool) {
            button.style.background = 'rgba(255, 255, 255, 0.2)';
        }
    });
    
    button.addEventListener('mouseleave', () => {
        if (getCurrentTool().tool !== tool) {
            button.style.background = 'rgba(255, 255, 255, 0.1)';
        }
    });
    
    button.addEventListener('click', () => {
        setTool(tool);
        updateToolButtons(); // 다른 버튼들 업데이트
    });
    
    // 브러시 버튼에만 더블클릭 이벤트 추가
    if (tool === 'brush') {
        button.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            createBrushPresetDropdown(button);
        });
        
        // 더블클릭 가능함을 나타내는 시각적 힌트
        button.title = tooltip + ' (더블클릭: 프리셋)';
    }
    
    return button;
}

/**
 * 색상 선택 섹션 생성
 */
function createColorSection() {
    const section = document.createElement('div');
    section.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    `;
    
    const label = document.createElement('div');
    label.style.cssText = `
        color: #9ca3af;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    label.textContent = 'Color';
    
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = getCurrentTool().color;
    colorPicker.style.cssText = `
        width: 40px;
        height: 40px;
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
    `;
    
    colorPicker.addEventListener('change', (e) => {
        setBrushColor(e.target.value);
    });
    
    section.appendChild(label);
    section.appendChild(colorPicker);
    
    return section;
}

/**
 * 브러시 크기 섹션 생성
 */
function createSizeSection() {
    const section = document.createElement('div');
    section.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        min-width: 80px;
    `;
    
    const label = document.createElement('div');
    label.style.cssText = `
        color: #9ca3af;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    label.textContent = 'Size';
    
    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '1';
    sizeSlider.max = '50';
    sizeSlider.value = getCurrentTool().size;
    sizeSlider.style.cssText = `
        width: 80px;
        height: 6px;
        background: rgba(255, 255, 255, 0.2);
        outline: none;
        border-radius: 3px;
        cursor: pointer;
    `;
    
    const sizeDisplay = document.createElement('div');
    sizeDisplay.style.cssText = `
        color: white;
        font-size: 12px;
        font-weight: 500;
    `;
    sizeDisplay.textContent = `${getCurrentTool().size}px`;
    
    sizeSlider.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        setBrushSize(size);
        sizeDisplay.textContent = `${size}px`;
    });
    
    section.appendChild(label);
    section.appendChild(sizeSlider);
    section.appendChild(sizeDisplay);
    
    return section;
}

/**
 * 불투명도 조절 섹션 생성
 */
function createOpacitySection() {
    const section = document.createElement('div');
    section.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        min-width: 80px;
    `;
    
    const label = document.createElement('div');
    label.style.cssText = `
        color: #9ca3af;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    label.textContent = 'Opacity';
    
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0.1';
    opacitySlider.max = '1.0';
    opacitySlider.step = '0.1';
    opacitySlider.value = getCurrentTool().opacity;
    opacitySlider.style.cssText = `
        width: 80px;
        height: 6px;
        background: rgba(255, 255, 255, 0.2);
        outline: none;
        border-radius: 3px;
        cursor: pointer;
    `;
    
    const opacityDisplay = document.createElement('div');
    opacityDisplay.style.cssText = `
        color: white;
        font-size: 12px;
        font-weight: 500;
    `;
    opacityDisplay.textContent = `${Math.round(getCurrentTool().opacity * 100)}%`;
    
    opacitySlider.addEventListener('input', (e) => {
        const opacity = parseFloat(e.target.value);
        setBrushOpacity(opacity);
        opacityDisplay.textContent = `${Math.round(opacity * 100)}%`;
    });
    
    section.appendChild(label);
    section.appendChild(opacitySlider);
    section.appendChild(opacityDisplay);
    
    return section;
}

/**
 * 액션 버튼 섹션 생성
 */
function createActionSection() {
    const section = document.createElement('div');
    section.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    `;
    
    const label = document.createElement('div');
    label.style.cssText = `
        color: #9ca3af;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;
    label.textContent = 'Actions';
    
    const actionButtons = document.createElement('div');
    actionButtons.style.cssText = `
        display: flex;
        gap: 6px;
    `;
    
    // Save 버튼
    const saveBtn = createActionButton('💾', 'Save Image', savePaintedImage);
    // Clear 버튼
    const clearBtn = createActionButton('🗑️', 'Clear All', clearAll);
    // Undo 버튼 (향후 구현)
    const undoBtn = createActionButton('↶', 'Undo', undo);
    // Redo 버튼 (향후 구현)  
    const redoBtn = createActionButton('↷', 'Redo', redo);
    
    actionButtons.appendChild(saveBtn);
    actionButtons.appendChild(clearBtn);
    actionButtons.appendChild(undoBtn);
    actionButtons.appendChild(redoBtn);
    
    section.appendChild(label);
    section.appendChild(actionButtons);
    
    return section;
}

/**
 * 액션 버튼 생성
 */
function createActionButton(icon, tooltip, action) {
    const button = document.createElement('button');
    button.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        color: white;
        font-size: 12px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    button.textContent = icon;
    button.title = tooltip;
    
    button.addEventListener('mouseenter', () => {
        button.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    
    button.addEventListener('click', action);
    
    return button;
}


/**
 * 도구 버튼들 상태 업데이트
 */
function updateToolButtons() {
    const currentTool = getCurrentTool();
    const toolButtons = paintingOverlay.querySelectorAll('button[data-tool]');
    
    toolButtons.forEach(button => {
        const tool = button.getAttribute('data-tool');
        if (currentTool.tool === tool) {
            button.style.background = 'rgba(108, 182, 255, 0.3)';
            button.style.borderColor = '#6cb6ff';
        } else {
            button.style.background = 'rgba(255, 255, 255, 0.1)';
            button.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
    });
    
    console.log(`🛠️ Tool buttons updated - active: ${currentTool.tool}`);
}

/**
 * 키보드 핸들러 설정 (ESC만 허용)
 */
function setupKeyHandlers() {
    // 기존 키 이벤트 핸들러들 백업 및 제거
    backupAndDisableKeyHandlers();
    
    // 페인팅 모드 전용 키 핸들러
    paintingKeyHandler = (e) => {
        // ESC 키만 처리
        if (e.key === 'Escape' || e.keyCode === 27) {
            e.preventDefault();
            e.stopPropagation();
            deactivatePaintingMode();
            return;
        }
        
        // 다른 모든 키 이벤트 차단
        e.preventDefault();
        e.stopPropagation();
        
        // 향후 단축키들 (현재는 차단만)
        console.log(`🎨 Key pressed in painting mode: ${e.key} (blocked)`);
    };
    
    // 페인팅 모드 키 핸들러 등록
    document.addEventListener('keydown', paintingKeyHandler, true);
    document.addEventListener('keyup', paintingKeyHandler, true);
    
    console.log('⌨️ Painting mode key handlers setup (ESC only)');
}

/**
 * 기존 키 핸들러들 백업 및 비활성화
 */
function backupAndDisableKeyHandlers() {
    // body의 모든 이벤트 리스너들을 임시로 비활성화
    // (실제로는 완벽한 백업/복원이 복잡하므로, 단순히 차단만)
    originalKeyHandlers.set('keydown', document.onkeydown);
    originalKeyHandlers.set('keyup', document.onkeyup);
    
    document.onkeydown = null;
    document.onkeyup = null;
}

/**
 * 키 핸들러 복원
 */
function restoreKeyHandlers() {
    // 페인팅 모드 키 핸들러 제거
    if (paintingKeyHandler) {
        document.removeEventListener('keydown', paintingKeyHandler, true);
        document.removeEventListener('keyup', paintingKeyHandler, true);
        paintingKeyHandler = null;
    }
    
    // 기존 핸들러들 복원 (기본적인 복원만)
    if (originalKeyHandlers.has('keydown')) {
        document.onkeydown = originalKeyHandlers.get('keydown');
    }
    if (originalKeyHandlers.has('keyup')) {
        document.onkeyup = originalKeyHandlers.get('keyup');
    }
    
    originalKeyHandlers.clear();
    
    console.log('⌨️ Key handlers restored');
}

/**
 * 페인팅 캔버스 설정
 */
function setupPaintingCanvas() {
    if (!targetImage || !paintingOverlay) return;
    
    // 원본 이미지 크기 가져오기
    const imageElement = targetImage.image();
    
    console.log('🔍 Target image debugging:', {
        targetImage: targetImage,
        imageElement: imageElement,
        hasImage: !!imageElement,
        imageComplete: imageElement ? imageElement.complete : false,
        naturalWidth: imageElement ? imageElement.naturalWidth : 'N/A',
        naturalHeight: imageElement ? imageElement.naturalHeight : 'N/A'
    });
    
    if (!imageElement) {
        console.error('No image element found from targetImage.image()');
        console.log('🚨 Fallback: Using default canvas size 800x600');
        
        // 폴백: 기본 크기 사용
        const canvasSize = { width: 800, height: 600 };
        const canvasPos = {
            x: (window.innerWidth - canvasSize.width) / 2,
            y: (window.innerHeight - canvasSize.height) / 2
        };
        
        createPaintingCanvasWithFallback(canvasSize, canvasPos);
        return;
    }
    
    // 이미지가 로드되지 않았다면 기다리기
    if (!imageElement.complete || !imageElement.naturalWidth) {
        console.log('🖼️ Image still loading, waiting for load...');
        imageElement.onload = () => {
            console.log('🖼️ Image loaded, retrying setupPaintingCanvas');
            setupPaintingCanvas(); // 재귀 호출로 다시 시도
        };
        return;
    }
    
    const originalWidth = imageElement.naturalWidth || imageElement.width;
    const originalHeight = imageElement.naturalHeight || imageElement.height;
    
    console.log('📐 Image dimensions:', { originalWidth, originalHeight });
    
    // 화면에 맞게 적절한 크기로 비례 조정 (원본 비율 유지)
    const maxWidth = Math.min(1200, window.innerWidth * 0.9);
    const maxHeight = Math.min(900, window.innerHeight * 0.9);
    
    // 비례 계산
    const scaleX = maxWidth / originalWidth;
    const scaleY = maxHeight / originalHeight;
    const scale = Math.min(scaleX, scaleY, 1.0); // 확대는 하지 않고 축소만
    
    // 캔버스 크기 = 원본 이미지 크기 × 스케일 (비율 유지)
    const canvasSize = {
        width: Math.round(originalWidth * scale),
        height: Math.round(originalHeight * scale)
    };
    
    const canvasPos = {
        x: (window.innerWidth - canvasSize.width) / 2,
        y: (window.innerHeight - canvasSize.height) / 2
    };
    
    console.log('🎨 Dynamic canvas size based on image ratio:', {
        originalSize: { width: originalWidth, height: originalHeight },
        scale: scale,
        canvasSize: canvasSize,
        position: canvasPos
    });
    
    // 페인팅 캔버스 컨테이너 생성
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = `
        position: absolute;
        left: ${canvasPos.x}px;
        top: ${canvasPos.y}px;
        width: ${canvasSize.width}px;
        height: ${canvasSize.height}px;
        border: 2px solid #6cb6ff;
        border-radius: 8px;
        box-shadow: 0 0 30px rgba(108, 182, 255, 0.5);
        pointer-events: all;
        background: #ffffff;
        overflow: hidden;
    `;
    
    // Konva Stage for painting (고해상도 렌더링)
    const pixelRatio = window.devicePixelRatio || 1;
    
    paintingCanvas = new Konva.Stage({
        container: canvasContainer,
        width: canvasSize.width,
        height: canvasSize.height,
        pixelRatio: pixelRatio // 고해상도 렌더링
    });
    
    // 캔버스 스무딩 활성화 (더 부드러운 렌더링)
    // Konva Stage에서 캔버스 요소에 접근하는 올바른 방법
    setTimeout(() => {
        const canvasElement = paintingCanvas.content.querySelector('canvas');
        if (canvasElement) {
            const context = canvasElement.getContext('2d');
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            console.log('🎨 Canvas smoothing enabled');
        }
    }, 50);
    
    paintingLayer = new Konva.Layer();
    paintingCanvas.add(paintingLayer);
    
    console.log('🎨 High-quality canvas setup:', {
        pixelRatio: pixelRatio,
        canvasElement: !!paintingCanvas.content.querySelector('canvas')
    });
    
    // 선택한 이미지를 백그라운드로 추가
    addImageBackground();
    
    // 백그라운드 이미지 추가 후 레이어 캐싱 활성화 (지우개 기능 위해 필요)
    setTimeout(() => {
        paintingLayer.cache();
        paintingLayer.batchDraw();
        console.log('🎨 Painting layer cached for eraser functionality');
    }, 100);
    
    paintingOverlay.appendChild(canvasContainer);
    
    console.log('🖼️ Painting canvas setup complete:', { canvasSize, canvasPos });
}

/**
 * 폴백 모드로 페인팅 캔버스 생성 (이미지 로딩 실패 시)
 */
function createPaintingCanvasWithFallback(canvasSize, canvasPos) {
    console.log('🚨 Creating fallback painting canvas:', { canvasSize, canvasPos });
    
    // 페인팅 캔버스 컨테이너 생성
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = `
        position: absolute;
        left: ${canvasPos.x}px;
        top: ${canvasPos.y}px;
        width: ${canvasSize.width}px;
        height: ${canvasSize.height}px;
        border: 2px solid #6cb6ff;
        border-radius: 8px;
        box-shadow: 0 0 30px rgba(108, 182, 255, 0.5);
        pointer-events: all;
        background: #f0f0f0;
        overflow: hidden;
    `;
    
    // Konva Stage for painting (고해상도 렌더링)
    const pixelRatio = window.devicePixelRatio || 1;
    
    paintingCanvas = new Konva.Stage({
        container: canvasContainer,
        width: canvasSize.width,
        height: canvasSize.height,
        pixelRatio: pixelRatio
    });
    
    // 캔버스 스무딩 활성화
    setTimeout(() => {
        const canvasElement = paintingCanvas.content.querySelector('canvas');
        if (canvasElement) {
            const context = canvasElement.getContext('2d');
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            console.log('🚨 Fallback canvas smoothing enabled');
        }
    }, 50);
    
    paintingLayer = new Konva.Layer();
    paintingCanvas.add(paintingLayer);
    
    // 백그라운드 텍스트 추가 (이미지 없음 표시)
    const placeholderText = new Konva.Text({
        x: canvasSize.width / 2,
        y: canvasSize.height / 2,
        text: 'Image Loading Failed\nPainting Mode Available',
        fontSize: 16,
        fontFamily: 'Arial',
        fill: '#666666',
        align: 'center',
        offsetX: 100,
        offsetY: 20
    });
    
    paintingLayer.add(placeholderText);
    paintingLayer.batchDraw();
    
    // 폴백 모드에서는 전체 캔버스가 그림 영역
    backgroundImageBounds = {
        x: 0,
        y: 0,
        width: canvasSize.width,
        height: canvasSize.height,
        originalWidth: canvasSize.width,
        originalHeight: canvasSize.height
    };
    
    paintingOverlay.appendChild(canvasContainer);
    console.log('🚨 Fallback painting canvas created');
}

/**
 * 선택한 이미지를 페인팅 캔버스의 백그라운드로 추가
 */
function addImageBackground() {
    if (!targetImage || !paintingCanvas || !paintingLayer) return;
    
    // 원본 이미지의 이미지 소스 가져오기
    const imageElement = targetImage.image();
    if (!imageElement) {
        console.warn('No image element found in target image node');
        return;
    }
    
    // 이미지가 로드되지 않았다면 기다리기
    if (!imageElement.complete || !imageElement.naturalWidth) {
        console.log('🖼️ Background image still loading, waiting...');
        imageElement.onload = () => {
            console.log('🖼️ Background image loaded, adding to canvas');
            addImageBackground(); // 재귀 호출로 다시 시도
        };
        return;
    }
    
    // 캔버스 크기 (이미 원본 이미지 비율에 맞춰 만들어짐)
    const canvasWidth = paintingCanvas.width();
    const canvasHeight = paintingCanvas.height();
    
    // 원본 이미지 크기
    const imageWidth = imageElement.naturalWidth || imageElement.width;
    const imageHeight = imageElement.naturalHeight || imageElement.height;
    
    // 캔버스가 이미 이미지 비율에 맞춰 생성되었으므로, 캔버스 전체에 맞춤
    const scaledWidth = canvasWidth;
    const scaledHeight = canvasHeight;
    
    // 캔버스 전체를 채우므로 오프셋은 0
    const offsetX = 0;
    const offsetY = 0;
    
    // 백그라운드 이미지 노드 생성 (고품질 렌더링)
    const backgroundImage = new Konva.Image({
        image: imageElement,
        x: offsetX,
        y: offsetY,
        width: scaledWidth,
        height: scaledHeight,
        opacity: 1.0, // 완전히 불투명하게 설정
        listening: false, // 이벤트 받지 않음
        // 고품질 이미지 렌더링 옵션
        filters: [],
        globalCompositeOperation: 'source-over',
        imageSmoothingEnabled: true
    });
    
    // 백그라운드 레이어에 추가
    paintingLayer.add(backgroundImage);
    paintingLayer.batchDraw();
    
    // 배경 이미지의 실제 영역 저장 (저장 시 사용)
    backgroundImageBounds = {
        x: offsetX,
        y: offsetY,
        width: scaledWidth,
        height: scaledHeight,
        originalWidth: imageWidth,
        originalHeight: imageHeight
    };
    
    // 실제 스케일 계산 (원본 대비 캔버스 크기)
    const actualScale = Math.min(scaledWidth / imageWidth, scaledHeight / imageHeight);
    
    console.log('🖼️ Background image added:', {
        originalSize: { width: imageWidth, height: imageHeight },
        scaledSize: { width: scaledWidth, height: scaledHeight },
        offset: { x: offsetX, y: offsetY },
        scale: actualScale,
        opacity: 1.0,
        imageUrl: imageElement.src ? imageElement.src.substring(0, 100) + '...' : 'no src',
        imageComplete: imageElement.complete,
        imageNaturalSize: { width: imageElement.naturalWidth, height: imageElement.naturalHeight }
    });
}

/**
 * 이미지의 화면상 정확한 위치와 크기 계산
 * imageEditor.js와 동일한 방식 사용
 */
function getImageScreenRect(imageNode) {
    // 1. Stage space에서의 이미지 bounding box 계산
    const clientRect = imageNode.getClientRect();
    
    // 2. Stage 변환 정보
    const stage = originalStage;
    const stagePos = stage.getAbsolutePosition();
    const stageScale = stage.scaleX();
    
    // 3. 화면 좌표로 변환
    const screenRect = {
        x: (clientRect.x * stageScale) + stagePos.x,
        y: (clientRect.y * stageScale) + stagePos.y,
        width: clientRect.width * stageScale,
        height: clientRect.height * stageScale
    };
    
    console.log('🖼️ Image screen rect calculated:', {
        clientRect,
        stagePos,
        stageScale,
        screenRect
    });
    
    return screenRect;
}

/**
 * 페인팅 모드 활성 상태 확인
 */
export function isPaintingModeActive() {
    return isActive;
}

/**
 * 현재 타겟 이미지 반환
 */
export function getTargetImage() {
    return targetImage;
}

/**
 * 페인팅 캔버스 반환 (그리기 도구에서 사용)
 */
export function getPaintingCanvas() {
    return paintingCanvas;
}

/**
 * 페인팅 레이어 반환 (그리기 도구에서 사용)
 */
export function getPaintingLayer() {
    return paintingLayer;
}

/**
 * 페인팅 완료된 이미지 저장
 */
async function savePaintedImage() {
    if (!paintingCanvas || !paintingLayer) {
        console.error('Painting canvas not available for saving');
        return;
    }
    
    try {
        console.log('💾 Starting image save process...');
        
        // 배경 이미지의 실제 영역 정보 사용
        if (!backgroundImageBounds) {
            console.error('Background image bounds not available');
            return;
        }
        
        // 원본 해상도 비율 계산 (배경 이미지가 캔버스에서 축소/확대된 비율)
        const originalWidth = backgroundImageBounds.originalWidth;
        const originalHeight = backgroundImageBounds.originalHeight;
        const scaledWidth = backgroundImageBounds.width;
        const scaledHeight = backgroundImageBounds.height;
        
        // 해상도 비율로 pixelRatio 계산 (원본 해상도로 저장하기 위해)
        const pixelRatio = originalWidth / scaledWidth;
        
        console.log('🔍 Resolution calculation:', {
            originalSize: { width: originalWidth, height: originalHeight },
            scaledSize: { width: scaledWidth, height: scaledHeight },
            pixelRatio: pixelRatio
        });
        
        // 실제 이미지 영역만 캡처 (원본 해상도로)
        const dataURL = paintingCanvas.toDataURL({
            x: backgroundImageBounds.x,
            y: backgroundImageBounds.y,
            width: scaledWidth,
            height: scaledHeight,
            pixelRatio: pixelRatio, // 원본 해상도 복원
            mimeType: 'image/png',
            quality: 1.0
        });
        
        console.log('🖼️ Image data generated:', {
            captureArea: {
                x: backgroundImageBounds.x,
                y: backgroundImageBounds.y,
                width: scaledWidth,
                height: scaledHeight
            },
            outputSize: {
                width: Math.round(scaledWidth * pixelRatio),
                height: Math.round(scaledHeight * pixelRatio)
            },
            pixelRatio: pixelRatio,
            dataSize: Math.round(dataURL.length / 1024) + 'KB'
        });
        
        // 새로운 Image 객체 생성
        const savedImage = new Image();
        
        savedImage.onload = function() {
            console.log('✅ Painted image saved successfully:', {
                width: savedImage.width,
                height: savedImage.height
            });
            
            // 메인 캔버스에 추가
            addSavedImageToMainCanvas(savedImage);
            
            // 성공 알림
            showSaveNotification('✅ 이미지가 저장되었습니다!');
        };
        
        savedImage.onerror = function() {
            console.error('❌ Failed to load saved image');
            showSaveNotification('❌ 이미지 저장에 실패했습니다.', true);
        };
        
        savedImage.src = dataURL;
        
    } catch (error) {
        console.error('❌ Error saving painted image:', error);
        showSaveNotification('❌ 이미지 저장 중 오류가 발생했습니다.', true);
    }
}

/**
 * 저장된 이미지를 메인 캔버스에 추가
 */
function addSavedImageToMainCanvas(savedImage) {
    try {
        // 메인 캔버스와 레이어 가져오기
        const canvasComponent = window.canvasComponent;
        if (!canvasComponent) {
            console.error('Main canvas component not available');
            return;
        }
        
        // 원본 이미지가 여전히 존재하는지 확인
        const stage = canvasComponent.stage;
        const layer = stage?.getChildren()[0];
        const allImages = layer?.getChildren() || [];
        
        console.log('🔍 Before adding painted image - Canvas state:', {
            totalImages: allImages.length,
            targetImageExists: !!targetImage,
            targetImageInCanvas: allImages.some(node => node === targetImage),
            allImageTypes: allImages.map(node => ({
                id: node._id,
                type: node.attrs.imageType || 'unknown',
                position: { x: node.x(), y: node.y() }
            }))
        });
        
        // 원본 이미지 위치 정보 사용
        const position = targetImagePosition || { x: 50, y: 50 };
        
        // 메인 캔버스에 이미지 추가 (원본과 동일한 위치에)
        canvasComponent.addImageFromElement(savedImage, {
            x: position.x, // 원본과 동일한 위치
            y: position.y,
            imageType: 'painted', // 페인팅된 이미지임을 표시
            processingSource: 'painting_tool',
            originalImageId: targetImage?.id || 'unknown',
            createdAt: new Date().toISOString(),
            layerName: 'Painted Image' // 레이어 이름 명시
        });
        
        // 추가 후 상태 확인
        const allImagesAfter = layer?.getChildren() || [];
        console.log('🔍 After adding painted image - Canvas state:', {
            totalImages: allImagesAfter.length,
            targetImageStillExists: allImagesAfter.some(node => node === targetImage),
            newImageAdded: true,
            allImageTypesAfter: allImagesAfter.map(node => ({
                id: node._id,
                type: node.attrs.imageType || 'unknown',
                position: { x: node.x(), y: node.y() }
            }))
        });
        
        console.log('🎨 Painted image added to main canvas at position:', {
            x: position.x,
            y: position.y
        });
        
        // 원본 이미지 유지 (숨기지 않음)
        console.log('✅ Original image preserved, painted image added as new layer');
        
    } catch (error) {
        console.error('❌ Error adding saved image to main canvas:', error);
    }
}

/**
 * 저장 알림 표시
 */
function showSaveNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${isError ? 'rgba(239, 68, 68, 0.9)' : 'rgba(34, 197, 94, 0.9)'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease-out;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            notification.style.transition = 'all 0.3s ease-in';
            
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }
    }, 3000);
}

// CSS 애니메이션 추가
const saveAnimationCSS = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
`;

// 스타일 시트에 애니메이션 추가
if (!document.querySelector('#painting-save-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'painting-save-styles';
    styleSheet.textContent = saveAnimationCSS;
    document.head.appendChild(styleSheet);
}