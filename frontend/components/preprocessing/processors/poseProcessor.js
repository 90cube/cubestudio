// components/preprocessing/processors/poseProcessor.js

import pathConfig from '../../../core/pathConfig.js';

/**
 * Pose Detection 전처리기 (OpenPose, DWPose, MediaPipe)
 * 인체 포즈, 골격, 얼굴 랜드마크 검출을 수행합니다.
 */

/**
 * 포즈 검출 수행
 * @param {HTMLImageElement} imageElement - 원본 이미지 엘리먼트
 * @param {Object} params - 포즈 검출 파라미터
 * @returns {HTMLCanvasElement} 처리된 캔버스
 */
export function processPoseDetection(imageElement, params = {}) {
    const {
        poseModel = 'COCO',
        confidenceThreshold = 0.5,
        keypointThickness = 3,
        skeletonThickness = 2,
        detectFace = false,
        detectHands = false,
        multiPerson = true
    } = params;
    
    // 실제 포즈 검출은 AI 모델이 필요하므로 백엔드 처리 필요
    // 여기서는 데모용 스켈레톤 시각화를 구현
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    // 원본 이미지를 배경으로 그리기
    ctx.drawImage(imageElement, 0, 0);
    
    // 데모용 포즈 시각화 (실제로는 AI 모델 결과 사용)
    drawDemoPose(ctx, canvas.width, canvas.height, {
        poseModel,
        confidenceThreshold,
        keypointThickness,
        skeletonThickness,
        detectFace,
        detectHands
    });
    
    return canvas;
}

/**
 * 데모용 포즈 시각화
 */
function drawDemoPose(ctx, width, height, params) {
    const { poseModel, keypointThickness, skeletonThickness, detectFace, detectHands } = params;
    
    // 캔버스 중앙에 기본 인체 포즈 그리기
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height) * 0.3;
    
    // COCO 18-point 포즈 모델의 키포인트 정의
    const cocoKeypoints = {
        // 상체
        'nose': [0, -0.8],
        'neck': [0, -0.6],
        'right_shoulder': [-0.3, -0.5],
        'left_shoulder': [0.3, -0.5],
        'right_elbow': [-0.5, -0.2],
        'left_elbow': [0.5, -0.2],
        'right_wrist': [-0.7, 0.1],
        'left_wrist': [0.7, 0.1],
        
        // 하체
        'right_hip': [-0.15, 0],
        'left_hip': [0.15, 0],
        'right_knee': [-0.2, 0.4],
        'left_knee': [0.2, 0.4],
        'right_ankle': [-0.15, 0.8],
        'left_ankle': [0.15, 0.8],
        
        // 얼굴 (선택적)
        'right_eye': [-0.05, -0.85],
        'left_eye': [0.05, -0.85],
        'right_ear': [-0.1, -0.8],
        'left_ear': [0.1, -0.8]
    };
    
    // 실제 픽셀 좌표로 변환
    const keypoints = {};
    for (const [name, [x, y]] of Object.entries(cocoKeypoints)) {
        keypoints[name] = [
            centerX + x * scale,
            centerY + y * scale
        ];
    }
    
    // 스켈레톤 연결 정의
    const connections = [
        // 머리와 목
        ['nose', 'neck'],
        ['neck', 'right_shoulder'],
        ['neck', 'left_shoulder'],
        
        // 팔
        ['right_shoulder', 'right_elbow'],
        ['right_elbow', 'right_wrist'],
        ['left_shoulder', 'left_elbow'],
        ['left_elbow', 'left_wrist'],
        
        // 몸통
        ['right_shoulder', 'right_hip'],
        ['left_shoulder', 'left_hip'],
        ['right_hip', 'left_hip'],
        
        // 다리
        ['right_hip', 'right_knee'],
        ['right_knee', 'right_ankle'],
        ['left_hip', 'left_knee'],
        ['left_knee', 'left_ankle']
    ];
    
    // 얼굴 연결 (선택적)
    if (detectFace) {
        connections.push(
            ['nose', 'right_eye'],
            ['nose', 'left_eye'],
            ['right_eye', 'right_ear'],
            ['left_eye', 'left_ear']
        );
    }
    
    // 스켈레톤 선 그리기
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = skeletonThickness;
    ctx.lineCap = 'round';
    
    connections.forEach(([start, end]) => {
        if (keypoints[start] && keypoints[end]) {
            const [x1, y1] = keypoints[start];
            const [x2, y2] = keypoints[end];
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    });
    
    // 키포인트 그리기
    ctx.fillStyle = '#ff0000';
    for (const [name, [x, y]] of Object.entries(keypoints)) {
        // 얼굴 키포인트는 선택적으로만 그리기
        if (!detectFace && ['right_eye', 'left_eye', 'right_ear', 'left_ear'].includes(name)) {
            continue;
        }
        
        ctx.beginPath();
        ctx.arc(x, y, keypointThickness, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // 손 키포인트 (선택적)
    if (detectHands) {
        drawHandKeypoints(ctx, keypoints['right_wrist'], keypoints['left_wrist'], keypointThickness);
    }
    
    // 모델 정보 표시
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 200, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(`Model: ${poseModel}`, 15, 30);
    ctx.fillText(`Keypoints: ${Object.keys(keypoints).length}`, 15, 50);
    ctx.fillText('Demo Pose Detection', 15, 70);
}

/**
 * 손 키포인트 그리기
 */
function drawHandKeypoints(ctx, rightWrist, leftWrist, thickness) {
    const handScale = thickness * 0.5;
    
    // 오른손
    if (rightWrist) {
        const [wx, wy] = rightWrist;
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI) / 4;
            const x = wx + Math.cos(angle) * handScale * 3;
            const y = wy + Math.sin(angle) * handScale * 3;
            
            ctx.beginPath();
            ctx.arc(x, y, handScale, 0, 2 * Math.PI);
            ctx.fillStyle = '#0080ff';
            ctx.fill();
        }
    }
    
    // 왼손
    if (leftWrist) {
        const [wx, wy] = leftWrist;
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI) / 4;
            const x = wx + Math.cos(angle) * handScale * 3;
            const y = wy + Math.sin(angle) * handScale * 3;
            
            ctx.beginPath();
            ctx.arc(x, y, handScale, 0, 2 * Math.PI);
            ctx.fillStyle = '#0080ff';
            ctx.fill();
        }
    }
}

