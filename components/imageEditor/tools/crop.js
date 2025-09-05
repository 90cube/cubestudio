// components/imageEditor/tools/crop.js

/**
 * Crop 도구 모듈
 * 이미지 자르기 기능을 제공합니다.
 */

import { getNodeRect, screenToStage } from '../../../core/coordinates.js';

let layer;
let stage;
let cropOverlay;
let cropRect;
let isAdjustingCrop = false;
let targetImage; // 자르기 대상 이미지를 저장할 변수
let initialNodeRect; // 자르기 시작 시점의 이미지 좌표 (FOV 시스템 사용)


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

    targetImage = imageNode; // 대상 이미지 저장
    
    // FOV 시스템 사용하여 일관된 좌표 계산
    const imageRect = getNodeRect(imageNode);
    initialNodeRect = imageRect; // 시작 시점 좌표 저장
    
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
    handleKeyDown = (e) => {
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
 */
export function applyCrop() {
    if (!cropRect || !cropOverlay || !targetImage) return;
    
    const cropArea = {
        x: cropRect.x(),
        y: cropRect.y(),
        width: cropRect.width(),
        height: cropRect.height()
    };
    
    // 실제 크롭 적용 로직
    applyCropToImage(targetImage, cropArea);

    removeCropOverlay();
    
    return cropArea;
}

/**
 * 이미지에 크롭 적용
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {Object} cropArea - 크롭 영역
 */
function applyCropToImage(imageNode, cropArea) {
    // initialNodeRect was stored when crop mode started
    if (!initialNodeRect) return;

    // 정확한 좌표 변환을 위한 역변환 행렬 사용
    const imageTransform = imageNode.getAbsoluteTransform();
    const inverseTransform = imageTransform.copy().invert();
    
    // 크롭 영역의 각 모서리를 이미지 로컬 좌표계로 변환
    const topLeft = inverseTransform.point({ x: cropArea.x, y: cropArea.y });
    const bottomRight = inverseTransform.point({ 
        x: cropArea.x + cropArea.width, 
        y: cropArea.y + cropArea.height 
    });
    
    // 현재 적용된 크롭 정보 가져오기
    const currentCrop = imageNode.crop() || { x: 0, y: 0, width: imageNode.width(), height: imageNode.height() };
    
    // 새로운 크롭 영역을 이미지 로컬 좌표계에서 계산
    const newCrop = {
        x: currentCrop.x + Math.max(0, topLeft.x),
        y: currentCrop.y + Math.max(0, topLeft.y),
        width: Math.abs(bottomRight.x - topLeft.x),
        height: Math.abs(bottomRight.y - topLeft.y)
    };
    
    // 크롭 영역이 이미지 경계를 벗어나지 않도록 제한
    const imageWidth = imageNode.width();
    const imageHeight = imageNode.height();
    
    newCrop.x = Math.max(0, Math.min(newCrop.x, imageWidth - 1));
    newCrop.y = Math.max(0, Math.min(newCrop.y, imageHeight - 1));
    newCrop.width = Math.min(newCrop.width, imageWidth - newCrop.x);
    newCrop.height = Math.min(newCrop.height, imageHeight - newCrop.y);
    
    // 크롭 적용
    imageNode.crop(newCrop);
    
    // 이미지 위치와 크기를 크롭 영역에 맞게 조정
    imageNode.position({ x: cropArea.x, y: cropArea.y });
    imageNode.size({ width: cropArea.width, height: cropArea.height });
    
    // 스케일과 오프셋 초기화로 정확한 표시
    imageNode.scale({ x: 1, y: 1 });
    imageNode.offset({ x: 0, y: 0 });

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
        // 이벤트 리스너 정리
        document.removeEventListener('keydown', handleKeyDown);
        
        cropOverlay.destroy();
        cropOverlay = null;
        cropRect = null;
        targetImage = null; // 대상 이미지 초기화
        initialNodeRect = null; // 시작 좌표 초기화
        layer.batchDraw();
    }
}

// 키보드 이벤트 핸들러 (외부에서 참조할 수 있도록)
let handleKeyDown;

/**
 * 크롭 상태 확인
 */
export function isCropMode() {
    return cropOverlay !== null;
}

// --- Lasso Crop ---

