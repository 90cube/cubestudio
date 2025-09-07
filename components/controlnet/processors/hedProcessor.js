// components/controlnet/processors/hedProcessor.js

import pathConfig from '../../../core/pathConfig.js';

/**
 * HED (Holistically-Nested Edge Detection) 전처리기
 * 딥러닝 기반 전체적 엣지 검출을 수행합니다.
 */

/**
 * HED 엣지 검출 수행
 * @param {HTMLImageElement} imageElement - 원본 이미지 엘리먼트
 * @param {Object} params - HED 파라미터
 * @returns {HTMLCanvasElement} 처리된 캔버스
 */
export function processHEDEdge(imageElement, params = {}) {
    const {
        edgeThreshold = 0.5,
        contrastBoost = 1.2,
        smoothing = 1,
        invertColors = false
    } = params;
    
    // HED는 딥러닝 모델이므로 백엔드 처리 필요
    // 여기서는 폴백 처리로 개선된 Sobel 필터 구현
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    ctx.drawImage(imageElement, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const processedData = applyEnhancedEdgeDetection(imageData.data, canvas.width, canvas.height, {
        edgeThreshold,
        contrastBoost,
        smoothing,
        invertColors
    });
    
    const newImageData = ctx.createImageData(canvas.width, canvas.height);
    newImageData.data.set(processedData);
    ctx.putImageData(newImageData, 0, 0);
    
    return canvas;
}

/**
 * 개선된 엣지 검출 알고리즘 (HED 스타일)
 */
function applyEnhancedEdgeDetection(data, width, height, params) {
    const { edgeThreshold, contrastBoost, smoothing, invertColors } = params;
    const result = new Uint8ClampedArray(data.length);
    
    // 그레이스케일 변환
    const grayData = new Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        grayData[idx] = gray;
    }
    
    // 가우시안 블러 적용 (스무딩)
    if (smoothing > 0) {
        applyGaussianBlur(grayData, width, height, smoothing);
    }
    
    // 다방향 소벨 필터 (8방향)
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];
    
    const edgeMap = new Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            let maxGradient = 0;
            
            // 8방향에서 최대 그라디언트 찾기
            directions.forEach(([dx, dy]) => {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nidx = ny * width + nx;
                    const gradient = Math.abs(grayData[idx] - grayData[nidx]);
                    maxGradient = Math.max(maxGradient, gradient);
                }
            });
            
            edgeMap[idx] = maxGradient;
        }
    }
    
    // 임계값 적용 및 대비 조정
    const threshold = edgeThreshold * 255;
    for (let i = 0; i < width * height; i++) {
        let edgeStrength = edgeMap[i] * contrastBoost;
        
        if (edgeStrength > threshold) {
            edgeStrength = Math.min(255, edgeStrength);
        } else {
            edgeStrength = 0;
        }
        
        if (invertColors) {
            edgeStrength = 255 - edgeStrength;
        }
        
        const pixelIdx = i * 4;
        result[pixelIdx] = edgeStrength;     // R
        result[pixelIdx + 1] = edgeStrength; // G
        result[pixelIdx + 2] = edgeStrength; // B
        result[pixelIdx + 3] = 255;          // A
    }
    
    return result;
}

/**
 * 가우시안 블러 적용
 */
function applyGaussianBlur(data, width, height, radius) {
    const kernel = generateGaussianKernel(radius);
    const kernelSize = kernel.length;
    const halfSize = Math.floor(kernelSize / 2);
    const temp = new Array(data.length);
    
    // 수평 블러
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let weightSum = 0;
            
            for (let k = 0; k < kernelSize; k++) {
                const sx = x + k - halfSize;
                if (sx >= 0 && sx < width) {
                    sum += data[y * width + sx] * kernel[k];
                    weightSum += kernel[k];
                }
            }
            
            temp[y * width + x] = sum / weightSum;
        }
    }
    
    // 수직 블러
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let weightSum = 0;
            
            for (let k = 0; k < kernelSize; k++) {
                const sy = y + k - halfSize;
                if (sy >= 0 && sy < height) {
                    sum += temp[sy * width + x] * kernel[k];
                    weightSum += kernel[k];
                }
            }
            
            data[y * width + x] = sum / weightSum;
        }
    }
}

/**
 * 가우시안 커널 생성
 */
function generateGaussianKernel(radius) {
    const size = Math.ceil(radius) * 2 + 1;
    const kernel = new Array(size);
    const sigma = radius / 3;
    let sum = 0;
    
    for (let i = 0; i < size; i++) {
        const x = i - Math.floor(size / 2);
        kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
        sum += kernel[i];
    }
    
    // 정규화
    for (let i = 0; i < size; i++) {
        kernel[i] /= sum;
    }
    
    return kernel;
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
            const prefix = options.prefix || 'hed_edge';
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
                console.log(`✅ HED 전처리 이미지 서버 저장 완료: ${result.saved_path}`);
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
            
            console.log(`✅ HED 전처리 이미지 브라우저 다운로드 완료: ${filename}`);
            return fullPath;
        }
        
    } catch (error) {
        console.error('❌ HED 전처리 이미지 저장 실패:', error);
        throw error;
    }
}

/**
 * 전처리기 출력 경로 가져오기
 */
export function getPreprocessorOutputPath() {
    return pathConfig.getPreprocessorPath();
}