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
        
        // 글로벌 인스턴스로 내보내기 (다른 모듈에서 접근 가능하도록)
        window.canvasInstance = {
            getLayer: getLayer,
            setSelectedImage: setSelectedImage,
            getSelectedImage: getSelectedImage,
            getStage: getStage
        };
}

// 키보드 이벤트 설정 (스페이스바 팬닝)
function setupKeyboardEvents(container) {
    let spacePressed = false;

    document.addEventListener('keydown', (e) => {
        // console.log('🎹 Key pressed:', e.code, 'selectedImage:', !!selectedImage);

        // 텍스트 입력 중인지 확인
        const activeElement = document.activeElement;
        const isTextInput = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true'
        );

        // 텍스트 입력 중이면 Canvas 단축키 무시
        if (isTextInput) {
            // console.log('⌨️ Text input active, ignoring canvas shortcuts');
            return;
        }

        if (e.code === 'Space' && !spacePressed) {
            e.preventDefault();
            spacePressed = true;
            container.classList.add('panning');
        }

        // Delete 키로 선택된 이미지 삭제
        if (e.code === 'Delete' || e.code === 'Backspace') {
            // console.log('🗑️ Delete/Backspace key detected, selectedImage:', selectedImage);
            if (selectedImage) {
                e.preventDefault();
                deleteSelectedImage();
            } else {
                // console.log('⚠️ No image selected for deletion');
            }
        }

        // T키와 Escape 키 처리는 app.js의 키보드 매니저에서 담당
    });

    document.addEventListener('keyup', (e) => {
        // 텍스트 입력 중인지 확인
        const activeElement = document.activeElement;
        const isTextInput = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true'
        );

        // 텍스트 입력 중이면 Canvas 단축키 무시
        if (isTextInput) {
            return;
        }

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
    
    // 레이어 패널 업데이트를 위한 커스텀 이벤트 발생
    const imageAddedEvent = new CustomEvent('canvasImageAdded', {
        detail: {
            imageNode: konvaImage,
            imageType: 'normal',
            source: 'user_upload'
        }
    });
    document.dispatchEvent(imageAddedEvent);
    
    console.log('📷 New image added to canvas and event dispatched');
}

/**
 * 더블클릭 이벤트 설정 - 배경 컨텍스트 메뉴 표시 (단순화된 버전)
 */
function setupDoubleClickEvent() {
    stage.on('dblclick dbltap', (e) => {
        // console.log('🖱️ Double-click detected on:', e.target.className);
        
        // 팬닝 모드에서는 더블클릭 비활성화
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            // console.log('⚠️ Double-click ignored - panning mode');
            return;
        }

        // 이미지를 더블클릭한 경우 - 전처리된 이미지라면 컨텍스트 메뉴 표시
        if (e.target.className === 'Image') {
            const imageType = e.target.getAttr('imageType');
            if (imageType === 'preproc') {
                // 전처리된 이미지 더블클릭 시 컨텍스트 메뉴 표시
                const pointer = stage.getPointerPosition();
                showPreprocessedImageContextMenu(e.target, pointer);
            }
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
            
            // console.log('🎯 Background double-clicked, showing context menu at:', x, y);
            
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
                // console.log('📋 Clicking outside menu - hiding context menu');
                hideBackgroundContextMenu();
            }
        });
        // console.log('📋 Global click listener registered');
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
            
            // 레이어 패널 업데이트를 위한 커스텀 이벤트 발생
            const imageSelectedEvent = new CustomEvent('canvasImageSelected', {
                detail: {
                    imageNode: selectedImage,
                    imageType: selectedImage.getAttr('imageType') || 'normal'
                }
            });
            document.dispatchEvent(imageSelectedEvent);
            
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
    
    console.log('🗑️ Deleting selected element:', selectedImage.className || selectedImage.name(), selectedImage.id());
    
    // 트랜스폼 모드가 활성화되어 있다면 먼저 종료
    if (isTransformModeActive()) {
        exitTransformMode();
    }
    
    // 하이라이트 제거
    clearImageHighlight();
    
    // 삭제될 이미지 정보 저장 (이벤트용)
    const deletedImageInfo = {
        imageType: selectedImage.getAttr('imageType') || 'normal',
        id: selectedImage.id() || selectedImage._id
    };
    
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
    
    // 레이어 패널 업데이트를 위한 커스텀 이벤트 발생
    const imageDeletedEvent = new CustomEvent('canvasImageDeleted', {
        detail: deletedImageInfo
    });
    document.dispatchEvent(imageDeletedEvent);
    
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

