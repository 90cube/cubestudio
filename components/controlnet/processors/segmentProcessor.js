// components/controlnet/processors/segmentProcessor.js

import pathConfig from '../../../core/pathConfig.js';

/**
 * Segmentation 전처리기 (ADE20K, COCO-Stuff, Cityscapes, OneFormer)
 * 의미론적 분할을 통한 객체 및 영역 구분을 수행합니다.
 */

/**
 * 세그멘테이션 수행
 * @param {HTMLImageElement} imageElement - 원본 이미지 엘리먼트
 * @param {Object} params - 세그멘테이션 파라미터
 * @returns {HTMLCanvasElement} 처리된 캔버스
 */
export function processSegmentation(imageElement, params = {}) {
    const {
        maskOpacity = 0.7,
        outlineThickness = 1,
        colorMode = 'category',
        showLabels = true,
        mergeSmall = false
    } = params;
    
    // 실제 세그멘테이션은 AI 모델이 필요하므로 백엔드 처리 필요
    // 여기서는 데모용 세그멘테이션 시각화를 구현
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    // 원본 이미지를 배경으로 그리기
    ctx.drawImage(imageElement, 0, 0);
    
    // 데모용 세그멘테이션 마스크 적용
    applyDemoSegmentationMask(ctx, canvas.width, canvas.height, {
        maskOpacity,
        outlineThickness,
        colorMode,
        showLabels,
        mergeSmall
    });
    
    return canvas;
}

/**
 * 데모용 세그멘테이션 마스크 적용
 */
function applyDemoSegmentationMask(ctx, width, height, params) {
    const { maskOpacity, outlineThickness, colorMode, showLabels } = params;
    
    // 세그멘테이션 카테고리별 색상 정의
    const categoryColors = {
        'sky': [135, 206, 235],      // 하늘색
        'building': [139, 69, 19],   // 갈색
        'tree': [34, 139, 34],       // 초록색
        'road': [105, 105, 105],     // 회색
        'person': [255, 20, 147],    // 핑크
        'car': [255, 165, 0],        // 주황색
        'grass': [124, 252, 0],      // 연두색
        'water': [30, 144, 255]      // 파란색
    };
    
    // 데모 세그멘테이션 영역 정의 (상대 좌표)
    const segments = [
        { name: 'sky', region: [[0, 0], [1, 0], [1, 0.3], [0, 0.3]] },
        { name: 'building', region: [[0.1, 0.3], [0.4, 0.3], [0.4, 0.7], [0.1, 0.7]] },
        { name: 'building', region: [[0.6, 0.25], [0.9, 0.25], [0.9, 0.8], [0.6, 0.8]] },
        { name: 'tree', region: [[0.4, 0.4], [0.6, 0.4], [0.6, 0.8], [0.4, 0.8]] },
        { name: 'road', region: [[0, 0.8], [1, 0.8], [1, 1], [0, 1]] },
        { name: 'person', region: [[0.2, 0.6], [0.25, 0.6], [0.25, 0.8], [0.2, 0.8]] },
        { name: 'car', region: [[0.7, 0.7], [0.85, 0.7], [0.85, 0.8], [0.7, 0.8]] },
        { name: 'grass', region: [[0, 0.7], [0.1, 0.7], [0.1, 0.8], [0, 0.8]] }
    ];
    
    // 각 세그먼트에 대해 마스크 적용
    segments.forEach((segment, index) => {
        const color = categoryColors[segment.name] || [128, 128, 128];
        const [r, g, b] = color;
        
        // 색상 모드에 따른 색상 조정
        let finalColor = color;
        if (colorMode === 'instance') {
            // 인스턴스별로 다른 색상 (HSV 회전)
            const hue = (index * 137.5) % 360; // 황금비 기반 색상 분산
            finalColor = hsvToRgb(hue, 70, 80);
        } else if (colorMode === 'depth') {
            // 깊이별 색상 (파란색 계열)
            const depth = index / segments.length;
            finalColor = [
                Math.floor(50 + depth * 100),
                Math.floor(100 + depth * 100),
                Math.floor(150 + depth * 105)
            ];
        }
        
        // 폴리곤 영역을 실제 픽셀 좌표로 변환
        const points = segment.region.map(([x, y]) => [
            x * width,
            y * height
        ]);
        
        // 마스크 영역 그리기
        ctx.save();
        ctx.globalAlpha = maskOpacity;
        ctx.fillStyle = `rgb(${finalColor[0]}, ${finalColor[1]}, ${finalColor[2]})`;
        
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => {
            ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        
        // 외곽선 그리기
        if (outlineThickness > 0) {
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = outlineThickness;
            ctx.stroke();
        }
        
        ctx.restore();
        
        // 레이블 표시
        if (showLabels) {
            const centerX = points.reduce((sum, [x]) => sum + x, 0) / points.length;
            const centerY = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
            
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.font = '12px Arial';
            
            const text = segment.name.charAt(0).toUpperCase() + segment.name.slice(1);
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;
            const textHeight = 12;
            
            // 배경 박스
            ctx.fillRect(
                centerX - textWidth / 2 - 4,
                centerY - textHeight / 2 - 2,
                textWidth + 8,
                textHeight + 4
            );
            
            // 텍스트
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, centerX - textWidth / 2, centerY + textHeight / 2 - 2);
            ctx.restore();
        }
    });
    
    // 모델 정보 표시
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, height - 80, 200, 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.fillText('Demo Segmentation', 15, height - 60);
    ctx.fillText(`Mode: ${colorMode}`, 15, height - 45);
    ctx.fillText(`Segments: ${segments.length}`, 15, height - 30);
    ctx.fillText(`Opacity: ${Math.round(maskOpacity * 100)}%`, 15, height - 15);
    ctx.restore();
}