/**
 * 백엔드 AI 모델을 사용한 실제 포즈 검출
 * @param {HTMLImageElement} imageElement - 원본 이미지
 * @param {string} modelId - 사용할 포즈 모델 ID
 * @param {Object} params - 검출 파라미터
 * @returns {Promise<HTMLCanvasElement>} 처리된 캔버스
 */
export async function processPoseWithAI(imageElement, modelId, params = {}) {
    try {
        // Konva 이미지를 데이터 URL로 변환
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = imageElement.width;
        canvas.height = imageElement.height;
        ctx.drawImage(imageElement, 0, 0);
        const imageDataUrl = canvas.toDataURL('image/png');
        
        console.log(`🤸 ${modelId} 포즈 검출 시작...`);
        
        // 백엔드 API 호출
        const response = await fetch('http://localhost:8080/api/pose-detection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageDataUrl,
                model: modelId,
                params: {
                    ...params,
                    confidence_threshold: params.confidenceThreshold || 0.5,
                    keypoint_thickness: params.keypointThickness || 3,
                    skeleton_thickness: params.skeletonThickness || 2
                }
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Pose detection API failed: ${response.status} - ${error.error || 'Unknown error'}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Pose detection failed');
        }
        
        console.log(`✅ ${modelId} 포즈 검출 완료`);
        
        // 결과 이미지를 캔버스로 변환
        const resultCanvas = document.createElement('canvas');
        const resultCtx = resultCanvas.getContext('2d');
        const img = new Image();
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                resultCanvas.width = img.width;
                resultCanvas.height = img.height;
                resultCtx.drawImage(img, 0, 0);
                resolve(resultCanvas);
            };
            img.onerror = () => reject(new Error('Failed to load processed pose image'));
            img.src = result.processed_image; // Base64 데이터 URL
        });
        
    } catch (error) {
        console.error(`❌ ${modelId} 포즈 검출 실패:`, error);
        
        // 폴백: 데모 포즈 시각화
        console.log('폴백: 데모 포즈 검출 사용');
        return processPoseDetection(imageElement, params);
    }
}

/**
 * Konva 이미지 노드를 HTMLImageElement로 변환
 */
export function konvaImageToHTMLImage(imageNode) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => resolve(img);
        img.onerror = reject;
        
        const originalImage = imageNode.image();
        if (originalImage instanceof HTMLImageElement) {
            img.src = originalImage.src;
        } else if (originalImage instanceof HTMLCanvasElement) {
            img.src = originalImage.toDataURL();
        } else {
            reject(new Error('Unsupported image type'));
        }
    });
}

/**
 * 캔버스를 Blob으로 변환
 */
export function canvasToBlob(canvas) {
    return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
    });
}

/**
 * 전처리된 이미지 저장
 */
export async function savePreprocessedImage(canvas, filename = null, options = {}) {
    try {
        if (!filename) {
            const prefix = options.prefix || 'pose_detection';
            filename = pathConfig.generateFilename(prefix, '.png');
        }
        
        const fullPath = pathConfig.getFullPath('preprocessor', filename);
        const blob = await canvasToBlob(canvas);
        
        try {
            const imageDataUrl = canvas.toDataURL('image/png');
            
            const response = await fetch('http://localhost:8080/api/save-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: imageDataUrl,
                    filename: filename,
                    path: pathConfig.getPreprocessorPath(),
                    type: 'preprocessor'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`✅ 포즈 검출 이미지 서버 저장 완료: ${result.saved_path}`);
                return result.saved_path;
            } else {
                throw new Error('Server save failed');
            }
            
        } catch (serverError) {
            console.warn('⚠️  서버 저장 실패, 브라우저 다운로드 사용:', serverError.message);
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log(`✅ 포즈 검출 이미지 브라우저 다운로드 완료: ${filename}`);
            return fullPath;
        }
        
    } catch (error) {
        console.error('❌ 포즈 검출 이미지 저장 실패:', error);
        throw error;
    }
}

/**
 * 전처리기 출력 경로 가져오기
 */
export function getPreprocessorOutputPath() {
    return pathConfig.getPreprocessorPath();
}