export function updateHighlightPosition() {
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
        { icon: '🎨', label: 'Create Blank Canvas', action: createBlankCanvas },
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
    
    // console.log('✅ Context menu created successfully');
}

/**
 * 배경 컨텍스트 메뉴 표시 (단순하고 확실한 방법)
 */
async function showBackgroundContextMenu(x, y) {
    // console.log('📋 Showing background context menu at:', x, y);
    
    // 더블클릭 위치를 저장 (텍스트 생성용)
    lastDoubleClickPosition = { x, y };
    
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
        
        // console.log('✅ Context menu positioned at:', newX, newY);
    }, 0);
}

/**
 * 배경 컨텍스트 메뉴 숨김 (단순하고 확실한 방법)
 */
function hideBackgroundContextMenu() {
    if (backgroundContextMenu) {
        backgroundContextMenu.style.display = 'none';
        isContextMenuVisible = false;
        // console.log('❌ Context menu hidden');
    }
}

/**
 * 엘리먼츠 메뉴 열기 (컨텍스트 메뉴에서 호출)
 */
async function openElementsMenu() {
    // 현재 마우스 위치 또는 화면 중앙에 엘리먼츠 메뉴 표시
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // console.log('📦 Opening elements menu from context menu');
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
                    // 더블클릭한 위치에 이미지 추가 (화면 좌표를 캔버스 좌표로 변환)
                    const canvasContainer = document.getElementById('canvas-container');
                    const rect = canvasContainer.getBoundingClientRect();
                    
                    // 화면 좌표를 스테이지 좌표로 변환
                    const stageX = lastDoubleClickPosition.x - rect.left;
                    const stageY = lastDoubleClickPosition.y - rect.top;
                    
                    // 스테이지 변환 (줌, 팬닝) 고려하여 실제 캔버스 좌표로 변환
                    const transform = stage.getAbsoluteTransform().copy();
                    transform.invert();
                    const canvasPos = transform.point({ x: stageX, y: stageY });
                    
                    addImageToCanvas(img, canvasPos.x, canvasPos.y);
                    console.log(`🖼️ Image added at clicked position: (${canvasPos.x.toFixed(1)}, ${canvasPos.y.toFixed(1)})`);
                };
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

// 마지막 더블클릭 위치 저장
let lastDoubleClickPosition = { x: 0, y: 0 };

/**
 * 텍스트 엘리먼트 추가
 */
function addTextElement(x, y) {
    // 더블클릭 위치가 전달되면 저장
    if (x !== undefined && y !== undefined) {
        lastDoubleClickPosition = { x, y };
    }
    
    // 텍스트 입력 모달 생성
    createTextInputModal();
}

/**
 * 텍스트 입력 모달 생성
 */
