// components/imageEditor/imageEditor.js
import { init as initTransform, rotate, flip } from './tools/transform.js';
import { init as initFilters, adjustBrightness, adjustContrast, applyColorFilter, applyBlur, applySharpen, resetFilters } from './tools/filters.js';
import { init as initCrop, startCropMode, applyCrop, cancelCropMode, isCropMode, activateLassoCrop } from './tools/crop.js';
import { init as initTransformer, startTransformMode, exitTransformMode, isTransformModeActive } from './tools/transformer.js';
import { setSelectedImage } from '../canvas/canvas.js';
import { registerShortcut } from '../keyboardManager/keyboardManager.js';
import { init as initSliderPanel, showSliderPanel, hideSliderPanel } from './sliderPanel.js';
import { getNodeRect } from '../../core/coordinates.js';

let stage;
let layer;
let contextMenu;
let selectedImage;
let cropModeSelector;

export function init(konvaStage, konvaLayer) {
    stage = konvaStage;
    layer = konvaLayer;
    
    // 도구 모듈들 초기화
    initTransform(layer);
    initFilters(layer);
    initCrop(stage, layer);
    initTransformer(stage, layer);
    initSliderPanel(); // Initialize slider panel
    
    setupContextMenu();
    setupDoubleClickHandler();
    createCropModeSelector(); // Create the selector on init, but keep it hidden
    
    // console.log('Image Editor initialized');

    registerShortcut('Delete', deleteImage, {}, 'Delete selected image');
}

// 더블클릭 핸들러 설정
function setupDoubleClickHandler() {
    stage.on('dblclick dbltap', (e) => {
        // 팬닝 모드에서는 컨텍스트 메뉴 비활성화
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            return;
        }

        const clickedNode = e.target;
        
        // 이미지 노드인지 확인
        if (clickedNode.className === 'Image' || clickedNode.name() === 'image-group') {
            selectedImage = clickedNode;
            // 캔버스의 선택 상태도 동기화
            setSelectedImage(clickedNode);
            // console.log('Image selected for editing:', selectedImage);
            const pos = stage.getPointerPosition();
            showContextMenu(pos.x, pos.y);
        } else {
            hideContextMenu();
        }
    });

    // 다른 곳 클릭시 컨텍스트 메뉴 숨김
    stage.on('click tap', (e) => {
        if (e.target === stage || e.target.className === 'Rect') {
            hideContextMenu();
            hideSliderPanel(); // Also hide slider panel
        }
    });
}

// 컨텍스트 메뉴 UI 생성
function setupContextMenu() {
    contextMenu = document.createElement('div');
    contextMenu.className = 'image-editor-context-menu';
    contextMenu.style.cssText = `
        position: fixed;
        background: rgba(42, 48, 56, 0.95);
        border: 1px solid rgba(134, 142, 150, 0.2);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        padding: 6px;
        z-index: 1000;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        min-width: 240px;
        max-height: 70vh;
        overflow-y: auto;
        color: #e8eaed;
    `;
    
    // 단일 기능 메뉴 아이템들 생성
    const menuItems = [
        {
            category: 'Flip Horizontal',
            icon: '↔',
            action: () => flip(getCurrentSelectedImage(), 'horizontal'),
            isDirectAction: true
        },
        {
            category: 'Flip Vertical',
            icon: '↕',
            action: () => flip(getCurrentSelectedImage(), 'vertical'),
            isDirectAction: true
        },
        {
            category: 'Adjust',
            icon: '◐',
            action: () => openSliderPanel('adjust'),
            isDirectAction: true
        },
        {
            category: 'Filters',
            icon: '◑',
            action: () => openSliderPanel('filters'),
            isDirectAction: true
        },
        {
            category: 'Crop Image',
            icon: '⬚',
            action: () => startCropTool(),
            isDirectAction: true
        },
        {
            category: 'Delete Image',
            icon: '🗑',
            action: () => deleteImage(),
            isDirectAction: true,
            style: 'color: #e74c3c; font-weight: 500;'
        }
    ];

    // 단일 기능 메뉴 렌더링
    menuItems.forEach(category => {
        const menuButton = document.createElement('div');
        menuButton.style.cssText = `
            font-weight: 500;
            color: #e8eaed;
            padding: 10px 14px;
            border-bottom: 1px solid rgba(134, 142, 150, 0.1);
            margin-bottom: 2px;
            background: rgba(37, 42, 51, 0.6);
            cursor: pointer;
            border-radius: 6px;
            display: flex;
            align-items: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            ${category.style || ''}
        `;
        
        const buttonText = document.createElement('span');
        buttonText.textContent = `${category.icon} ${category.category}`;
        menuButton.appendChild(buttonText);
        
        menuButton.addEventListener('mouseenter', () => {
            menuButton.style.background = 'rgba(108, 182, 255, 0.2)';
            menuButton.style.transform = 'translateX(2px)';
        });
        
        menuButton.addEventListener('mouseleave', () => {
            menuButton.style.background = 'rgba(37, 42, 51, 0.6)';
            menuButton.style.transform = 'translateX(0)';
        });
        
        menuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            category.action();
            hideContextMenu();
        });
        
        contextMenu.appendChild(menuButton);
    });
    
    document.body.appendChild(contextMenu);
}

