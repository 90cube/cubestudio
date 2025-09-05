// components/canvas/canvas.js

import { exitTransformMode, isTransformModeActive } from '../imageEditor/tools/transformer.js';
import stateManager from '../../core/stateManager.js';
import { getNodeRect, init as initCoordinates } from '../../core/coordinates.js';
import { showElementsMenu, isElementsMenuOpen } from '../elementsMenu/elementsMenu.js';

let stage;
let layer;
let isPanning = false;
let lastPointerPosition;
let selectedImage = null; // 현재 선택된 이미지 추적
let selectionHighlight = null; // 선택 하이라이트 사각형

// 디버깅용 선택 상태 추적
let selectionHistory = [];

export function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id #${containerId} not found.`);
        return;
    }

    // 1. Konva Stage 생성 (전체 화면)
    stage = new Konva.Stage({
        container: containerId,
        width: window.innerWidth,
        height: window.innerHeight,
        draggable: false, // 스테이지 자체 드래그 비활성화
    });

    layer = new Konva.Layer();
    stage.add(layer);
    
    // coordinates 시스템 초기화
    initCoordinates(stage);

    // 무한 캔버스를 위한 배경 (매우 큰 사각형)
    const background = new Konva.Rect({
        x: -50000,
        y: -50000,
        width: 100000,
        height: 100000,
        fill: '#f0f0f0', // 연한 회색 배경
    });
    layer.add(background);
    layer.draw();

    // 창 크기 변경 시 스테이지 크기 조절
    window.addEventListener('resize', () => {
        stage.width(window.innerWidth);
        stage.height(window.innerHeight);
        layer.draw();
    });

    // 키보드 이벤트 (스페이스바 팬닝, 트랜스폼)
    setupKeyboardEvents(container);

    // 마우스 휠 줌
    setupWheelZoom();

    // 마우스 팬닝 (스페이스바 + 드래그)
    setupMousePanning();

    // 드래그 앤 드롭 이벤트 리스너 설정
    setupDragAndDrop();
    
    // 이미지 선택 추적 설정
        setupImageSelection();

        // 더블클릭 이벤트 설정
        setupDoubleClickEvent();

        // isImageSelected 초기 상태 설정
        stateManager.updateState('isImageSelected', false);
}

// 키보드 이벤트 설정 (스페이스바 팬닝)
function setupKeyboardEvents(container) {
    let spacePressed = false;

    document.addEventListener('keydown', (e) => {
        console.log('🎹 Key pressed:', e.code, 'selectedImage:', !!selectedImage);
        
        if (e.code === 'Space' && !spacePressed) {
            e.preventDefault();
            spacePressed = true;
            container.classList.add('panning');
        }
        
        // Delete 키로 선택된 이미지 삭제
        if (e.code === 'Delete' || e.code === 'Backspace') {
            console.log('🗑️ Delete/Backspace key detected, selectedImage:', selectedImage);
            if (selectedImage) {
                e.preventDefault();
                deleteSelectedImage();
            } else {
                console.log('⚠️ No image selected for deletion');
            }
        }
        
        // T키와 Escape 키 처리는 app.js의 키보드 매니저에서 담당
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            spacePressed = false;
            isPanning = false;
            container.classList.remove('panning');
        }
    });
}

// 마우스 휠 줌 설정
function setupWheelZoom() {
    const scaleBy = 1.1;
    stage.on('wheel', (e) => {
        e.evt.preventDefault();

        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        let direction = e.evt.deltaY > 0 ? -1 : 1;
        
        // 무한 줌을 위해 스케일 제한 제거
        const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

        stage.scale({ x: newScale, y: newScale });

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };
        stage.position(newPos);
        layer.batchDraw();
    });
}

// 마우스 팬닝 설정
function setupMousePanning() {
    stage.on('mousedown touchstart', (e) => {
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            isPanning = true;
            lastPointerPosition = stage.getPointerPosition();
        }
    });

    stage.on('mousemove touchmove', (e) => {
        if (!isPanning) return;

        e.evt.preventDefault();
        const newPointerPosition = stage.getPointerPosition();
        
        const dx = newPointerPosition.x - lastPointerPosition.x;
        const dy = newPointerPosition.y - lastPointerPosition.y;

        stage.x(stage.x() + dx);
        stage.y(stage.y() + dy);
        layer.batchDraw();

        lastPointerPosition = newPointerPosition;
    });

    stage.on('mouseup touchend', () => {
        isPanning = false;
    });
}