function createTextInputModal() {
    // 기존 모달이 있으면 제거
    const existingModal = document.getElementById('text-input-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // 모달 컨테이너 생성
    const modal = document.createElement('div');
    modal.id = 'text-input-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;

    // 모달 내용 컨테이너
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: #2a2a2a;
        border-radius: 12px;
        padding: 24px;
        min-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // 제목
    const title = document.createElement('h3');
    title.textContent = '텍스트 추가';
    title.style.cssText = `
        margin: 0 0 20px 0;
        color: #ffffff;
        font-size: 18px;
        font-weight: 600;
    `;

    // 텍스트 입력 영역
    const textInput = document.createElement('textarea');
    textInput.placeholder = '텍스트를 입력하세요...';
    textInput.style.cssText = `
        width: 100%;
        height: 100px;
        background: #3a3a3a;
        border: 1px solid #555;
        border-radius: 6px;
        padding: 12px;
        color: #ffffff;
        font-size: 14px;
        font-family: inherit;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
        margin-bottom: 16px;
    `;

    // 폰트 선택 영역
    const fontContainer = document.createElement('div');
    fontContainer.style.cssText = `
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        align-items: center;
        flex-wrap: wrap;
    `;

    const fontLabel = document.createElement('label');
    fontLabel.textContent = '폰트:';
    fontLabel.style.cssText = `
        color: #ccc;
        font-size: 14px;
        min-width: 50px;
    `;

    const fontSelect = document.createElement('select');
    fontSelect.style.cssText = `
        background: #3a3a3a;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 6px 8px;
        color: #ffffff;
        font-size: 14px;
        outline: none;
        min-width: 120px;
    `;

    // 폰트 옵션들 추가
    const fonts = [
        // 기본 시스템 폰트
        { value: 'Arial', name: 'Arial' },
        { value: 'Helvetica', name: 'Helvetica' },
        { value: 'Times New Roman', name: 'Times New Roman' },
        { value: 'Georgia', name: 'Georgia' },
        { value: 'Verdana', name: 'Verdana' },
        { value: 'Courier New', name: 'Courier New' },
        { value: 'Impact', name: 'Impact' },
        { value: 'Comic Sans MS', name: 'Comic Sans MS' },
        { value: 'Trebuchet MS', name: 'Trebuchet MS' },
        
        // 한글 시스템 폰트
        { value: 'Noto Sans KR', name: 'Noto Sans 한글' },
        { value: 'Malgun Gothic', name: '맑은 고딕' },
        { value: 'Nanum Gothic', name: '나눔고딕' },
        
        // 커스텀 TTF 폰트 (assets/fonts/에 TTF 파일 필요)
        { value: 'Galmuri11', name: '갈무리11 (픽셀)' },
        { value: 'NanumGothic Custom', name: '나눔고딕 (TTF)' },
        { value: 'Pretendard', name: 'Pretendard' },
        { value: 'Gmarket Sans', name: 'G마켓 산스' },
        { value: 'Cafe24 Ssurround', name: 'Cafe24 써라운드' },
        { value: 'Cafe24 Oneprettynight', name: 'Cafe24 원쁘띠나잇' },
        { value: 'Binggrae', name: '빙그레체' },
        { value: 'Jua', name: '주아' },
        
        // Google Fonts (웹 폰트)
        { value: 'Roboto', name: 'Roboto' },
        { value: 'Inter', name: 'Inter' },
        { value: 'Poppins', name: 'Poppins' },
        { value: 'Playfair Display', name: 'Playfair Display' },
        { value: 'Dancing Script', name: 'Dancing Script' },
        { value: 'Pacifico', name: 'Pacifico' },
        { value: 'Lobster', name: 'Lobster' }
    ];

    fonts.forEach(font => {
        const option = document.createElement('option');
        option.value = font.value;
        option.textContent = font.name;
        fontSelect.appendChild(option);
    });

    // 폰트 크기 입력
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = '크기:';
    sizeLabel.style.cssText = `
        color: #ccc;
        font-size: 14px;
    `;

    const sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.value = '32';
    sizeInput.min = '8';
    sizeInput.max = '200';
    sizeInput.style.cssText = `
        background: #3a3a3a;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 6px 8px;
        color: #ffffff;
        font-size: 14px;
        outline: none;
        width: 80px;
    `;

    // 색상 선택
    const colorLabel = document.createElement('label');
    colorLabel.textContent = '색상:';
    colorLabel.style.cssText = `
        color: #ccc;
        font-size: 14px;
    `;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#000000';
    colorInput.style.cssText = `
        background: #3a3a3a;
        border: 1px solid #555;
        border-radius: 4px;
        width: 50px;
        height: 32px;
        cursor: pointer;
        outline: none;
    `;

    fontContainer.appendChild(fontLabel);
    fontContainer.appendChild(fontSelect);
    fontContainer.appendChild(sizeLabel);
    fontContainer.appendChild(sizeInput);
    fontContainer.appendChild(colorLabel);
    fontContainer.appendChild(colorInput);

    // 버튼 컨테이너
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 20px;
    `;

    // 취소 버튼
    const cancelButton = document.createElement('button');
    cancelButton.textContent = '취소';
    cancelButton.style.cssText = `
        background: #666;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
    `;

    cancelButton.addEventListener('mouseenter', () => {
        cancelButton.style.background = '#777';
    });

    cancelButton.addEventListener('mouseleave', () => {
        cancelButton.style.background = '#666';
    });

    // 추가 버튼
    const addButton = document.createElement('button');
    addButton.textContent = '추가';
    addButton.style.cssText = `
        background: #007acc;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
    `;

    addButton.addEventListener('mouseenter', () => {
        addButton.style.background = '#0066aa';
    });

    addButton.addEventListener('mouseleave', () => {
        addButton.style.background = '#007acc';
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(addButton);

    // 모달 내용 구성
    modalContent.appendChild(title);
    modalContent.appendChild(textInput);
    modalContent.appendChild(fontContainer);
    modalContent.appendChild(buttonContainer);
    modal.appendChild(modalContent);

    // 이벤트 핸들러
    cancelButton.addEventListener('click', () => {
        modal.remove();
    });

    // 모달 배경 클릭 시 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // ESC 키로 닫기
    const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleKeyPress);
        }
    };
    document.addEventListener('keydown', handleKeyPress);

    addButton.addEventListener('click', () => {
        const text = textInput.value.trim();
        if (text) {
            const font = fontSelect.value;
            const size = parseInt(sizeInput.value) || 32;
            const color = colorInput.value;
            
            addTextToCanvas(text, font, size, color);
            modal.remove();
            document.removeEventListener('keydown', handleKeyPress);
        }
    });

    // Enter 키로 추가 (Shift+Enter는 줄바꿈)
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addButton.click();
        }
    });

    document.body.appendChild(modal);
    
    // 텍스트 입력란에 포커스
    setTimeout(() => {
        textInput.focus();
    }, 100);
}

/**
 * 캔버스에 텍스트 추가
 */
function addTextToCanvas(text, fontFamily, fontSize, color) {
    // 저장된 더블클릭 위치 사용 (스테이지 좌표계로 변환)
    const stagePos = stage.getAbsolutePosition();
    const stageScale = stage.scaleX();
    
    // 화면 좌표를 스테이지 좌표로 변환
    const stageX = (lastDoubleClickPosition.x - stagePos.x) / stageScale;
    const stageY = (lastDoubleClickPosition.y - stagePos.y) / stageScale;

    const textNode = new Konva.Text({
        x: stageX,
        y: stageY,
        text: text,
        fontSize: fontSize,
        fontFamily: fontFamily,
        fill: color,
        draggable: true,
        name: 'text-element'
    });

    // 텍스트를 클릭 위치 중앙에 정렬
    textNode.offsetX(textNode.width() / 2);
    textNode.offsetY(textNode.height() / 2);

    layer.add(textNode);
    layer.batchDraw();

    // 텍스트 선택 및 편집 가능하도록 이벤트 추가
    setupTextEvents(textNode);

    console.log(`Text added: "${text}" at position (${stageX.toFixed(1)}, ${stageY.toFixed(1)}) with font ${fontFamily} ${fontSize}px`);
}

/**
 * 텍스트 노드 이벤트 설정
 */
function setupTextEvents(textNode) {
    // 더블클릭으로 텍스트 편집
    textNode.on('dblclick dbltap', () => {
        editText(textNode);
    });

    // 클릭으로 선택
    textNode.on('click tap', () => {
        setSelectedImage(textNode);
    });

    // Delete 키로 삭제 가능하도록 선택 상태 관리
    textNode.on('mouseenter', () => {
        document.body.style.cursor = 'move';
    });

    textNode.on('mouseleave', () => {
        document.body.style.cursor = 'default';
    });
}

/**
 * 텍스트 편집 모달
 */
function editText(textNode) {
    const currentText = textNode.text();
    const currentFont = textNode.fontFamily();
    const currentSize = textNode.fontSize();
    const currentColor = textNode.fill();

    // 텍스트 입력 모달 생성 (기존 함수 재사용)
    createTextInputModal();
    
    // 모달이 생성된 후 현재 값들로 설정
    setTimeout(() => {
        const modal = document.getElementById('text-input-modal');
        if (modal) {
            const textInput = modal.querySelector('textarea');
            const fontSelect = modal.querySelector('select');
            const sizeInput = modal.querySelector('input[type="number"]');
            const colorInput = modal.querySelector('input[type="color"]');
            const addButton = modal.querySelector('button:last-of-type');

            textInput.value = currentText;
            fontSelect.value = currentFont;
            sizeInput.value = currentSize;
            colorInput.value = currentColor;

            addButton.textContent = '수정';

            // 기존 이벤트 리스너 제거하고 새로운 것 추가
            const newAddButton = addButton.cloneNode(true);
            addButton.parentNode.replaceChild(newAddButton, addButton);

            newAddButton.addEventListener('click', () => {
                const newText = textInput.value.trim();
                if (newText) {
                    textNode.text(newText);
                    textNode.fontFamily(fontSelect.value);
                    textNode.fontSize(parseInt(sizeInput.value) || 32);
                    textNode.fill(colorInput.value);
                    
                    // 텍스트 중앙 정렬 재조정
                    textNode.offsetX(textNode.width() / 2);
                    textNode.offsetY(textNode.height() / 2);
                    
                    layer.batchDraw();
                    modal.remove();
                }
            });
        }
    }, 100);
}

/**
 * 전처리된 이미지 컨텍스트 메뉴 표시 (캔버스용)
 */
function showPreprocessedImageContextMenu(imageNode, pointerPosition) {
    // 기존 컨텍스트 메뉴 제거
    removeExistingContextMenu();
    
    // 컨텍스트 메뉴 생성
    const contextMenu = document.createElement('div');
    contextMenu.className = 'canvas-preproc-context-menu';
    contextMenu.style.cssText = `
        position: fixed;
        z-index: 10000;
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid rgba(139, 92, 246, 0.3);
        border-radius: 6px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        padding: 4px 0;
        min-width: 140px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    
    // 메뉴 위치 설정
    contextMenu.style.left = pointerPosition.x + 'px';
    contextMenu.style.top = pointerPosition.y + 'px';
    
    // 메뉴 아이템들 생성
    const menuItems = [
        { icon: '📷', type: 'normal', label: 'Normal Image' },
        { icon: '⚙️', type: 'preproc', label: 'Preprocessed Image' }
    ];
    
    menuItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.innerHTML = `${item.icon} ${item.label}`;
        menuItem.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.9);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.2s ease;
            ${imageNode.getAttr('imageType') === item.type ? 'background: rgba(139, 92, 246, 0.2);' : ''}
        `;
        
        // 호버 효과
        menuItem.addEventListener('mouseenter', () => {
            if (imageNode.getAttr('imageType') !== item.type) {
                menuItem.style.background = 'rgba(255, 255, 255, 0.1)';
            }
        });
        
        menuItem.addEventListener('mouseleave', () => {
            if (imageNode.getAttr('imageType') !== item.type) {
                menuItem.style.background = 'none';
            }
        });
        
        // 클릭 이벤트
        menuItem.addEventListener('click', () => {
            changeImageType(imageNode, item.type);
            removeExistingContextMenu();
        });
        
        contextMenu.appendChild(menuItem);
    });
    
    // 문서에 추가
    document.body.appendChild(contextMenu);
    
    // 외부 클릭 시 메뉴 닫기
    setTimeout(() => {
        const closeHandler = (e) => {
            if (!contextMenu.contains(e.target)) {
                removeExistingContextMenu();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 0);
    
    // 화면 경계 체크 및 위치 조정
    setTimeout(() => {
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = (pointerPosition.x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = (pointerPosition.y - rect.height) + 'px';
        }
    }, 0);
}

/**
 * 기존 컨텍스트 메뉴 제거
 */
function removeExistingContextMenu() {
    const existingMenu = document.querySelector('.canvas-preproc-context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
}

/**
 * 이미지 타입 변경 (캔버스용)
 */
function changeImageType(imageNode, newType) {
    const oldType = imageNode.getAttr('imageType');
    if (oldType === newType) {
        return; // 같은 타입이면 무시
    }
    
    // 이미지 노드의 타입 속성 변경
    imageNode.setAttr('imageType', newType);
    
    // 캔버스 이벤트 발생 (레이어 패널 업데이트용)
    const typeChangedEvent = new CustomEvent('canvasImageTypeChanged', {
        detail: {
            imageNode: imageNode,
            oldType: oldType,
            newType: newType
        }
    });
    document.dispatchEvent(typeChangedEvent);
    
    console.log(`🔄 Canvas: Image type changed from ${oldType} to ${newType}`);
    
    // 레이어 다시 그리기
    layer.draw();
    
    // 선택된 이미지인 경우 하이라이트도 업데이트
    if (selectedImage === imageNode) {
        updateHighlightPosition();
    }
}

/**
 * 빈 캔버스 생성 기능
 */
function createBlankCanvas() {
    // 색상 선택 모달 생성
    createCanvasColorModal();
}

/**
 * 색상 선택 모달 생성
 */
function createCanvasColorModal() {
    // 기존 모달이 있으면 제거
    const existingModal = document.getElementById('canvas-color-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // 모달 컨테이너 생성
    const modal = document.createElement('div');
    modal.id = 'canvas-color-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;

    // 모달 내용 컨테이너
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: #2a2a2a;
        border-radius: 16px;
        padding: 32px;
        min-width: 400px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // 제목
    const title = document.createElement('h3');
    title.textContent = '빈 캔버스 생성';
    title.style.cssText = `
        margin: 0 0 24px 0;
        color: #ffffff;
        font-size: 20px;
        font-weight: 600;
        text-align: center;
    `;

    // 설명
    const description = document.createElement('p');
    description.textContent = '캔버스 배경 색상을 선택하세요:';
    description.style.cssText = `
        margin: 0 0 24px 0;
        color: #cccccc;
        font-size: 14px;
        text-align: center;
    `;

    // 색상 선택 버튼들 컨테이너
    const colorContainer = document.createElement('div');
    colorContainer.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 20px;
        margin-bottom: 32px;
    `;

    // 흰색 버튼
    const whiteButton = document.createElement('button');
    whiteButton.style.cssText = `
        width: 120px;
        height: 80px;
        background: #ffffff;
        border: 3px solid #666;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    `;

    const whiteLabel = document.createElement('div');
    whiteLabel.textContent = '흰색';
    whiteLabel.style.cssText = `
        position: absolute;
        bottom: -28px;
        left: 50%;
        transform: translateX(-50%);
        color: #ffffff;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
    `;
    whiteButton.appendChild(whiteLabel);

    // 검정색 버튼
    const blackButton = document.createElement('button');
    blackButton.style.cssText = `
        width: 120px;
        height: 80px;
        background: #000000;
        border: 3px solid #666;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    `;

    const blackLabel = document.createElement('div');
    blackLabel.textContent = '검정색';
    blackLabel.style.cssText = `
        position: absolute;
        bottom: -28px;
        left: 50%;
        transform: translateX(-50%);
        color: #ffffff;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
    `;
    blackButton.appendChild(blackLabel);

    // 호버 효과
    whiteButton.addEventListener('mouseenter', () => {
        whiteButton.style.transform = 'scale(1.05)';
        whiteButton.style.border = '3px solid #3498db';
        whiteButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
    });

    whiteButton.addEventListener('mouseleave', () => {
        whiteButton.style.transform = 'scale(1)';
        whiteButton.style.border = '3px solid #666';
        whiteButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    });

    blackButton.addEventListener('mouseenter', () => {
        blackButton.style.transform = 'scale(1.05)';
        blackButton.style.border = '3px solid #3498db';
        blackButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
    });

    blackButton.addEventListener('mouseleave', () => {
        blackButton.style.transform = 'scale(1)';
        blackButton.style.border = '3px solid #666';
        blackButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
    });

    colorContainer.appendChild(whiteButton);
    colorContainer.appendChild(blackButton);

    // 취소 버튼
    const cancelButton = document.createElement('button');
    cancelButton.textContent = '취소';
    cancelButton.style.cssText = `
        width: 100%;
        background: #666;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 12px 24px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
        margin-top: 8px;
    `;

    cancelButton.addEventListener('mouseenter', () => {
        cancelButton.style.background = '#777';
    });

    cancelButton.addEventListener('mouseleave', () => {
        cancelButton.style.background = '#666';
    });

    // 모달 내용 구성
    modalContent.appendChild(title);
    modalContent.appendChild(description);
    modalContent.appendChild(colorContainer);
    modalContent.appendChild(cancelButton);
    modal.appendChild(modalContent);

    // 이벤트 핸들러
    whiteButton.addEventListener('click', () => {
        generateBlankCanvas('#FFFFFF');
        modal.remove();
    });

    blackButton.addEventListener('click', () => {
        generateBlankCanvas('#000000');
        modal.remove();
    });

    cancelButton.addEventListener('click', () => {
        modal.remove();
    });

    // 모달 배경 클릭 시 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // ESC 키로 닫기
    const handleKeyPress = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleKeyPress);
        }
    };
    document.addEventListener('keydown', handleKeyPress);

    document.body.appendChild(modal);
}