// 컨텍스트 메뉴 표시
function showContextMenu(x, y) {
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
    
    // 화면 경계 확인 및 조정
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
    }
}

// 컨텍스트 메뉴 숨김
function hideContextMenu() {
    contextMenu.style.display = 'none';
}

// 현재 선택된 이미지 반환
function getCurrentSelectedImage() {
    return selectedImage;
}

// 슬라이더 패널 열기
function openSliderPanel(mode) {
    const image = getCurrentSelectedImage();
    if (!image) return;

    // 이미지의 화면상 위치 계산
    const imageRect = getNodeRect(image);
    
    // Stage 변환 고려한 화면 좌표 계산
    const stagePos = stage.getAbsolutePosition();
    const stageScale = stage.scaleX();
    
    const screenRect = {
        x: (imageRect.x * stageScale) + stagePos.x,
        y: (imageRect.y * stageScale) + stagePos.y,
        width: imageRect.width * stageScale,
        height: imageRect.height * stageScale
    };

    hideContextMenu();
    showSliderPanel(image, mode, screenRect);
}

// --- Crop Mode UI --- //

function createCropModeSelector() {
    if (cropModeSelector) return;

    cropModeSelector = document.createElement('div');
    cropModeSelector.style.cssText = `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(30, 30, 30, 0.85);
        padding: 8px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        z-index: 1001;
        display: none;
        gap: 10px;
        backdrop-filter: blur(5px);
    `;

    const rectButton = document.createElement('button');
    rectButton.textContent = '사각형';
    rectButton.onclick = () => {
        hideCropModeSelector();
        startCropMode(getCurrentSelectedImage());
    };

    const lassoButton = document.createElement('button');
    lassoButton.textContent = '자유 모양';
    lassoButton.onclick = () => {
        hideCropModeSelector();
        activateLassoCrop(getCurrentSelectedImage());
    };

    const cancelButton = document.createElement('button');
    cancelButton.textContent = '취소';
    cancelButton.onclick = () => {
        hideCropModeSelector();
    };
    
    [rectButton, lassoButton, cancelButton].forEach(button => {
        button.style.cssText = `
            background: #4a4a4a;
            color: white;
            border: 1px solid #666;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        `;
        button.onmouseenter = () => button.style.background = '#666';
        button.onmouseleave = () => button.style.background = '#4a4a4a';
    });

    cropModeSelector.appendChild(rectButton);
    cropModeSelector.appendChild(lassoButton);
    cropModeSelector.appendChild(cancelButton);
    document.body.appendChild(cropModeSelector);
}

function showCropModeSelector() {
    if (!cropModeSelector) {
        createCropModeSelector();
    }
    cropModeSelector.style.display = 'flex';
}

function hideCropModeSelector() {
    if (cropModeSelector) {
        cropModeSelector.style.display = 'none';
    }
}

function startCropTool() {
    const image = getCurrentSelectedImage();
    if (!image) return;
    
    hideContextMenu();
    showCropModeSelector();
}

// --- End Crop Mode UI --- //

function deleteImage() {
    const image = getCurrentSelectedImage();
    if (!image) return;
    
    image.destroy();
    layer.batchDraw();
    hideContextMenu();
}

function resetEffects() {
    const image = getCurrentSelectedImage();
    if (!image) return;
    
    const currentFilters = image.filters() || [];
    const filteredFilters = currentFilters.filter(f => 
        f !== Konva.Filters.Blur && 
        f !== Konva.Filters.Enhance
    );
    
    image.blurRadius(0);
    image.enhance(0);
    image.filters(filteredFilters);
    image.clearCache();
    layer.batchDraw();
}

// 외부 API 함수들
export function applyBrightnessContrast(imageNode, brightness, contrast) {
    imageNode.cache();
    imageNode.brightness(brightness);
    imageNode.contrast(contrast);
    imageNode.filters([Konva.Filters.Brighten, Konva.Filters.Contrast]);
    layer.batchDraw();
}

export function rotateImageByAngle(imageNode, angle) {
    imageNode.rotation(imageNode.rotation() + (angle * Math.PI / 180));
    layer.batchDraw();
}

export { showContextMenu, hideContextMenu };
