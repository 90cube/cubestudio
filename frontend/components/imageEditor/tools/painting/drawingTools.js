// painting/drawingTools.js - 기본 그리기/지우기 도구

import { getPaintingCanvas, getPaintingLayer, isPaintingModeActive } from './paintingMode.js';

let currentTool = 'brush'; // brush, eraser, magnifier
let currentColor = '#ff6b6b';
let currentSize = 10;
let currentOpacity = 1.0; // 브러시 불투명도 (0.0 - 1.0)
let isDrawing = false;
let lastLine;

/**
 * 그리기 도구 초기화
 */
export function init() {
    console.log('🖌️ Drawing tools initialized');
}

/**
 * 캔버스 확대/이동을 고려한 마우스 좌표 계산
 */
function getAdjustedPointerPosition(canvas) {
    const rawPos = canvas.getPointerPosition();
    if (!rawPos) return { x: 0, y: 0 };
    
    // 캔버스의 현재 변환 정보 가져오기
    const transform = canvas.getAbsoluteTransform().copy();
    transform.invert();
    
    // 마우스 좌표를 캔버스의 로컬 좌표로 변환
    const adjustedPos = transform.point(rawPos);
    
    return adjustedPos;
}

/**
 * 페인팅 캔버스에 그리기 이벤트 설정
 * (paintingMode.js에서 캔버스 생성 후 호출)
 */
export function setupDrawingEvents() {
    const canvas = getPaintingCanvas();
    const layer = getPaintingLayer();
    
    if (!canvas || !layer) {
        console.warn('Painting canvas or layer not available');
        return;
    }
    
    // 마우스 다운 - 그리기 시작
    canvas.on('mousedown touchstart', (e) => {
        if (!isPaintingModeActive()) return;
        
        isDrawing = true;
        const pos = getAdjustedPointerPosition(canvas);
        
        if (currentTool === 'brush') {
            startBrushStroke(pos, layer);
        } else if (currentTool === 'eraser') {
            startEraserStroke(pos, layer);
        } else if (currentTool === 'magnifier') {
            handleMagnifierClick(pos);
        }
    });
    
    // 마우스 이동 - 그리기 계속
    canvas.on('mousemove touchmove', (e) => {
        if (!isDrawing || !isPaintingModeActive()) return;
        
        const pos = getAdjustedPointerPosition(canvas);
        
        if (currentTool === 'brush') {
            continueBrushStroke(pos, layer);
        } else if (currentTool === 'eraser') {
            continueEraserStroke(pos, layer);
        }
        // 돋보기 도구는 드래그 중에는 아무것도 하지 않음
    });
    
    // 마우스 업 - 그리기 끝
    canvas.on('mouseup touchend', (e) => {
        if (!isPaintingModeActive()) return;
        
        isDrawing = false;
        
        // 그리기 완료 후 레이어 캐시 업데이트 (지우개 기능을 위해)
        if (lastLine) {
            setTimeout(() => {
                layer.cache();
                layer.batchDraw();
            }, 10);
        }
        
        lastLine = null;
    });
    
    // 마우스가 캔버스를 벗어났을 때도 그리기 중단
    canvas.on('mouseleave', (e) => {
        if (!isPaintingModeActive()) return;
        
        isDrawing = false;
        lastLine = null;
    });
    
    console.log('🖌️ Drawing events setup complete');
}

/**
 * 브러시 스트로크 시작
 */
function startBrushStroke(pos, layer) {
    lastLine = new Konva.Line({
        stroke: currentColor,
        strokeWidth: currentSize,
        globalCompositeOperation: 'source-over',
        lineCap: 'round',
        lineJoin: 'round',
        points: [pos.x, pos.y, pos.x, pos.y],
        opacity: currentOpacity // 설정된 불투명도 사용
    });
    
    layer.add(lastLine);
    // 브러시 시작 즉시 표시
    layer.draw();
}

/**
 * 브러시 스트로크 계속
 */
function continueBrushStroke(pos, layer) {
    if (!lastLine) return;
    
    const newPoints = lastLine.points().concat([pos.x, pos.y]);
    lastLine.points(newPoints);
    
    // 실시간 렌더링을 위해 즉시 다시 그리기
    layer.draw();
}

/**
 * 지우개 스트로크 시작
 */