// 드래그 앤 드롭 설정
function setupDragAndDrop() {
    const stageContainer = stage.container();
    
    stageContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    stageContainer.addEventListener('drop', (e) => {
        e.preventDefault();

        // 팬닝 모드에서는 드롭 비활성화
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            return;
        }

        // 마우스 포인터 위치 계산 (현재 뷰포트와 줌 레벨 고려)
        stage.setPointersPositions(e);
        const pos = stage.getPointerPosition();
        
        // 실제 캔버스 좌표로 변환
        const transform = stage.getAbsoluteTransform().copy();
        transform.invert();
        const realPos = transform.point(pos);

        // 엘리먼츠 메뉴에서 드래그된 이미지 처리
        const elementData = e.dataTransfer.getData('application/element-data');
        if (elementData) {
            try {
                const data = JSON.parse(elementData);
                if (data.type === 'element' && data.path) {
                    const img = new window.Image();
                    img.onload = () => {
                        addImageToCanvas(img, realPos.x, realPos.y);
                        console.log('📦 Element dropped on canvas:', data.name);
                    };
                    img.onerror = () => {
                        console.error('❌ Failed to load element image:', data.path);
                    };
                    img.src = data.path;
                    return;
                }
            } catch (error) {
                console.error('❌ Error parsing element data:', error);
            }
        }

        // 일반 이미지 URL 드롭 처리
        const imageUrl = e.dataTransfer.getData('text/plain');
        if (imageUrl && (imageUrl.startsWith('./') || imageUrl.startsWith('http'))) {
            const img = new window.Image();
            img.onload = () => {
                addImageToCanvas(img, realPos.x, realPos.y);
                console.log('📦 Image URL dropped on canvas:', imageUrl);
            };
            img.onerror = () => {
                console.error('❌ Failed to load image from URL:', imageUrl);
            };
            img.src = imageUrl;
            return;
        }

        // 드롭된 파일 처리
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = () => {
                    const img = new window.Image();
                    img.src = reader.result;
                    img.onload = () => {
                        addImageToCanvas(img, realPos.x, realPos.y);
                        console.log('📷 File dropped on canvas:', file.name);
                    };
                };
                reader.readAsDataURL(file);
            }
        }
    });
}

/**
 * 캔버스에 이미지를 추가하는 함수
 * @param {Image} imageObject - JavaScript Image 객체
 * @param {number} x - 이미지가 추가될 x 좌표
 * @param {number} y - 이미지가 추가될 y 좌표
 */
function addImageToCanvas(imageObject, x, y) {
    const konvaImage = new Konva.Image({
        image: imageObject,
        x: x,
        y: y,
        draggable: true, // 드래그 가능하도록 설정
    });

    // 이미지의 중심이 마우스 포인터 위치에 오도록 좌표 보정
    konvaImage.offsetX(konvaImage.width() / 2);
    konvaImage.offsetY(konvaImage.height() / 2);

    // 이미지 드래그 시 하이라이트 업데이트
    konvaImage.on('dragmove', () => {
        if (selectedImage === konvaImage) {
            updateHighlightPosition();
        }
    });

    layer.add(konvaImage);
    layer.batchDraw();
    
    // console.log('📷 New image added to canvas');
}

/**
 * 더블클릭 이벤트 설정 - 배경 컨텍스트 메뉴 표시 (단순화된 버전)
 */
function setupDoubleClickEvent() {
    stage.on('dblclick dbltap', (e) => {
        console.log('🖱️ Double-click detected on:', e.target.className);
        
        // 팬닝 모드에서는 더블클릭 비활성화
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            console.log('⚠️ Double-click ignored - panning mode');
            return;
        }

        // 이미지를 더블클릭한 경우는 제외
        if (e.target.className === 'Image') {
            console.log('⚠️ Double-click ignored - image clicked');
            return;
        }

        // 배경을 더블클릭한 경우만 처리
        if (e.target.className === 'Rect') {
            // 마우스 포인터 위치 계산
            const pointer = stage.getPointerPosition();
            const canvasContainer = document.getElementById('canvas-container');
            const rect = canvasContainer.getBoundingClientRect();
            
            // 실제 화면 좌표로 변환
            const x = pointer.x + rect.left;
            const y = pointer.y + rect.top;
            
            console.log('🎯 Background double-clicked, showing context menu at:', x, y);
            
            // 이벤트 전파 중지로 document 클릭 방지
            if (e.evt) {
                e.evt.preventDefault();
                e.evt.stopPropagation();
                e.evt.stopImmediatePropagation();
            }
            
            // 다음 프레임에서 메뉴 표시
            requestAnimationFrame(() => {
                showBackgroundContextMenu(x, y);
            });
        }
    });
    
    // 전역 클릭 리스너 추가 (메뉴 외부 클릭시 메뉴 숨김) - 지연 등록
    setTimeout(() => {
        document.addEventListener('click', (e) => {
            if (isContextMenuVisible && backgroundContextMenu && !backgroundContextMenu.contains(e.target)) {
                console.log('📋 Clicking outside menu - hiding context menu');
                hideBackgroundContextMenu();
            }
        });
        console.log('📋 Global click listener registered');
    }, 100); // 100ms 지연으로 더블클릭 이벤트와 분리
}

