// frontend/components/poseEditor/poseCanvas.js

/**
 * Konva 기반 포즈 에디터 캔버스
 * DW Pose JSON 데이터를 시각화하고 편집 가능한 포즈 에디터 구현
 */

/**
 * 포즈 에디터 캔버스 생성
 * @param {HTMLElement} containerElement - 캔버스를 렌더링할 컨테이너
 * @param {Object} poseData - DW Pose JSON 데이터
 * @param {Object} options - 캔버스 설정 옵션
 * @returns {Object} 포즈 캔버스 인스턴스
 */
export function createPoseCanvas(containerElement, poseData, options = {}) {
    console.log('🎨 Creating pose canvas with data:', poseData);
    
    // 기본 설정
    const defaultOptions = {
        width: 800,
        height: 600,
        maxWidth: 1200,
        maxHeight: 800,
        pointRadius: 6,
        lineWidth: 3,
        pointColor: '#ff4757',
        lineColor: '#ffffff',
        selectedPointColor: '#ffa502',
        backgroundOpacity: 0.1
    };
    
    const config = { ...defaultOptions, ...options };
    
    // 반응형 크기 계산
    const canvasSize = calculateResponsiveSize(containerElement, poseData, config);
    console.log('📐 Calculated canvas size:', canvasSize);
    
    // Konva 스테이지 생성
    const stage = new Konva.Stage({
        container: containerElement,
        width: canvasSize.width,
        height: canvasSize.height
    });
    
    // 메인 레이어 생성
    const layer = new Konva.Layer();
    stage.add(layer);
    
    // 포즈 데이터 파싱 및 시각화
    const poseElements = createPoseElements(poseData, canvasSize, config);
    
    // 포즈 요소들을 레이어에 추가
    poseElements.lines.forEach(line => layer.add(line));
    poseElements.points.forEach(point => layer.add(point));
    
    // 편집 이벤트 설정
    setupEditEvents(stage, layer, poseElements, config);
    
    // 초기 렌더링
    layer.batchDraw();
    
    // 캔버스 인스턴스 반환
    return {
        stage,
        layer,
        poseElements,
        config: canvasSize,
        
        // 공개 메서드들
        getPoseData: () => extractPoseData(poseElements, canvasSize),
        updatePose: (newData) => updatePoseVisualization(layer, poseElements, newData, canvasSize, config),
        resetPose: () => resetToOriginalPose(layer, poseElements, poseData, canvasSize, config),
        getCanvasImage: () => stage.toDataURL(),
        destroy: () => stage.destroy(),
        
        // 반응형 리사이즈
        resize: () => {
            const newSize = calculateResponsiveSize(containerElement, poseData, config);
            resizeCanvas(stage, layer, poseElements, newSize, canvasSize);
        }
    };
}

/**
 * 반응형 캔버스 크기 계산 (이미지 크기에 맞춰 자동 조정)
 */
