// components/imageEditor/tools/crop.js

/**
 * Crop 도구 모듈
 * 이미지 자르기 기능을 제공합니다.
 */

let layer;
let stage;
let cropOverlay;
let cropRect;
let isAdjustingCrop = false;

export function init(konvaStage, konvaLayer) {
    stage = konvaStage;
    layer = konvaLayer;
}

/**
 * 크롭 모드 시작
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 */
export function startCropMode(imageNode) {
    if (!imageNode) return;
    
    const imageRect = imageNode.getClientRect();
    
    // 크롭 오버레이 생성
    createCropOverlay(imageRect);
    
    return {
        mode: 'crop',
        targetImage: imageNode,
        originalRect: imageRect
    };
}

/**
 * 크롭 오버레이 생성
 * @param {Object} imageRect - 이미지의 경계 사각형
 */
function createCropOverlay(imageRect) {
    // 기존 크롭 오버레이 제거
    removeCropOverlay();
    
    // 반투명 오버레이
    cropOverlay = new Konva.Group();
    
    // 전체 배경을 덮는 어두운 레이어
    const darkBackground = new Konva.Rect({
        x: -50000,
        y: -50000,
        width: 100000,
        height: 100000,
        fill: 'rgba(0, 0, 0, 0.7)'
    });
    
    // 크롭 영역 (투명한 사각형)
    cropRect = new Konva.Rect({
        x: imageRect.x,
        y: imageRect.y,
        width: imageRect.width,
        height: imageRect.height,
        fill: 'transparent',
        stroke: '#00ff00',
        strokeWidth: 2 / stage.scaleX(), // 줌 레벨에 관계없이 일정한 두께
        draggable: true
    });
    
    // 크롭 영역을 제외한 부분을 어둡게 하는 마스크
    const cropMask = new Konva.Rect({
        x: imageRect.x,
        y: imageRect.y,
        width: imageRect.width,
        height: imageRect.height,
        fill: 'rgba(0, 0, 0, 0)',
        globalCompositeOperation: 'destination-out'
    });
    
    // 크롭 핸들들 생성
    const handles = createCropHandles(cropRect);
    
    cropOverlay.add(darkBackground);
    cropOverlay.add(cropMask);
    cropOverlay.add(cropRect);
    handles.forEach(handle => cropOverlay.add(handle));
    
    layer.add(cropOverlay);
    
    // 크롭 이벤트 설정
    setupCropEvents();
    
    layer.batchDraw();
}

/**
 * 크롭 핸들 생성
 * @param {Konva.Rect} rect - 크롭 사각형
 * @returns {Array} 핸들 배열
 */
function createCropHandles(rect) {
    const handleSize = 8 / stage.scaleX();
    const handles = [];
    
    const positions = [
        { x: 0, y: 0, cursor: 'nw-resize' }, // 왼쪽 상단
        { x: 0.5, y: 0, cursor: 'n-resize' }, // 상단 중앙
        { x: 1, y: 0, cursor: 'ne-resize' }, // 오른쪽 상단
        { x: 1, y: 0.5, cursor: 'e-resize' }, // 오른쪽 중앙
        { x: 1, y: 1, cursor: 'se-resize' }, // 오른쪽 하단
        { x: 0.5, y: 1, cursor: 's-resize' }, // 하단 중앙
        { x: 0, y: 1, cursor: 'sw-resize' }, // 왼쪽 하단
        { x: 0, y: 0.5, cursor: 'w-resize' } // 왼쪽 중앙
    ];
    
    positions.forEach((pos, index) => {
        const handle = new Konva.Rect({
            x: rect.x() + rect.width() * pos.x - handleSize / 2,
            y: rect.y() + rect.height() * pos.y - handleSize / 2,
            width: handleSize,
            height: handleSize,
            fill: '#00ff00',
            stroke: '#ffffff',
            strokeWidth: 1 / stage.scaleX(),
            draggable: true,
            name: `cropHandle-${index}`
        });
        
        handle.on('dragmove', (e) => updateCropFromHandle(e, index, rect));
        handles.push(handle);
    });
    
    return handles;
}

/**
 * 크롭 이벤트 설정
 */
function setupCropEvents() {
    // ESC 키로 크롭 모드 취소
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            cancelCropMode();
        } else if (e.key === 'Enter') {
            applyCrop();
        }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    
    // 크롭 영역 드래그 이벤트
    cropRect.on('dragmove', updateCropHandles);
}

/**
 * 핸들로부터 크롭 영역 업데이트
 * @param {Object} e - 이벤트 객체
 * @param {number} handleIndex - 핸들 인덱스
 * @param {Konva.Rect} rect - 크롭 사각형
 */