let isDrawing = false;
let lassoLine;
let lassoEventHandlers = null; // 이벤트 핸들러 추적용
let originalDraggableState = true; // 원본 draggable 상태 저장

export function activateLassoCrop(imageNode) {
    if (!imageNode) return;
    
    // 기존 lasso crop 정리
    cleanupLassoCrop();
    
    targetImage = imageNode;

    // 원본 draggable 상태 저장 후 비활성화
    originalDraggableState = targetImage.draggable();
    targetImage.draggable(false);
    console.log('Image dragging disabled for lasso crop');
    
    // 이벤트 핸들러들 정의
    const handleMouseDown = (e) => {
        // 이미 그리고 있으면 무시
        if (isDrawing) return;
        
        // Transformer 관련 요소 클릭 시 무시 (더 안전한 방법)
        try {
            const target = e.target;
            const targetName = target?.name || target?.attrs?.name || '';
            if (typeof targetName === 'string' && (
                targetName.includes('anchor') || 
                targetName.includes('transform') ||
                target.className === 'Transformer'
            )) {
                console.log('Ignoring transformer element click');
                return;
            }
        } catch (error) {
            console.log('Error checking target name, continuing with lasso draw');
        }
        
        console.log('Lasso drawing started', e.target); // 디버깅용
        isDrawing = true;
        
        // 이벤트에서 직접 마우스 좌표를 가져와서 정확한 변환 적용
        let pos;
        if (e.evt) {
            // Konva 이벤트에서 원본 브라우저 이벤트 사용
            const rect = stage.container().getBoundingClientRect();
            const screenPoint = {
                x: e.evt.clientX - rect.left,
                y: e.evt.clientY - rect.top
            };
            pos = screenToStage(screenPoint);
            console.log('MouseDown - Screen point:', screenPoint, '-> Stage:', pos);
        } else {
            // 폴백: stage.getPointerPosition() 사용
            const stagePointerPos = stage.getPointerPosition();
            if (!stagePointerPos) {
                console.log('No pointer position available');
                isDrawing = false;
                return;
            }
            pos = screenToStage(stagePointerPos);
        }
        
        lassoLine = new Konva.Line({
            points: [pos.x, pos.y],
            stroke: '#00ff00', // 더 선명한 색상으로 변경
            strokeWidth: 3 / stage.scaleX(), // 더 두껍게
            opacity: 0.8,
            closed: false,
            listening: false,
            // fill 제거 - 선만 그리기
        });
        layer.add(lassoLine);
        layer.batchDraw();
    };

    const handleMouseMove = (e) => {
        if (!isDrawing || !lassoLine) return;
        
        // 이벤트에서 직접 마우스 좌표를 가져와서 정확한 변환 적용
        let pos;
        if (e.evt) {
            // Konva 이벤트에서 원본 브라우저 이벤트 사용
            const rect = stage.container().getBoundingClientRect();
            const screenPoint = {
                x: e.evt.clientX - rect.left,
                y: e.evt.clientY - rect.top
            };
            pos = screenToStage(screenPoint);
            console.log('Using event coordinates:', screenPoint, '-> stage:', pos);
        } else {
            // 폴백: stage.getPointerPosition() 사용
            const stagePointerPos = stage.getPointerPosition();
            if (!stagePointerPos) return;
            pos = screenToStage(stagePointerPos);
        }
        
        // 최소 움직임 감지로 너무 많은 포인트 방지
        const currentPoints = lassoLine.points();
        if (currentPoints.length >= 2) {
            const lastX = currentPoints[currentPoints.length - 2];
            const lastY = currentPoints[currentPoints.length - 1];
            const distance = Math.sqrt((pos.x - lastX) ** 2 + (pos.y - lastY) ** 2);
            if (distance < 3) return; // 3픽셀 미만 움직임은 무시
        }
        
        const newPoints = currentPoints.concat([pos.x, pos.y]);
        lassoLine.points(newPoints);
        layer.batchDraw();
    };

    const handleMouseUp = () => {
        if (!isDrawing || !lassoLine) {
            console.log('Mouse up but not drawing or no lasso line');
            return;
        }
        
        console.log('Lasso drawing finished');
        isDrawing = false;
        
        const points = lassoLine.points();
        console.log('Points collected:', points.length / 2, 'points');
        
        // 최소 3개 포인트 (6개 좌표값) 필요
        if (points.length >= 6) {
            // 경로 닫기
            lassoLine.closed(true);
            lassoLine.fill('rgba(0, 255, 0, 0.2)'); // 반투명 채우기 추가
            layer.batchDraw();
            
            console.log('Valid lasso area created, waiting for user confirmation...');
            
            // 사용자가 확인할 수 있도록 잠시 대기
            setTimeout(() => {
                showConfirmDialog(() => {
                    console.log('User confirmed, applying lasso clip');
                    applyLassoClip(targetImage, lassoLine);
                    cleanupLassoCrop();
                }, () => {
                    console.log('User cancelled lasso crop');
                    cleanupLassoCrop();
                });
            }, 500);
        } else {
            console.log('Not enough points for lasso crop:', points.length / 2);
            cleanupLassoCrop();
        }
    };
    
    // ESC 키로 lasso crop 취소 핸들러
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            cleanupLassoCrop();
        }
    };
    
    // 이벤트 리스너 등록
    stage.on('mousedown.lasso', handleMouseDown);
    stage.on('mousemove.lasso', handleMouseMove);
    stage.on('mouseup.lasso', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    
    // 이벤트 핸들러 저장 (정리용)
    lassoEventHandlers = {
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleKeyDown
    };
    
    layer.batchDraw();
}