function calculateResponsiveSize(container, poseData, config) {
    // 컨테이너 크기 가져오기
    const containerRect = container.getBoundingClientRect();
    const maxWidth = Math.min(containerRect.width - 40, config.maxWidth);
    const maxHeight = Math.min(containerRect.height - 40, config.maxHeight);
    
    console.log('📦 Container size:', { width: containerRect.width, height: containerRect.height });
    console.log('📏 Max canvas size:', { maxWidth, maxHeight });
    
    // 포즈 데이터에서 이미지 크기 정보 추출
    let imageWidth = config.width;
    let imageHeight = config.height;
    
    if (poseData && poseData.image_info) {
        imageWidth = poseData.image_info.width || config.width;
        imageHeight = poseData.image_info.height || config.height;
    } else if (poseData && poseData.canvas_width && poseData.canvas_height) {
        // 백엔드에서 전달된 canvas_width, canvas_height 사용
        imageWidth = poseData.canvas_width;
        imageHeight = poseData.canvas_height;
        console.log('📊 Using backend canvas dimensions:', { imageWidth, imageHeight });
    } else if (poseData && poseData.keypoints && poseData.keypoints.length > 0) {
        // keypoints에서 최대 좌표값으로 추정
        const allPoints = poseData.keypoints.flat();
        const xCoords = allPoints.filter((_, i) => i % 3 === 0);
        const yCoords = allPoints.filter((_, i) => i % 3 === 1);
        
        if (xCoords.length > 0 && yCoords.length > 0) {
            imageWidth = Math.max(...xCoords) + 50; // 여백 추가
            imageHeight = Math.max(...yCoords) + 50;
        }
    }
    
    console.log('🖼️ Detected image size:', { imageWidth, imageHeight });
    
    // 가로세로 비율 유지하면서 최대 크기에 맞춤
    const aspectRatio = imageWidth / imageHeight;
    let canvasWidth = imageWidth;
    let canvasHeight = imageHeight;
    
    if (canvasWidth > maxWidth) {
        canvasWidth = maxWidth;
        canvasHeight = canvasWidth / aspectRatio;
    }
    
    if (canvasHeight > maxHeight) {
        canvasHeight = maxHeight;
        canvasWidth = canvasHeight * aspectRatio;
    }
    
    // 최소 크기 보장
    canvasWidth = Math.max(canvasWidth, 400);
    canvasHeight = Math.max(canvasHeight, 300);
    
    const scaleX = canvasWidth / imageWidth;
    const scaleY = canvasHeight / imageHeight;
    
    console.log('✅ Final canvas size:', { 
        width: canvasWidth, 
        height: canvasHeight, 
        scaleX, 
        scaleY,
        aspectRatio 
    });
    
    return {
        width: canvasWidth,
        height: canvasHeight,
        scaleX,
        scaleY,
        originalWidth: imageWidth,
        originalHeight: imageHeight,
        aspectRatio
    };
}

/**
 * 포즈 요소 생성 (점과 선)
 */
