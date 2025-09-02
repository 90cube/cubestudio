// components/imageEditor/tools/transform.js

/**
 * Transform 도구 모듈
 * 이미지의 회전, 크기 조정, 뒤집기 기능을 제공합니다.
 */

let layer;

export function init(konvaLayer) {
    layer = konvaLayer;
}

/**
 * 이미지를 지정된 각도만큼 회전
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {number} angle - 회전할 각도 (도 단위)
 */
export function rotate(imageNode, angle) {
    if (!imageNode) {
        console.warn('No image node provided to rotate function');
        return;
    }
    
    console.log(`Rotating image by ${angle} degrees`);
    
    const currentRotation = imageNode.rotation();
    const newRotation = currentRotation + (angle * Math.PI / 180);
    
    console.log(`Previous rotation: ${currentRotation * 180 / Math.PI}°, New rotation: ${newRotation * 180 / Math.PI}°`);
    
    imageNode.rotation(newRotation);
    layer.batchDraw();
    
    return {
        previousRotation: currentRotation,
        newRotation: imageNode.rotation()
    };
}

/**
 * 이미지를 지정된 스케일로 조정
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {number} scaleX - X축 스케일
 * @param {number} scaleY - Y축 스케일 (선택적)
 */
export function scale(imageNode, scaleX, scaleY = scaleX) {
    if (!imageNode) return;
    
    const previousScale = { x: imageNode.scaleX(), y: imageNode.scaleY() };
    
    imageNode.scaleX(scaleX);
    imageNode.scaleY(scaleY);
    layer.batchDraw();
    
    return {
        previousScale,
        newScale: { x: scaleX, y: scaleY }
    };
}

/**
 * 이미지를 수평 또는 수직으로 뒤집기
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {string} direction - 'horizontal' 또는 'vertical'
 */
export function flip(imageNode, direction) {
    if (!imageNode) return;
    
    const previousScale = { x: imageNode.scaleX(), y: imageNode.scaleY() };
    
    if (direction === 'horizontal') {
        imageNode.scaleX(imageNode.scaleX() * -1);
    } else if (direction === 'vertical') {
        imageNode.scaleY(imageNode.scaleY() * -1);
    }
    
    layer.batchDraw();
    
    return {
        previousScale,
        newScale: { x: imageNode.scaleX(), y: imageNode.scaleY() },
        direction
    };
}

/**
 * 이미지를 특정 위치로 이동
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {number} x - X 좌표
 * @param {number} y - Y 좌표
 */
export function move(imageNode, x, y) {
    if (!imageNode) return;
    
    const previousPosition = { x: imageNode.x(), y: imageNode.y() };
    
    imageNode.x(x);
    imageNode.y(y);
    layer.batchDraw();
    
    return {
        previousPosition,
        newPosition: { x, y }
    };
}

/**
 * 트랜스폼 리셋
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 */
export function reset(imageNode) {
    if (!imageNode) return;
    
    const previousTransform = {
        rotation: imageNode.rotation(),
        scale: { x: imageNode.scaleX(), y: imageNode.scaleY() },
        position: { x: imageNode.x(), y: imageNode.y() }
    };
    
    imageNode.rotation(0);
    imageNode.scaleX(1);
    imageNode.scaleY(1);
    layer.batchDraw();
    
    return {
        previousTransform,
        newTransform: {
            rotation: 0,
            scale: { x: 1, y: 1 },
            position: { x: imageNode.x(), y: imageNode.y() }
        }
    };
}