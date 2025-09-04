// components/canvas/canvas.js

import { exitTransformMode, isTransformModeActive } from '../imageEditor/tools/transformer.js';
import stateManager from '../../core/stateManager.js';
import { getNodeRect, init as initCoordinates } from '../../core/coordinates.js';

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

        // isImageSelected 초기 상태 설정
        stateManager.updateState('isImageSelected', false);
}

// 키보드 이벤트 설정 (스페이스바 팬닝)
function setupKeyboardEvents(container) {
    let spacePressed = false;

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !spacePressed) {
            e.preventDefault();
            spacePressed = true;
            container.classList.add('panning');
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