function createPoseElements(poseData, canvasSize, config) {
    const elements = {
        points: [],
        lines: [],
        connections: []
    };
    
    if (!poseData || !poseData.keypoints) {
        console.warn('⚠️ No valid pose data provided');
        return elements;
    }
    
    console.log('🔗 Creating pose elements from data:', poseData);
    
    // COCO 17 키포인트 연결 정의
    // 0:nose, 1:left_eye, 2:right_eye, 3:left_ear, 4:right_ear,
    // 5:left_shoulder, 6:right_shoulder, 7:left_elbow, 8:right_elbow,
    // 9:left_wrist, 10:right_wrist, 11:left_hip, 12:right_hip,
    // 13:left_knee, 14:right_knee, 15:left_ankle, 16:right_ankle
    const connections = [
        // 머리 연결
        [0, 1], [0, 2],                    // nose -> eyes
        [1, 3], [2, 4],                    // left_eye->left_ear, right_eye->right_ear
        
        // 목 연결 (nose to shoulders for neck representation)
        [0, 5], [0, 6],                    // nose -> shoulders (목 대체)
        
        [5, 6],                            // left_shoulder -> right_shoulder
        
        // 상체 연결  
        [5, 7], [7, 9],                    // left_shoulder->left_elbow->left_wrist
        [6, 8], [8, 10],                   // right_shoulder->right_elbow->right_wrist
        [5, 11], [6, 12],                  // shoulders -> hips
        [11, 12],                          // left_hip -> right_hip
        
        // 하체 연결
        [11, 13], [13, 15],                // left_hip->left_knee->left_ankle  
        [12, 14], [14, 16]                 // right_hip->right_knee->right_ankle
    ];
    
    // 키포인트들을 [x, y, confidence] 형태로 파싱
    const keypoints = [];
    for (let i = 0; i < poseData.keypoints.length; i += 3) {
        keypoints.push([
            poseData.keypoints[i] * canvasSize.scaleX,     // x 좌표 스케일링
            poseData.keypoints[i + 1] * canvasSize.scaleY, // y 좌표 스케일링
            poseData.keypoints[i + 2]                       // confidence
        ]);
    }
    
    console.log(`📍 Processed ${keypoints.length} keypoints`);
    
    // 연결선 생성
    connections.forEach((connection, index) => {
        const [startIdx, endIdx] = connection;
        
        if (startIdx < keypoints.length && endIdx < keypoints.length) {
            const startPoint = keypoints[startIdx];
            const endPoint = keypoints[endIdx];
            
            // confidence가 임계값 이상이고 좌표가 유효한 경우만 선 그리기
            if (startPoint[2] > 0.3 && endPoint[2] > 0.3 && 
                startPoint[0] > 0 && startPoint[1] > 0 && 
                endPoint[0] > 0 && endPoint[1] > 0 &&
                startPoint[0] < canvasSize.width && startPoint[1] < canvasSize.height &&
                endPoint[0] < canvasSize.width && endPoint[1] < canvasSize.height) {
                const line = new Konva.Line({
                    points: [startPoint[0], startPoint[1], endPoint[0], endPoint[1]],
                    stroke: config.lineColor,
                    strokeWidth: config.lineWidth,
                    lineCap: 'round',
                    lineJoin: 'round',
                    name: `connection-${startIdx}-${endIdx}`,
                    listening: false // 선은 드래그 불가
                });
                
                elements.lines.push(line);
                elements.connections.push({ startIdx, endIdx, line });
            }
        }
    });
    
    // 키포인트 생성 (드래그 가능한 원)
    keypoints.forEach((point, index) => {
        const [x, y, confidence] = point;
        
        if (confidence > 0.3) { // confidence 임계값 이상만 표시
            const circle = new Konva.Circle({
                x: x,
                y: y,
                radius: config.pointRadius,
                fill: config.pointColor,
                stroke: '#ffffff',
                strokeWidth: 2,
                draggable: true,
                name: `keypoint-${index}`,
                keypointIndex: index,
                originalConfidence: confidence,
                shadowBlur: 4,
                shadowColor: 'rgba(0, 0, 0, 0.3)',
                shadowOffset: { x: 1, y: 1 }
            });
            
            // 호버 효과
            circle.on('mouseenter', function() {
                this.fill(config.selectedPointColor);
                this.radius(config.pointRadius + 2);
                this.getLayer().batchDraw();
                document.body.style.cursor = 'pointer';
            });
            
            circle.on('mouseleave', function() {
                this.fill(config.pointColor);
                this.radius(config.pointRadius);
                this.getLayer().batchDraw();
                document.body.style.cursor = 'default';
            });
            
            elements.points.push(circle);
        }
    });
    
    console.log(`✅ Created ${elements.points.length} points and ${elements.lines.length} lines`);
    
    return elements;
}

/**
 * 편집 이벤트 설정
 */
function setupEditEvents(stage, layer, poseElements, config) {
    // 키포인트 드래그 이벤트
    poseElements.points.forEach(point => {
        point.on('dragmove', function() {
            updateConnectedLines(this, poseElements);
            layer.batchDraw();
        });
        
        point.on('dragend', function() {
            console.log(`🎯 Keypoint ${this.getAttr('keypointIndex')} moved to (${this.x()}, ${this.y()})`);
        });
    });
    
    // 전역 키보드 이벤트
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // 선택 해제
            poseElements.points.forEach(point => {
                point.fill(config.pointColor);
                point.radius(config.pointRadius);
            });
            layer.batchDraw();
        }
    });
}

/**
 * 연결된 선들 업데이트
 */
