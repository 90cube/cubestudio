// components/imageEditor/tools/transformer.js

/**
 * Transformer 도구 모듈
 * Konva.Transformer를 사용하여 이미지 변형 기능을 제공합니다.
 */

let layer;
let stage;
let transformer;
let targetImage;
let isTransformMode = false;

export function init(konvaStage, konvaLayer) {
    stage = konvaStage;
    layer = konvaLayer;
    console.log('Transformer tool initialized');
}

/**
 * Transform 모드 시작
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 */
export function startTransformMode(imageNode) {
    if (!imageNode) {
        console.warn('No image node provided for transform');
        return;
    }
    
    console.log('Starting transform mode for image:', imageNode);
    
    // 기존 트랜스폼이 있다면 정리 (중복 방지)
    if (transformer) {
        removeTransformer();
    }
    
    targetImage = imageNode;
    createTransformer();
    setupTransformKeyboardEvents();
    
    isTransformMode = true;
    
    console.log('✅ Transform mode started with visible handles - Press T to toggle, ESC to exit');
    
    return {
        mode: 'transform',
        targetImage: imageNode
    };
}

/**
 * Konva Transformer 생성
 */
function createTransformer() {
    if (!targetImage) return;
    
    // 기존 transformer 제거
    removeTransformer();
    
    // 새 transformer 생성
    transformer = new Konva.Transformer({
        nodes: [targetImage],
        centeredScaling: false,
        rotateAnchorOffset: 60,
        enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
        boundBoxFunc: (oldBox, newBox) => {
            // 최소 크기 제한
            if (newBox.width < 10 || newBox.height < 10) {
                return oldBox;
            }
            return newBox;
        }
    });
    
    // Transformer 이벤트 핸들러
    transformer.on('transformstart', () => {
        console.log('Transform start');
    });
    
    transformer.on('transform', () => {
        console.log('Transforming...');
    });
    
    transformer.on('transformend', () => {
        console.log('Transform end');
    });
    
    // 이미지 이벤트 핸들러
    targetImage.on('transformstart', () => {
        console.log('Image transform start');
    });
    
    targetImage.on('transform', () => {
        // console.log('Image transforming...'); // 너무 많이 호출되므로 주석
    });
    
    targetImage.on('transformend', () => {
        console.log('Image transform end');
        console.log('New dimensions:', targetImage.width(), 'x', targetImage.height());
        console.log('New position:', targetImage.x(), ',', targetImage.y());
        console.log('New rotation:', targetImage.rotation() * 180 / Math.PI, '°');
    });
    
    layer.add(transformer);
    
    // 트랜스폼 모드가 시작될 때 바로 transformer 표시
    transformer.visible(true);
    layer.batchDraw();
}

/**
 * T키 Transform 키보드 이벤트 설정
 */
function setupTransformKeyboardEvents() {
    const handleKeyDown = (e) => {
        if (!targetImage || !transformer) return;
        
        switch (e.key.toLowerCase()) {
            case 'escape':
                e.preventDefault();
                e.stopPropagation();
                console.log('ESC pressed in transform mode - exiting');
                exitTransformMode();
                break;
        }
    };
    
    // 다른 곳 클릭시 transformer 숨기기 (하지만 선택 상태는 유지)
    const handleStageClick = (e) => {
        if (!transformer) return;
        
        // transformer나 target image가 클릭된 경우가 아니면 숨김
        const clickedOnTransformer = e.target === transformer || 
                                   transformer.getStage() && transformer.findAncestor('Transformer');
        const clickedOnTarget = e.target === targetImage;
        
        if (!clickedOnTransformer && !clickedOnTarget) {
            transformer.visible(false);
            layer.batchDraw();
            console.log('Transformer hidden - image still selected, press T to show again');
        }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    stage.on('click tap', handleStageClick);
    
    // 정리를 위한 참조 저장
    transformer._keydownHandler = handleKeyDown;
    transformer._stageClickHandler = handleStageClick;
}

/**
 * Transformer 토글
 */
function toggleTransformer() {
    if (!transformer) return;
    
    const isVisible = transformer.visible();
    transformer.visible(!isVisible);
    layer.batchDraw();
    
    if (!isVisible) {
        console.log('✅ Transformer activated - Use handles to transform, press T to hide');
    } else {
        console.log('Transformer hidden - press T to show again');
    }
}

/**
 * Transform 모드 종료
 */
export function exitTransformMode() {
    removeTransformer();
    
    // 이벤트 리스너 제거
    if (transformer && transformer._keydownHandler) {
        document.removeEventListener('keydown', transformer._keydownHandler);
    }
    if (transformer && transformer._stageClickHandler) {
        stage.off('click tap', transformer._stageClickHandler);
    }
    
    isTransformMode = false;
    targetImage = null;
    
    console.log('Transform mode exited');
    
    return { mode: 'exited' };
}

/**
 * Transformer 제거
 */
function removeTransformer() {
    if (transformer) {
        // 이벤트 리스너 정리
        transformer.off('transformstart');
        transformer.off('transform');
        transformer.off('transformend');
        
        if (targetImage) {
            targetImage.off('transformstart');
            targetImage.off('transform');
            targetImage.off('transformend');
        }
        
        transformer.destroy();
        transformer = null;
        layer.batchDraw();
    }
}

/**
 * Transform 모드 상태 확인
 */
export function isTransformModeActive() {
    return isTransformMode;
}

/**
 * 현재 transformer 반환
 */
export function getTransformer() {
    return transformer;
}

/**
 * Transformer를 특정 노드에 연결
 * @param {Konva.Node} node - 연결할 노드
 */
export function attachTransformer(node) {
    if (!transformer || !node) return;
    
    transformer.nodes([node]);
    transformer.visible(true);
    layer.batchDraw();
    
    console.log('Transformer attached to new node');
}