// Lasso crop 정리 함수
function cleanupLassoCrop() {
    console.log('Cleaning up lasso crop');
    
    // 그리기 상태 초기화
    isDrawing = false;
    
    // 라인 객체 정리
    if (lassoLine) {
        lassoLine.destroy();
        lassoLine = null;
    }
    
    // 이벤트 리스너 제거
    stage.off('mousedown.lasso');
    stage.off('mousemove.lasso');
    stage.off('mouseup.lasso');
    
    // 키보드 이벤트 리스너 제거
    if (lassoEventHandlers && lassoEventHandlers.handleKeyDown) {
        document.removeEventListener('keydown', lassoEventHandlers.handleKeyDown);
    }
    
    // 핸들러 참조 정리
    lassoEventHandlers = null;
    
    // 이미지의 draggable 상태 복원
    if (targetImage) {
        targetImage.draggable(originalDraggableState);
        console.log('Image dragging restored to:', originalDraggableState);
    }
    
    layer.batchDraw();
}

// Lasso crop 상태 확인
export function isLassoCropMode() {
    return isDrawing || lassoLine !== null;
}

// 커스텀 확인 다이얼로그
function showConfirmDialog(onConfirm, onCancel) {
    // 기존 다이얼로그가 있다면 제거
    const existingDialog = document.querySelector('.crop-confirm-dialog');
    if (existingDialog) {
        existingDialog.remove();
    }
    
    // 다이얼로그 오버레이 생성
    const overlay = document.createElement('div');
    overlay.className = 'crop-confirm-dialog';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // 다이얼로그 박스
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        text-align: center;
        animation: dialogFadeIn 0.2s ease-out;
    `;
    
    // CSS 애니메이션 추가
    const style = document.createElement('style');
    style.textContent = `
        @keyframes dialogFadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
    
    // 제목
    const title = document.createElement('h3');
    title.textContent = '자유모양 크롭';
    title.style.cssText = `
        margin: 0 0 12px 0;
        color: #333;
        font-size: 18px;
        font-weight: 600;
    `;
    
    // 메시지
    const message = document.createElement('p');
    message.textContent = '선택한 영역으로 이미지를 자르시겠습니까?';
    message.style.cssText = `
        margin: 0 0 24px 0;
        color: #666;
        font-size: 14px;
        line-height: 1.4;
    `;
    
    // 버튼 컨테이너
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 12px;
        justify-content: center;
    `;
    
    // 취소 버튼
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '취소';
    cancelBtn.style.cssText = `
        padding: 8px 20px;
        border: 1px solid #ddd;
        background: white;
        color: #666;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
    `;
    cancelBtn.onmouseover = () => cancelBtn.style.background = '#f5f5f5';
    cancelBtn.onmouseout = () => cancelBtn.style.background = 'white';
    
    // 확인 버튼
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '자르기';
    confirmBtn.style.cssText = `
        padding: 8px 20px;
        border: none;
        background: #00ff00;
        color: #000;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    `;
    confirmBtn.onmouseover = () => confirmBtn.style.background = '#00dd00';
    confirmBtn.onmouseout = () => confirmBtn.style.background = '#00ff00';
    
    // 이벤트 리스너
    cancelBtn.onclick = () => {
        overlay.remove();
        style.remove();
        onCancel();
    };
    
    confirmBtn.onclick = () => {
        overlay.remove();
        style.remove();
        onConfirm();
    };
    
    // ESC 키로 취소
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            style.remove();
            document.removeEventListener('keydown', handleKeyDown);
            onCancel();
        }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 오버레이 클릭으로 취소
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.remove();
            style.remove();
            document.removeEventListener('keydown', handleKeyDown);
            onCancel();
        }
    };
    
    // 요소 조립
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(confirmBtn);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