/**
 * HSV를 RGB로 변환
 */
function hsvToRgb(h, s, v) {
    h = h / 360;
    s = s / 100;
    v = v / 100;
    
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    
    let r, g, b;
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * 백엔드 AI 모델을 사용한 실제 세그멘테이션
 * @param {HTMLImageElement} imageElement - 원본 이미지
 * @param {string} modelId - 사용할 세그멘테이션 모델 ID
 * @param {Object} params - 세그멘테이션 파라미터
 * @returns {Promise<HTMLCanvasElement>} 처리된 캔버스
 */
export async function processSegmentationWithAI(imageElement, modelId, params = {}) {
    try {
        // Konva 이미지를 데이터 URL로 변환
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = imageElement.width;
        canvas.height = imageElement.height;
        ctx.drawImage(imageElement, 0, 0);
        const imageDataUrl = canvas.toDataURL('image/png');
        
        console.log(`🎯 ${modelId} 세그멘테이션 시작...`);
        
        // 백엔드 API 호출
        const response = await fetch('http://localhost:9004/api/segmentation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageDataUrl,
                model: modelId,
                params: {
                    ...params,
                    mask_opacity: params.maskOpacity || 0.7,
                    outline_thickness: params.outlineThickness || 1,
                    color_mode: params.colorMode || 'category'
                }
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Segmentation API failed: ${response.status} - ${error.error || 'Unknown error'}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Segmentation failed');
        }
        
        console.log(`✅ ${modelId} 세그멘테이션 완료`);
        
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
            img.onerror = () => reject(new Error('Failed to load processed segmentation image'));
            img.src = result.processed_image; // Base64 데이터 URL
        });
        
    } catch (error) {
        console.error(`❌ ${modelId} 세그멘테이션 실패:`, error);
        
        // 폴백: 데모 세그멘테이션 시각화
        console.log('폴백: 데모 세그멘테이션 사용');
        return processSegmentation(imageElement, params);
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
            const prefix = options.prefix || 'segmentation';
            filename = pathConfig.generateFilename(prefix, '.png');
        }
        
        const fullPath = pathConfig.getFullPath('preprocessor', filename);
        const blob = await canvasToBlob(canvas);
        
        try {
            const imageDataUrl = canvas.toDataURL('image/png');
            
            const response = await fetch('http://localhost:9004/api/save-image', {
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
                console.log(`✅ 세그멘테이션 이미지 서버 저장 완료: ${result.saved_path}`);
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
            
            console.log(`✅ 세그멘테이션 이미지 브라우저 다운로드 완료: ${filename}`);
            return fullPath;
        }
        
    } catch (error) {
        console.error('❌ 세그멘테이션 이미지 저장 실패:', error);
        throw error;
    }
}

/**
 * 전처리기 출력 경로 가져오기
 */
export function getPreprocessorOutputPath() {
    return pathConfig.getPreprocessorPath();
}