/**
 * 현재 파라미터에서 크기 정보를 가져오는 함수
 */
function getCurrentCanvasSize() {
    // parameters 컴포넌트에서 현재 설정값 가져오기
    const parametersChangeEvent = document.querySelector('*'); // 임시로 문서에서 찾기
    
    // 기본값 설정 (SDXL 기준)
    let defaultWidth = 1024;
    let defaultHeight = 1024;
    
    try {
        // parameters:changed 이벤트가 있었는지 확인하거나 직접 DOM에서 값 읽기
        const widthInput = document.querySelector('#param-width');
        const heightInput = document.querySelector('#param-height');
        
        if (widthInput && heightInput) {
            defaultWidth = parseInt(widthInput.value) || defaultWidth;
            defaultHeight = parseInt(heightInput.value) || defaultHeight;
        }
    } catch (error) {
        console.log('📐 Using default canvas size:', defaultWidth, 'x', defaultHeight);
    }
    
    return { width: defaultWidth, height: defaultHeight };
}

/**
 * 실제 빈 캔버스를 생성하는 함수
 */
function generateBlankCanvas(backgroundColor) {
    const { width, height } = getCurrentCanvasSize();
    
    // HTML5 Canvas로 빈 이미지 생성
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    
    // 배경색 채우기
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    
    // Canvas를 Image 객체로 변환
    const img = new window.Image();
    img.onload = () => {
        // 저장된 더블클릭 위치에 이미지 추가 (화면 좌표를 캔버스 좌표로 변환)
        const canvasContainer = document.getElementById('canvas-container');
        const rect = canvasContainer.getBoundingClientRect();
        
        // 화면 좌표를 스테이지 좌표로 변환
        const stageX = lastDoubleClickPosition.x - rect.left;
        const stageY = lastDoubleClickPosition.y - rect.top;
        
        // 스테이지 변환 (줌, 팬닝) 고려하여 실제 캔버스 좌표로 변환
        const transform = stage.getAbsoluteTransform().copy();
        transform.invert();
        const canvasPos = transform.point({ x: stageX, y: stageY });
        
        addImageToCanvas(img, canvasPos.x, canvasPos.y);
        
        const colorName = backgroundColor === '#FFFFFF' ? '흰색' : '검정색';
        console.log(`🎨 Blank canvas created: ${width}x${height} ${colorName} canvas at position (${canvasPos.x.toFixed(1)}, ${canvasPos.y.toFixed(1)})`);
    };
    
    img.src = canvas.toDataURL('image/png');
}