function updateConnectedLines(movedPoint, poseElements) {
    const pointIndex = movedPoint.getAttr('keypointIndex');
    
    poseElements.connections.forEach(connection => {
        const { startIdx, endIdx, line } = connection;
        
        if (startIdx === pointIndex || endIdx === pointIndex) {
            const startPoint = poseElements.points.find(p => p.getAttr('keypointIndex') === startIdx);
            const endPoint = poseElements.points.find(p => p.getAttr('keypointIndex') === endIdx);
            
            if (startPoint && endPoint) {
                line.points([
                    startPoint.x(), startPoint.y(),
                    endPoint.x(), endPoint.y()
                ]);
            }
        }
    });
}

/**
 * 현재 포즈 데이터 추출
 */
function extractPoseData(poseElements, canvasSize) {
    const keypoints = [];
    
    // 17개 키포인트 순서대로 정렬하여 추출
    for (let i = 0; i < 17; i++) {
        const point = poseElements.points.find(p => p.getAttr('keypointIndex') === i);
        
        if (point) {
            // 캔버스 좌표를 원본 이미지 좌표로 변환
            const originalX = point.x() / canvasSize.scaleX;
            const originalY = point.y() / canvasSize.scaleY;
            const confidence = point.getAttr('originalConfidence') || 1.0;
            
            keypoints.push(originalX, originalY, confidence);
        } else {
            // 없는 키포인트는 0, 0, 0으로 채움
            keypoints.push(0, 0, 0);
        }
    }
    
    console.log('📤 Extracted pose data:', { keypointsCount: keypoints.length / 3 });
    
    return {
        keypoints: keypoints,
        image_info: {
            width: canvasSize.originalWidth,
            height: canvasSize.originalHeight
        }
    };
}

/**
 * 포즈 시각화 업데이트
 */
function updatePoseVisualization(layer, poseElements, newData, canvasSize, config) {
    // 기존 요소들 제거
    poseElements.points.forEach(point => point.destroy());
    poseElements.lines.forEach(line => line.destroy());
    
    // 새로운 요소들 생성
    const newElements = createPoseElements(newData, canvasSize, config);
    
    // 새 요소들을 레이어에 추가
    newElements.lines.forEach(line => layer.add(line));
    newElements.points.forEach(point => layer.add(point));
    
    // 이벤트 재설정
    setupEditEvents(layer.getStage(), layer, newElements, config);
    
    // 기존 참조 업데이트
    poseElements.points = newElements.points;
    poseElements.lines = newElements.lines;
    poseElements.connections = newElements.connections;
    
    layer.batchDraw();
    
    console.log('🔄 Pose visualization updated');
}

/**
 * 원본 포즈로 리셋
 */
function resetToOriginalPose(layer, poseElements, originalData, canvasSize, config) {
    console.log('🔄 Resetting to original pose');
    updatePoseVisualization(layer, poseElements, originalData, canvasSize, config);
}

/**
 * 캔버스 리사이즈
 */
function resizeCanvas(stage, layer, poseElements, newSize, currentSize) {
    console.log('📏 Resizing canvas:', { from: currentSize, to: newSize });
    
    // 스테이지 크기 변경
    stage.width(newSize.width);
    stage.height(newSize.height);
    
    // 모든 요소들의 위치와 크기 스케일링
    const scaleFactorX = newSize.scaleX / currentSize.scaleX;
    const scaleFactorY = newSize.scaleY / currentSize.scaleY;
    
    poseElements.points.forEach(point => {
        point.x(point.x() * scaleFactorX);
        point.y(point.y() * scaleFactorY);
    });
    
    poseElements.lines.forEach(line => {
        const points = line.points();
        const scaledPoints = points.map((coord, index) => {
            return index % 2 === 0 ? coord * scaleFactorX : coord * scaleFactorY;
        });
        line.points(scaledPoints);
    });
    
    layer.batchDraw();
    
    // 현재 크기 정보 업데이트
    Object.assign(currentSize, newSize);
    
    console.log('✅ Canvas resized successfully');
}