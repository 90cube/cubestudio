// components/imageEditor/imageEditor.js
import { init as initTransform, rotate, flip } from './tools/transform.js';
import { init as initFilters, adjustBrightness, adjustContrast, applyColorFilter, applyBlur, applySharpen, resetFilters } from './tools/filters.js';
import { init as initCrop, startCropMode, applyCrop, cancelCropMode, isCropMode } from './tools/crop.js';
import { init as initTransformer, startTransformMode, exitTransformMode, isTransformModeActive } from './tools/transformer.js';
import { setSelectedImage } from '../canvas/canvas.js';

let stage;
let layer;
let contextMenu;
let selectedImage;

export function init(konvaStage, konvaLayer) {
    stage = konvaStage;
    layer = konvaLayer;
    
    // 도구 모듈들 초기화
    initTransform(layer);
    initFilters(layer);
    initCrop(stage, layer);
    initTransformer(stage, layer);
    
    setupContextMenu();
    setupDoubleClickHandler();
    
    console.log('Image Editor initialized');
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
        if (clickedNode.className === 'Image') {
            selectedImage = clickedNode;
            // 캔버스의 선택 상태도 동기화
            setSelectedImage(clickedNode);
            console.log('Image selected for editing:', selectedImage);
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
        }
    });
}

// 컨텍스트 메뉴 UI 생성
function setupContextMenu() {
    contextMenu = document.createElement('div');
    contextMenu.className = 'image-editor-context-menu';
    contextMenu.style.cssText = `
        position: fixed;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 8px;
        z-index: 1000;
        display: none;
        font-family: Arial, sans-serif;
        font-size: 14px;
        min-width: 250px;
        max-height: 80vh;
        overflow-y: auto;
    `;
    
    // 트리 구조 메뉴 아이템들 생성
    const menuItems = [
        {
            category: 'Transform',
            icon: '🔄',
            subcategories: [
                {
                    label: 'Flip',
                    items: [
                        { label: 'Flip Horizontal', action: () => flip(getCurrentSelectedImage(), 'horizontal') },
                        { label: 'Flip Vertical', action: () => flip(getCurrentSelectedImage(), 'vertical') }
                    ]
                }
            ]
        },
        {
            category: 'Adjust',
            icon: '🎛️',
            subcategories: [
                {
                    label: 'Brightness',
                    items: [
                        { label: 'Brighter (+20%)', action: () => {
                            const img = getCurrentSelectedImage();
                            adjustBrightness(img, (img.brightness() || 0) + 0.2);
                        }},
                        { label: 'Darker (-20%)', action: () => {
                            const img = getCurrentSelectedImage();
                            adjustBrightness(img, (img.brightness() || 0) - 0.2);
                        }},
                        { label: 'Reset Brightness', action: () => adjustBrightness(getCurrentSelectedImage(), 0) }
                    ]
                },
                {
                    label: 'Contrast',
                    items: [
                        { label: 'More Contrast (+20)', action: () => {
                            const img = getCurrentSelectedImage();
                            adjustContrast(img, (img.contrast() || 0) + 20);
                        }},
                        { label: 'Less Contrast (-20)', action: () => {
                            const img = getCurrentSelectedImage();
                            adjustContrast(img, (img.contrast() || 0) - 20);
                        }},
                        { label: 'Reset Contrast', action: () => adjustContrast(getCurrentSelectedImage(), 0) }
                    ]
                }
            ]
        },
        {
            category: 'Filters',
            icon: '🎨',
            subcategories: [
                {
                    label: 'Color Filters',
                    items: [
                        { label: 'Grayscale', action: () => applyColorFilter(getCurrentSelectedImage(), 'grayscale') },
                        { label: 'Sepia', action: () => applyColorFilter(getCurrentSelectedImage(), 'sepia') },
                        { label: 'Invert Colors', action: () => applyColorFilter(getCurrentSelectedImage(), 'invert') }
                    ]
                },
                {
                    label: 'Effects',
                    items: [
                        { label: 'Blur (Light)', action: () => applyBlur(getCurrentSelectedImage(), 1) },
                        { label: 'Blur (Medium)', action: () => applyBlur(getCurrentSelectedImage(), 3) },
                        { label: 'Blur (Heavy)', action: () => applyBlur(getCurrentSelectedImage(), 6) },
                        { label: 'Sharpen', action: () => applySharpen(getCurrentSelectedImage(), 0.3) }
                    ]
                },
                {
                    label: 'Reset',
                    items: [
                        { label: 'Reset Filters', action: () => resetFilters(getCurrentSelectedImage()) },
                        { label: 'Reset Effects', action: () => resetEffects() }
                    ]
                }
            ]
        },
        {
            category: 'Tools',
            icon: '🛠️',
            subcategories: [
                {
                    label: 'Edit Tools',
                    items: [
                        { label: 'Crop Image', action: () => startCropTool() }
                    ]
                },
                {
                    label: 'Actions',
                    items: [
                        { label: 'Delete Image', action: () => deleteImage(), style: 'color: #ff4444; font-weight: bold;' }
                    ]
                }
            ]
        }
    ];

    // 트리 구조 메뉴 렌더링
    menuItems.forEach(category => {
        const categoryHeader = document.createElement('div');
        categoryHeader.style.cssText = `
            font-weight: bold;
            color: #333;
            padding: 8px 12px;
            border-bottom: 1px solid #ddd;
            margin-bottom: 4px;
            background: linear-gradient(135deg, #f5f5f5, #e8e8e8);
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        `;
        
        const headerText = document.createElement('span');
        headerText.textContent = `${category.icon} ${category.category}`;
        
        const expandIcon = document.createElement('span');
        expandIcon.textContent = '▼';
        expandIcon.style.cssText = `
            font-size: 10px;
            transition: transform 0.2s;
            transform: rotate(-90deg);
        `;
        
        categoryHeader.appendChild(headerText);
        categoryHeader.appendChild(expandIcon);
        
        const subcategoriesContainer = document.createElement('div');
        subcategoriesContainer.style.cssText = `
            margin-left: 8px;
            border-left: 2px solid #eee;
            padding-left: 8px;
            margin-bottom: 8px;
            display: none;
        `;
        
        let isExpanded = false;
        
        categoryHeader.addEventListener('click', (e) => {
            e.stopPropagation();
            isExpanded = !isExpanded;
            subcategoriesContainer.style.display = isExpanded ? 'block' : 'none';
            expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
        });
        
        contextMenu.appendChild(categoryHeader);
        
        // 서브카테고리들 생성
        category.subcategories.forEach(subcategory => {
            const subcategoryHeader = document.createElement('div');
            subcategoryHeader.style.cssText = `
                font-weight: 600;
                color: #555;
                padding: 4px 8px;
                margin: 2px 0;
                font-size: 13px;
            `;
            subcategoryHeader.textContent = subcategory.label;
            subcategoriesContainer.appendChild(subcategoryHeader);
            
            // 서브카테고리 아이템들 생성
            subcategory.items.forEach(item => {
                const menuItem = document.createElement('div');
                menuItem.style.cssText = `
                    padding: 4px 16px;
                    cursor: pointer;
                    border-radius: 3px;
                    transition: background-color 0.2s;
                    font-size: 13px;
                    margin-left: 8px;
                    ${item.style || ''}
                `;
                menuItem.textContent = item.label;
                
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.backgroundColor = '#e3f2fd';
                });
                
                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.backgroundColor = '';
                });
                
                menuItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    item.action();
                    hideContextMenu();
                });
                
                subcategoriesContainer.appendChild(menuItem);
            });
        });
        
        contextMenu.appendChild(subcategoriesContainer);
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
    // 선택된 이미지 상태는 유지 (T키로 트랜스폼을 사용할 수 있도록)
    // selectedImage = null;
}

// 현재 선택된 이미지 반환
function getCurrentSelectedImage() {
    return selectedImage;
}

// 추가 도구 기능들
function startCropTool() {
    const image = getCurrentSelectedImage();
    if (!image) return;
    
    hideContextMenu();
    startCropMode(image);
}


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