/**
 * 엘리먼츠 메뉴에서 캔버스로 이미지를 추가하는 전역 함수
 * (elementsMenu.js에서 호출됨)
 */
window.addImageToCanvasFromElementsMenu = function(imageObject, screenX, screenY) {
    // 화면 좌표를 캔버스 좌표로 변환
    const canvasContainer = document.getElementById('canvas-container');
    const rect = canvasContainer.getBoundingClientRect();
    
    // 화면 좌표를 스테이지 좌표로 변환
    const stageX = screenX - rect.left;
    const stageY = screenY - rect.top;
    
    // 스테이지 변환 (줌, 팬닝) 고려하여 실제 캔버스 좌표로 변환
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const canvasPos = transform.point({ x: stageX, y: stageY });
    
    // 기존 addImageToCanvas 함수 사용
    addImageToCanvas(imageObject, canvasPos.x, canvasPos.y);
    
    console.log('📦 Element added to canvas at canvas coordinates:', canvasPos);
};

// 외부에서 stage와 layer에 접근할 수 있도록 export
export function getStage() {
    return stage;
}

export function getLayer() {
    return layer;
}

// 이미지 선택 추적 설정
function setupImageSelection() {
    stage.on('click tap', (e) => {
        // console.log('Stage clicked - target:', e.target.className, e.target);
        
        // 팬닝 모드에서는 선택 비활성화
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            // console.log('Panning mode - selection disabled');
            return;
        }
        
        const clickedNode = e.target;
        
        // 이미지가 클릭되었으면 선택 상태로 설정
        if (clickedNode.className === 'Image' || clickedNode.name() === 'image-group') {
            // 다른 이미지를 선택했을 때 기존 트랜스폼 완전 종료
            if (selectedImage && selectedImage !== clickedNode && isTransformModeActive()) {
                // console.log('🔄 Different image selected - exiting previous transform mode');
                exitTransformMode();
            }
            
            // 기존 선택된 이미지 하이라이트 제거
            clearImageHighlight();
            
            selectedImage = clickedNode;
            
            // 디버깅: stateManager 호출 전 상태 확인
            // console.log('🔄 Before updateState - isImageSelected will be set to TRUE');
            // console.log('🔄 StateManager instance:', stateManager);
            // console.log('🔄 StateManager updateState method:', typeof stateManager.updateState);
            
            stateManager.updateState('isImageSelected', true);
            
            // 디버깅: stateManager 호출 후 상태 확인
            const currentState = stateManager.getState('isImageSelected');
            // console.log('✅ After updateState - current isImageSelected state:', currentState);

            // 디버깅용 선택 히스토리 추가
            selectionHistory.push({
                timestamp: Date.now(),
                action: 'selected',
                imageId: selectedImage.id() || 'no-id',
                imageClassName: selectedImage.className,
                stateManagerCallSuccess: currentState === true
            });
            
            // 선택된 이미지 하이라이트 적용
            highlightSelectedImage(selectedImage);
            
            // console.log('✅ Image selected successfully:', selectedImage);
            // console.log('✅ selectedImage stored:', {
            //     className: selectedImage.className,
            //     id: selectedImage.id(),
            //     position: { x: selectedImage.x(), y: selectedImage.y() }
            // });
            // console.log('✅ Selection history:', selectionHistory.slice(-3)); // 최근 3개만 표시
        } else if (clickedNode.className === 'Rect') {
            // 배경을 클릭했을 때 트랜스폼 종료 및 선택 해제
            if (isTransformModeActive()) {
                // console.log('🔄 Background clicked - exiting transform mode');
                exitTransformMode();
            }
            
            // 배경 컨텍스트 메뉴 숨김
            hideBackgroundContextMenu();
            
            clearImageHighlight();
            selectedImage = null;
            
            // 디버깅: stateManager 호출 전 상태 확인
            // console.log('🔄 Before updateState - isImageSelected will be set to FALSE');
            
            stateManager.updateState('isImageSelected', false);
            
            // 디버깅: stateManager 호출 후 상태 확인
            const currentState = stateManager.getState('isImageSelected');
            // console.log('❌ After updateState - current isImageSelected state:', currentState);

            // 디버깅용 선택 히스토리 추가
            selectionHistory.push({
                timestamp: Date.now(),
                action: 'cleared',
                reason: 'background-clicked',
                stateManagerCallSuccess: currentState === false
            });
            
            // console.log('❌ Image selection cleared (background clicked)');
            // console.log('❌ Selection history:', selectionHistory.slice(-3));
        } else {
            // console.log('⚠️ Clicked element is not an image:', clickedNode.className);
        }
    });
}

