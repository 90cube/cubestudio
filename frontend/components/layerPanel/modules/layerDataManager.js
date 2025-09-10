// components/layerPanel/modules/layerDataManager.js

import { getImageTypeInfo } from '../../preprocessing/preprocessorManager.js';

/**
 * 레이어 데이터 관리 모듈
 * 캔버스의 이미지들을 레이어로 관리하고 상태를 추적합니다.
 */

let layerUpdateCallbacks = new Set();

/**
 * 레이어 업데이트 콜백 등록
 * @param {Function} callback - 레이어가 변경될 때 호출할 함수
 */
export function onLayerUpdate(callback) {
    layerUpdateCallbacks.add(callback);
}

/**
 * 레이어 업데이트 콜백 해제
 * @param {Function} callback - 해제할 콜백 함수
 */
export function offLayerUpdate(callback) {
    layerUpdateCallbacks.delete(callback);
}

/**
 * 레이어 업데이트 이벤트 발생
 */
function notifyLayerUpdate() {
    layerUpdateCallbacks.forEach(callback => {
        try {
            callback();
        } catch (error) {
            console.error('Layer update callback error:', error);
        }
    });
}

/**
 * 캔버스에서 모든 이미지 레이어 가져오기
 * @param {Konva.Layer} layer - Konva 레이어
 * @returns {Array} 레이어 정보 배열
 */
export function getAllLayers(layer) {
    if (!layer) {
        console.warn('No layer provided to getAllLayers');
        return [];
    }

    const imageNodes = layer.find('Image');
    const layers = [];

    imageNodes.forEach((imageNode, index) => {
        const typeInfo = getImageTypeInfo(imageNode);
        const layerInfo = {
            id: imageNode.id() || imageNode._id || `image-${index}`,
            name: getLayerName(imageNode, typeInfo),
            imageType: typeInfo ? typeInfo.imageType : 'normal',
            imageNode: imageNode,
            visible: imageNode.visible(),
            opacity: imageNode.opacity() || 1,
            zIndex: imageNode.zIndex(),
            createdAt: typeInfo ? typeInfo.createdAt : null,
            processingSource: typeInfo ? typeInfo.processingSource : 'user',
            originalImageId: typeInfo ? typeInfo.originalImageId : null
        };
        layers.push(layerInfo);
    });

    // Z-Index 기준으로 정렬 (위쪽이 높은 값)
    layers.sort((a, b) => b.zIndex - a.zIndex);

    console.log(`📋 Found ${layers.length} layers:`, layers.map(l => `${l.name} (${l.imageType})`));
    
    return layers;
}

/**
 * 레이어 이름 생성
 * @param {Konva.Image} imageNode - 이미지 노드
 * @param {Object} typeInfo - 타입 정보
 * @returns {string} 레이어 이름
 */
function getLayerName(imageNode, typeInfo) {
    // 커스텀 이름이 있으면 사용
    if (imageNode.getAttr('layerName')) {
        return imageNode.getAttr('layerName');
    }

    // 타입에 따른 기본 이름 생성
    if (typeInfo && typeInfo.imageType === 'preproc') {
        const source = typeInfo.processingSource || 'preprocessing';
        if (source === 'preprocessing') {
            return 'Preprocessed Image';
        } else if (source === 'manual') {
            return 'Manual Preproc';
        }
        return `${source} Result`;
    }

    return 'Image Layer';
}

/**
 * 레이어 이름 설정
 * @param {Konva.Image} imageNode - 이미지 노드
 * @param {string} name - 새 이름
 */
export function setLayerName(imageNode, name) {
    if (imageNode && name) {
        imageNode.setAttr('layerName', name);
        notifyLayerUpdate();
        console.log(`🏷️ Layer name updated: "${name}"`);
    }
}

/**
 * 레이어 가시성 토글
 * @param {Konva.Image} imageNode - 이미지 노드
 * @param {boolean} visible - 가시성 여부
 */
export function setLayerVisibility(imageNode, visible) {
    if (imageNode) {
        imageNode.visible(visible);
        imageNode.getLayer().batchDraw();
        notifyLayerUpdate();
        console.log(`👁️ Layer visibility: ${visible ? 'shown' : 'hidden'}`);
    }
}

/**
 * 레이어 불투명도 설정
 * @param {Konva.Image} imageNode - 이미지 노드
 * @param {number} opacity - 불투명도 (0-1)
 */
export function setLayerOpacity(imageNode, opacity) {
    if (imageNode && typeof opacity === 'number') {
        imageNode.opacity(Math.max(0, Math.min(1, opacity)));
        imageNode.getLayer().batchDraw();
        notifyLayerUpdate();
        console.log(`🎚️ Layer opacity: ${Math.round(opacity * 100)}%`);
    }
}

/**
 * 레이어 선택
 * @param {Konva.Image} imageNode - 선택할 이미지 노드
 */
export function selectLayer(imageNode) {
    if (imageNode) {
        // canvas.js의 setSelectedImage 함수 동적 import로 호출
        import('../../canvas/canvas.js').then(canvasModule => {
            if (canvasModule.setSelectedImage) {
                canvasModule.setSelectedImage(imageNode);
                console.log(`🎯 Layer selected: ${getLayerName(imageNode)}`);
            }
        }).catch(error => {
            console.error('Failed to import canvas module:', error);
        });
        
        notifyLayerUpdate();
    }
}

/**
 * 타입별 레이어 통계 가져오기
 * @param {Array} layers - 레이어 배열
 * @returns {Object} 통계 정보
 */
export function getLayerStats(layers) {
    const stats = {
        total: layers.length,
        normal: 0,
        preproc: 0,
        visible: 0,
        hidden: 0
    };

    layers.forEach(layer => {
        if (layer.imageType === 'normal') {
            stats.normal++;
        } else if (layer.imageType === 'preproc') {
            stats.preproc++;
        }

        if (layer.visible) {
            stats.visible++;
        } else {
            stats.hidden++;
        }
    });

    return stats;
}

/**
 * 레이어 Z-Index 재정렬
 * @param {Array} layers - 새로운 순서의 레이어 배열
 */
export function reorderLayers(layers) {
    layers.forEach((layer, index) => {
        // 위쪽에 있는 레이어가 높은 Z-Index를 가져야 함
        const newZIndex = layers.length - index;
        layer.imageNode.zIndex(newZIndex);
    });

    // 레이어 다시 그리기
    if (layers.length > 0) {
        layers[0].imageNode.getLayer().batchDraw();
    }

    notifyLayerUpdate();
    console.log('🔄 Layers reordered');
}