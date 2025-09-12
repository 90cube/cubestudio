// components/imageEditor/imageEditor.js
import { init as initTransform, rotate, flip } from './tools/transform.js';
import { init as initFilters, adjustBrightness, adjustContrast, applyColorFilter, applyBlur, applySharpen, resetFilters } from './tools/filters.js';
import { init as initCrop, startCropMode, applyCrop, cancelCropMode, isCropMode, activateLassoCrop } from './tools/crop.js';
import { init as initTransformer, startTransformMode, exitTransformMode, isTransformModeActive } from './tools/transformer.js';
import { init as initPainting, startPainting, stopPainting, isActive as isPaintingActive } from './tools/painting/index.js';
import { setSelectedImage } from '../canvas/canvas.js';
import { registerShortcut } from '../keyboardManager/keyboardManager.js';
import { init as initSliderPanel, showSliderPanel, hideSliderPanel } from './sliderPanel.js';
import { getNodeRect } from '../../core/coordinates.js';
import { openPreprocessingPanel, getImageTypeInfo } from '../preprocessing/preprocessorManager.js';
import { init as initOpacitySlider, showOpacitySlider, hideOpacitySlider } from './opacitySlider.js';

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
    initPainting(stage, layer); // Initialize painting system
    initSliderPanel(); // Initialize slider panel
    initOpacitySlider(stage); // Initialize opacity slider
    
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
            
            // 전처리된 이미지인 경우 불투명도 슬라이더 표시
            const imageType = clickedNode.getAttr('imageType');
            if (imageType === 'preproc') {
                console.log('🎚️ Preprocessed image detected, showing opacity slider');
                hideContextMenu(); // 컨텍스트 메뉴는 숨기고
                showOpacitySlider(clickedNode); // 불투명도 슬라이더 표시
            } else {
                // 일반 이미지인 경우 컨텍스트 메뉴 표시
                hideOpacitySlider(); // 불투명도 슬라이더는 숨기고
                const pos = stage.getPointerPosition();
                showContextMenu(pos.x, pos.y);
            }
        } else {
            hideContextMenu();
            hideOpacitySlider();
        }
    });

    // 다른 곳 클릭시 컨텍스트 메뉴와 슬라이더 숨김
    stage.on('click tap', (e) => {
        if (e.target === stage || e.target.className === 'Rect') {
            hideContextMenu();
            hideSliderPanel(); // Also hide slider panel
            hideOpacitySlider(); // Also hide opacity slider
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
    
    document.body.appendChild(contextMenu);
}

// 컨텍스트 메뉴 내용 업데이트
function updateContextMenuContent() {
    if (!contextMenu) return;
    
    // 기존 내용 지우기
    contextMenu.innerHTML = '';
    
    // 현재 선택된 이미지의 타입 정보 가져오기
    const currentImage = getCurrentSelectedImage();
    const typeInfo = getImageTypeInfo(currentImage);
    const imageType = typeInfo ? typeInfo.imageType : 'normal';
    
    // 이미지 타입 표시 헤더
    const typeHeader = document.createElement('div');
    typeHeader.style.cssText = `
        padding: 8px 14px;
        background: rgba(108, 182, 255, 0.15);
        border-bottom: 1px solid rgba(134, 142, 150, 0.2);
        margin-bottom: 4px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        color: #6cb6ff;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    `;
    
    const typeIcon = imageType === 'preproc' ? '⚙️' : '📷';
    const typeText = imageType === 'preproc' ? 'Preprocessed' : 'Normal';
    typeHeader.innerHTML = `<span>${typeIcon} ${typeText}</span>`;
    
    contextMenu.appendChild(typeHeader);
    
    // 단일 기능 메뉴 아이템들 생성
    const menuItems = [
        {
            category: 'Change Type',
            icon: '🏷️',
            action: () => toggleImageType(),
            isDirectAction: true,
            style: 'color: #9ca3af; font-weight: 400; font-size: 12px;'
        },
        {
            category: 'Painting',
            icon: '🎨',
            action: () => startImagePainting(),
            isDirectAction: true,
            style: 'color: #ff6b6b; font-weight: 600; font-size: 13px;'
        },
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
            category: '이미지 전처리',
            icon: '🎛️',
            action: () => openImagePreprocessing(),
            isDirectAction: true,
            style: 'color: #3498db; font-weight: 500;'
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
}

// 컨텍스트 메뉴 표시
function showContextMenu(x, y) {
    // 메뉴 내용을 현재 선택된 이미지 정보로 업데이트
    updateContextMenuContent();
    
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

/**
 * 이미지 전처리 패널 열기
 */
function openImagePreprocessing() {
    const image = getCurrentSelectedImage();
    if (!image) {
        console.warn('No image selected for preprocessing');
        return;
    }
    
    console.log('Opening preprocessing panel for image:', image);
    
    try {
        openPreprocessingPanel(image);
    } catch (error) {
        console.error('Failed to open preprocessing panel:', error);
        alert('이미지 전처리 기능을 준비 중입니다...');
    }
}

/**
 * 이미지 타입 토글 (normal ↔ preproc)
 */
function toggleImageType() {
    const image = getCurrentSelectedImage();
    if (!image) {
        console.warn('No image selected for type change');
        return;
    }
    
    const typeInfo = getImageTypeInfo(image);
    const currentType = typeInfo ? typeInfo.imageType : 'normal';
    const newType = currentType === 'normal' ? 'preproc' : 'normal';
    
    // 이미지 노드 속성 업데이트
    image.setAttr('imageType', newType);
    
    // 타입 변경 시 추가 속성도 업데이트
    if (newType === 'preproc') {
        image.setAttr('processingSource', 'manual');
        image.setAttr('createdAt', new Date().toISOString());
    } else {
        // normal로 바뀔 때는 전처리 관련 속성 제거
        image.setAttr('processingSource', 'user');
        image.setAttr('originalImageId', null);
        image.setAttr('processingParams', {});
    }
    
    console.log(`🏷️ Image type changed: ${currentType} → ${newType}`);
    
    // 메뉴 닫기 (변경 사항이 바로 보이도록)
    hideContextMenu();
    
    // 변경 완료 알림 (선택사항)
    // alert(`Image type changed to: ${newType === 'preproc' ? 'Preprocessed' : 'Normal'}`);
}

/**
 * 이미지 페인팅 모드 시작
 */
function startImagePainting() {
    const image = getCurrentSelectedImage();
    if (!image) {
        console.warn('No image selected for painting');
        return;
    }
    
    console.log('🎨 Starting painting mode for image:', image);
    
    // 컨텍스트 메뉴 숨기기
    hideContextMenu();
    hideSliderPanel();
    hideOpacitySlider();
    
    // 페인팅 모드 활성화
    const success = startPainting(image);
    if (success) {
        console.log('✅ Painting mode activated successfully');
    } else {
        console.error('❌ Failed to activate painting mode');
        alert('페인팅 모드를 시작할 수 없습니다.');
    }
}

export { showContextMenu, hideContextMenu };