// 현재 선택된 이미지 반환
export function getSelectedImage() {
    // console.log('🔍 getSelectedImage() called - selectedImage:', selectedImage);
    // console.log('🔍 selectedImage type:', typeof selectedImage);
    // console.log('🔍 Recent selection history:', selectionHistory.slice(-3));
    
    if (selectedImage) {
        // console.log('🔍 selectedImage properties:', {
        //     className: selectedImage.className,
        //     id: selectedImage.id(),
        //     x: selectedImage.x(),
        //     y: selectedImage.y()
        // });
        
        // 이미지가 여전히 stage에 존재하는지 확인
        const imageStillExists = selectedImage.getStage() !== null;
        // console.log('🔍 Image still exists on stage:', imageStillExists);
        
        if (!imageStillExists) {
            // console.log('⚠️ Selected image no longer exists on stage - clearing selection');
            selectedImage = null;
            clearImageHighlight();
        }
    } else {
        // console.log('🔍 No image currently selected');
    }
    
    return selectedImage;
}

// 선택된 이미지 설정
export function setSelectedImage(image) {
    selectedImage = image;
}

// 선택된 이미지 삭제 (외부에서 호출 가능)
export function deleteSelectedImage() {
    if (!selectedImage) return;
    
    console.log('🗑️ Deleting selected image:', selectedImage.className, selectedImage.id());
    
    // 트랜스폼 모드가 활성화되어 있다면 먼저 종료
    if (isTransformModeActive()) {
        exitTransformMode();
    }
    
    // 하이라이트 제거
    clearImageHighlight();
    
    // 이미지 삭제
    selectedImage.destroy();
    
    // 선택 상태 초기화
    selectedImage = null;
    stateManager.updateState('isImageSelected', false);
    
    // 디버깅용 선택 히스토리 추가
    selectionHistory.push({
        timestamp: Date.now(),
        action: 'deleted',
        reason: 'delete-key-pressed'
    });
    
    // 레이어 다시 그리기
    layer.batchDraw();
    
    console.log('✅ Selected image deleted successfully');
}

// 이미지 하이라이트 함수들
function highlightSelectedImage(image) {
    if (!image) return;
    
    clearImageHighlight();
    
    // Use the new utility to get the correct stage-space rectangle
    const box = getNodeRect(image);
    
    selectionHighlight = new Konva.Rect({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        stroke: '#00aaff',
        strokeWidth: 2 / getStage().scaleX(),
        listening: false,
        name: 'selection-highlight'
    });
    
    selectionHighlight._selectedImageRef = image;
    
    layer.add(selectionHighlight);
    layer.batchDraw();
}

function clearImageHighlight() {
    if (selectionHighlight) {
        selectionHighlight.destroy();
        selectionHighlight = null;
        layer.batchDraw();
    }
}

function updateHighlightPosition() {
    if (selectionHighlight && selectedImage) {
        // Use the new utility here as well
        const box = getNodeRect(selectedImage);

        selectionHighlight.position({ x: box.x, y: box.y });
        selectionHighlight.size({ width: box.width, height: box.height });
        selectionHighlight.strokeWidth(2 / getStage().scaleX());
        layer.batchDraw();
    }
}

// 배경 컨텍스트 메뉴 관련 변수들
let backgroundContextMenu = null;
let isContextMenuVisible = false;

/**
 * 배경 컨텍스트 메뉴 생성 (단순하고 확실한 방법)
 */