/**
 * 페인팅 도구에서 사용할 이미지 추가 함수
 * @param {HTMLImageElement} imageElement - 추가할 이미지 요소
 * @param {Object} options - 이미지 옵션 (x, y, imageType 등)
 */
export function addImageFromElement(imageElement, options = {}) {
    const { x = 50, y = 50, imageType = 'normal', processingSource = 'user', createdAt = new Date().toISOString() } = options;
    
    const konvaImage = new Konva.Image({
        image: imageElement,
        x: x,
        y: y,
        draggable: true,
        // 메타데이터 추가
        imageType: imageType,
        processingSource: processingSource,
        createdAt: createdAt
    });
    
    // 이미지 중심 정렬
    konvaImage.offsetX(konvaImage.width() / 2);
    konvaImage.offsetY(konvaImage.height() / 2);
    
    // 드래그 이벤트 설정
    konvaImage.on('dragmove', () => {
        if (selectedImage === konvaImage) {
            updateHighlightPosition();
        }
    });
    
    layer.add(konvaImage);
    layer.batchDraw();
    
    console.log('🎨 Image added from painting tool:', {
        type: imageType,
        source: processingSource,
        position: { x, y },
        size: { width: konvaImage.width(), height: konvaImage.height() }
    });
    
    return konvaImage;
}