function updateCropFromHandle(e, handleIndex, rect) {
    const handle = e.target;
    const pos = handle.position();
    
    // 핸들 위치에 따라 크롭 영역 조정
    let newX = rect.x();
    let newY = rect.y();
    let newWidth = rect.width();
    let newHeight = rect.height();
    
    switch (handleIndex) {
        case 0: // 왼쪽 상단
            newWidth = rect.x() + rect.width() - pos.x;
            newHeight = rect.y() + rect.height() - pos.y;
            newX = pos.x;
            newY = pos.y;
            break;
        case 1: // 상단 중앙
            newHeight = rect.y() + rect.height() - pos.y;
            newY = pos.y;
            break;
        case 2: // 오른쪽 상단
            newWidth = pos.x - rect.x();
            newHeight = rect.y() + rect.height() - pos.y;
            newY = pos.y;
            break;
        case 3: // 오른쪽 중앙
            newWidth = pos.x - rect.x();
            break;
        case 4: // 오른쪽 하단
            newWidth = pos.x - rect.x();
            newHeight = pos.y - rect.y();
            break;
        case 5: // 하단 중앙
            newHeight = pos.y - rect.y();
            break;
        case 6: // 왼쪽 하단
            newWidth = rect.x() + rect.width() - pos.x;
            newHeight = pos.y - rect.y();
            newX = pos.x;
            break;
        case 7: // 왼쪽 중앙
            newWidth = rect.x() + rect.width() - pos.x;
            newX = pos.x;
            break;
    }
    
    // 최소 크기 제한
    const minSize = 10;
    if (newWidth < minSize) newWidth = minSize;
    if (newHeight < minSize) newHeight = minSize;
    
    rect.x(newX);
    rect.y(newY);
    rect.width(newWidth);
    rect.height(newHeight);
    
    updateCropHandles();
    layer.batchDraw();
}

/**
 * 크롭 핸들 위치 업데이트
 */
function updateCropHandles() {
    if (!cropOverlay || !cropRect) return;
    
    const handles = cropOverlay.find('.cropHandle');
    const handleSize = 8 / stage.scaleX();
    
    const positions = [
        { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
        { x: 1, y: 0.5 }, { x: 1, y: 1 }, { x: 0.5, y: 1 },
        { x: 0, y: 1 }, { x: 0, y: 0.5 }
    ];
    
    handles.forEach((handle, index) => {
        const pos = positions[index];
        handle.x(cropRect.x() + cropRect.width() * pos.x - handleSize / 2);
        handle.y(cropRect.y() + cropRect.height() * pos.y - handleSize / 2);
    });
}

/**
 * 크롭 적용
 * @param {Konva.Image} imageNode - 대상 이미지 (선택적)
 */
export function applyCrop(imageNode) {
    if (!cropRect || !cropOverlay) return;
    
    const cropArea = {
        x: cropRect.x(),
        y: cropRect.y(),
        width: cropRect.width(),
        height: cropRect.height()
    };
    
    removeCropOverlay();
    
    if (imageNode) {
        // 실제 크롭 적용 로직
        applyCropToImage(imageNode, cropArea);
    }
    
    return cropArea;
}

/**
 * 이미지에 크롭 적용
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {Object} cropArea - 크롭 영역
 */
function applyCropToImage(imageNode, cropArea) {
    const imageRect = imageNode.getClientRect();
    
    // 크롭 영역을 이미지 좌표계로 변환
    const relativeX = (cropArea.x - imageRect.x) / imageRect.width;
    const relativeY = (cropArea.y - imageRect.y) / imageRect.height;
    const relativeWidth = cropArea.width / imageRect.width;
    const relativeHeight = cropArea.height / imageRect.height;
    
    const originalWidth = imageNode.width();
    const originalHeight = imageNode.height();
    
    // 크롭 적용
    imageNode.cropX(relativeX * originalWidth);
    imageNode.cropY(relativeY * originalHeight);
    imageNode.cropWidth(relativeWidth * originalWidth);
    imageNode.cropHeight(relativeHeight * originalHeight);
    
    // 크롭된 크기에 맞게 이미지 크기 조정
    imageNode.width(relativeWidth * originalWidth);
    imageNode.height(relativeHeight * originalHeight);
    
    layer.batchDraw();
}

/**
 * 크롭 모드 취소
 */
export function cancelCropMode() {
    removeCropOverlay();
    return { mode: 'cancelled' };
}

/**
 * 크롭 오버레이 제거
 */
function removeCropOverlay() {
    if (cropOverlay) {
        cropOverlay.destroy();
        cropOverlay = null;
        cropRect = null;
        layer.batchDraw();
    }
}

/**
 * 크롭 상태 확인
 */
export function isCropMode() {
    return cropOverlay !== null;
}