function createBackgroundContextMenu() {
    // 기존 메뉴가 있으면 제거
    if (backgroundContextMenu) {
        backgroundContextMenu.remove();
        backgroundContextMenu = null;
    }

    // 새 메뉴 생성
    backgroundContextMenu = document.createElement('div');
    backgroundContextMenu.id = 'canvas-context-menu';
    
    // 매우 단순하고 확실한 스타일링 (테스트용으로 높은 가시성)
    backgroundContextMenu.style.position = 'fixed';
    backgroundContextMenu.style.background = '#1e293b';
    backgroundContextMenu.style.border = '2px solid #0ea5e9';
    backgroundContextMenu.style.borderRadius = '12px';
    backgroundContextMenu.style.padding = '12px';
    backgroundContextMenu.style.zIndex = '99999';
    backgroundContextMenu.style.display = 'none';
    backgroundContextMenu.style.fontFamily = 'Arial, sans-serif';
    backgroundContextMenu.style.fontSize = '16px';
    backgroundContextMenu.style.color = '#ffffff';
    backgroundContextMenu.style.minWidth = '180px';
    backgroundContextMenu.style.boxShadow = '0 8px 25px rgba(0,0,0,0.7), 0 0 0 1px rgba(14, 165, 233, 0.3)';

    // 메뉴 아이템 데이터
    const menuItems = [
        { icon: '📦', label: 'Add Elements', action: openElementsMenu },
        { icon: '🖼️', label: 'Add Image', action: openFileDialog },
        { icon: '📝', label: 'Add Text', action: addTextElement }
    ];

    // 메뉴 아이템 생성
    menuItems.forEach(item => {
        const button = document.createElement('div');
        button.style.padding = '8px 12px';
        button.style.cursor = 'pointer';
        button.style.borderRadius = '4px';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.gap = '8px';
        
        // 호버 효과
        button.onmouseenter = () => {
            button.style.background = '#3a4750';
        };
        button.onmouseleave = () => {
            button.style.background = '';
        };
        
        // 클릭 이벤트
        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideBackgroundContextMenu();
            item.action();
        };
        
        // 아이콘과 텍스트 추가
        button.innerHTML = `<span>${item.icon}</span><span>${item.label}</span>`;
        
        backgroundContextMenu.appendChild(button);
    });

    // body에 추가
    document.body.appendChild(backgroundContextMenu);
    
    console.log('✅ Context menu created successfully');
}

/**
 * 배경 컨텍스트 메뉴 표시 (단순하고 확실한 방법)
 */
async function showBackgroundContextMenu(x, y) {
    console.log('📋 Showing background context menu at:', x, y);
    
    // 기존에 열린 엘리먼츠 메뉴가 있으면 닫기
    if (isElementsMenuOpen()) {
        const { hideElementsMenu } = await import('../elementsMenu/elementsMenu.js');
        hideElementsMenu();
    }
    
    // 기존 메뉴 숨김
    hideBackgroundContextMenu();
    
    // 메뉴 생성 또는 재생성
    createBackgroundContextMenu();
    
    // 위치 설정
    backgroundContextMenu.style.left = x + 'px';
    backgroundContextMenu.style.top = y + 'px';
    
    // 표시
    backgroundContextMenu.style.display = 'block';
    isContextMenuVisible = true;
    
    // 화면 경계 체크 및 조정
    setTimeout(() => {
        const rect = backgroundContextMenu.getBoundingClientRect();
        let newX = x;
        let newY = y;
        
        if (rect.right > window.innerWidth) {
            newX = window.innerWidth - rect.width - 10;
        }
        if (rect.bottom > window.innerHeight) {
            newY = window.innerHeight - rect.height - 10;
        }
        
        backgroundContextMenu.style.left = newX + 'px';
        backgroundContextMenu.style.top = newY + 'px';
        
        console.log('✅ Context menu positioned at:', newX, newY);
    }, 0);
}

/**
 * 배경 컨텍스트 메뉴 숨김 (단순하고 확실한 방법)
 */
function hideBackgroundContextMenu() {
    if (backgroundContextMenu) {
        backgroundContextMenu.style.display = 'none';
        isContextMenuVisible = false;
        console.log('❌ Context menu hidden');
    }
}

/**
 * 엘리먼츠 메뉴 열기 (컨텍스트 메뉴에서 호출)
 */
async function openElementsMenu() {
    // 현재 마우스 위치 또는 화면 중앙에 엘리먼츠 메뉴 표시
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    console.log('📦 Opening elements menu from context menu');
    showElementsMenu(centerX, centerY);
}

/**
 * 파일 다이얼로그 열기
 */
function openFileDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new window.Image();
                img.src = reader.result;
                img.onload = () => {
                    // 화면 중앙에 이미지 추가
                    const centerX = 0; // 캔버스 좌표계에서의 중앙
                    const centerY = 0;
                    addImageToCanvas(img, centerX, centerY);
                    console.log('🖼️ Image added from file dialog');
                };
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

/**
 * 텍스트 엘리먼트 추가
 */
function addTextElement() {
    // TODO: 텍스트 추가 기능 구현
    console.log('📝 Text element addition - to be implemented');
    // 임시로 알림 표시
    alert('텍스트 추가 기능은 추후 구현될 예정입니다.');
}