function startEraserStroke(pos, layer) {
    lastLine = new Konva.Line({
        stroke: '#ffffff', // 지우개는 흰색으로 표시 (시각적 피드백용)
        strokeWidth: currentSize * 1.5, // 지우개는 약간 크게
        globalCompositeOperation: 'destination-out', // 실제 지우기 모드
        lineCap: 'round',
        lineJoin: 'round',
        points: [pos.x, pos.y, pos.x, pos.y],
        opacity: 1.0 // 완전 불투명하게 지우기
    });
    
    layer.add(lastLine);
    // 지우개 시작 즉시 표시
    layer.draw();
}

/**
 * 지우개 스트로크 계속
 */
function continueEraserStroke(pos, layer) {
    if (!lastLine) return;
    
    const newPoints = lastLine.points().concat([pos.x, pos.y]);
    lastLine.points(newPoints);
    
    // 실시간 렌더링을 위해 즉시 다시 그리기
    layer.draw();
}

/**
 * 돋보기 클릭 처리
 */
function handleMagnifierClick(pos) {
    const canvas = getPaintingCanvas();
    if (!canvas) return;
    
    // 현재 스케일 가져오기
    const currentScale = canvas.scaleX();
    let newScale;
    
    // 스케일 단계: 1x → 2x → 4x → 1x (순환)
    if (currentScale >= 4) {
        newScale = 1; // 리셋
    } else if (currentScale >= 2) {
        newScale = 4; // 4배 확대
    } else {
        newScale = 2; // 2배 확대
    }
    
    // 클릭한 지점을 중심으로 확대 (이미 조정된 좌표 사용)
    const centerX = pos.x;
    const centerY = pos.y;
    
    // 새로운 위치 계산 (클릭 지점이 중앙에 오도록)
    const currentX = canvas.x();
    const currentY = canvas.y();
    
    // 현재 확대 상태에서 클릭한 지점의 실제 위치
    const realCenterX = (centerX * currentScale) + currentX;
    const realCenterY = (centerY * currentScale) + currentY;
    
    // 새로운 위치 계산 (클릭 지점이 화면 중앙에 오도록)
    const newX = (canvas.width() / 2) - (centerX * newScale);
    const newY = (canvas.height() / 2) - (centerY * newScale);
    
    // 애니메이션으로 확대/축소
    canvas.to({
        scaleX: newScale,
        scaleY: newScale,
        x: newX,
        y: newY,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut
    });
    
    console.log(`🔍 Magnifier: ${currentScale.toFixed(1)}x → ${newScale}x at (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
}

/**
 * 도구 변경
 */
export function setTool(tool) {
    if (['brush', 'eraser', 'magnifier'].includes(tool)) {
        currentTool = tool;
        console.log(`🛠️ Tool changed to: ${tool}`);
        
        // 돋보기 도구 선택 시 캔버스 커서 변경
        const canvas = getPaintingCanvas();
        if (canvas && canvas.content) {
            if (tool === 'magnifier') {
                canvas.content.style.cursor = 'zoom-in';
            } else {
                canvas.content.style.cursor = 'crosshair';
            }
        }
    } else {
        console.warn(`Unknown tool: ${tool}`);
    }
}

/**
 * 브러시 색상 변경
 */
export function setBrushColor(color) {
    currentColor = color;
    console.log(`🎨 Brush color changed to: ${color}`);
}

/**
 * 브러시 크기 변경
 */
export function setBrushSize(size) {
    currentSize = Math.max(1, Math.min(100, size)); // 1-100 사이로 제한
    console.log(`📏 Brush size changed to: ${currentSize}`);
}

/**
 * 브러시 불투명도 변경
 */
export function setBrushOpacity(opacity) {
    currentOpacity = Math.max(0.1, Math.min(1.0, opacity)); // 0.1-1.0 사이로 제한
    console.log(`🔳 Brush opacity changed to: ${currentOpacity}`);
}

/**
 * 현재 도구 정보 반환
 */
export function getCurrentTool() {
    return {
        tool: currentTool,
        color: currentColor,
        size: currentSize,
        opacity: currentOpacity
    };
}

/**
 * 전체 그림 지우기
 */
export function clearAll() {
    const layer = getPaintingLayer();
    if (layer) {
        layer.removeChildren();
        layer.batchDraw();
        console.log('🗑️ All drawings cleared');
    }
}

/**
 * 실행 취소 (향후 구현)
 */
export function undo() {
    console.log('↶ Undo (not implemented yet)');
    // TODO: 히스토리 기반 실행 취소 구현
}

/**
 * 다시 실행 (향후 구현) 
 */
export function redo() {
    console.log('↷ Redo (not implemented yet)');
    // TODO: 히스토리 기반 다시 실행 구현
}