function applyLassoClip(imageNode, line) {
    try {
        console.log('Applying lasso clip to image');
        
        if (!imageNode || !line) {
            console.error('Missing imageNode or line for lasso clip');
            return;
        }
        
        const parent = imageNode.getParent();
        if (!parent) {
            console.error('Image node has no parent');
            return;
        }
        
        const linePoints = line.points();
        console.log('Line points for clipping:', linePoints.length / 2, 'points');

        if (linePoints.length < 6) {
            console.error('Not enough points for clipping');
            return;
        }

        // 라소 라인의 경계 상자 계산 (stage-space coordinates)
        let minX = linePoints[0], minY = linePoints[1];
        let maxX = linePoints[0], maxY = linePoints[1];
        
        for (let i = 0; i < linePoints.length; i += 2) {
            const x = linePoints[i];
            const y = linePoints[i + 1];
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        
        console.log('Lasso bounds:', { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY });

        // 이미지 변환 행렬을 이용한 정확한 좌표 변환
        const imageTransform = imageNode.getAbsoluteTransform();
        const inverseTransform = imageTransform.copy().invert();
        
        // 라소 포인트들을 이미지 로컬 좌표계로 변환
        const localPoints = [];
        for (let i = 0; i < linePoints.length; i += 2) {
            const stagePoint = { x: linePoints[i], y: linePoints[i + 1] };
            const localPoint = inverseTransform.point(stagePoint);
            localPoints.push(localPoint.x, localPoint.y);
        }

        // 클리핑 그룹 생성 - 라소 영역의 경계 상자 위치에 생성
        const clipGroup = new Konva.Group({
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            draggable: originalDraggableState,
            name: 'lasso-cropped-image',
            clipFunc: function(ctx) {
                // 라소 라인 포인트를 그룹의 로컬 좌표계로 조정
                ctx.beginPath();
                ctx.moveTo(linePoints[0] - minX, linePoints[1] - minY);
                
                for (let i = 2; i < linePoints.length; i += 2) {
                    ctx.lineTo(linePoints[i] - minX, linePoints[i + 1] - minY);
                }
                
                ctx.closePath();
            }
        });

        // 이미지를 그룹의 로컬 좌표계에 맞게 조정하여 추가
        const newImage = imageNode.clone({
            x: imageNode.x() - minX,  
            y: imageNode.y() - minY,
            // 기존 변환 속성 유지
            scaleX: imageNode.scaleX(),
            scaleY: imageNode.scaleY(),
            rotation: imageNode.rotation(),
            offset: imageNode.offset()
        });
        
        clipGroup.add(newImage);
        
        console.log('Created lasso clip group:', {
            groupPos: { x: minX, y: minY },
            groupSize: { width: maxX - minX, height: maxY - minY },
            imageInGroup: { x: newImage.x(), y: newImage.y() }
        });
        
        // 부모에 그룹 추가
        parent.add(clipGroup);

        // 원본 이미지 제거
        imageNode.destroy();
        
        // 레이어 다시 그리기
        layer.batchDraw();
        
        console.log('Lasso clip applied successfully with precise coordinate transformation');
        return clipGroup;
        
    } catch (error) {
        console.error('Error applying lasso clip:', error);
        return null;
    }
}