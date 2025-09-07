// components/controlnet/processors/depthProcessor.js

import pathConfig from '../../../core/pathConfig.js';

/**
 * Depth Map ?처리기
 * ??지?서 깊이 ?보?추출?니??
 */

/**
 * Depth Map ?성 ?행
 * @param {HTMLImageElement} imageElement - ?본 ??지 ?리먼트
 * @param {Object} params - Depth ?라미터
 * @returns {HTMLCanvasElement} 처리??캔버?? */
export function processDepthMap(imageElement, params = {}) {
    const {
        contrast = 1.2,
        brightness = 0.1,
        smoothing = 2,
        depthStrength = 1.0
    } = params;
    
    // 캔버???성
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    // 원본 이미지를 캔버스에 그리기
    ctx.drawImage(imageElement, 0, 0);
    
    // 이미지 데이터 가져오기
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Depth Map 알고리즘 적용
    const processedData = applyDepthMap(data, canvas.width, canvas.height, {
        contrast,
        brightness,
        smoothing,
        depthStrength
    });
    
    // 처리???이?? ?시 캔버?에 ?용
    const newImageData = ctx.createImageData(canvas.width, canvas.height);
    newImageData.data.set(processedData);
    ctx.putImageData(newImageData, 0, 0);
    
    return canvas;
}

/**
 * Depth Map ?고리즘 (?순?된 버전)
 * 밝기 기반??깊이 추정 + 그라?언??분석
 */
function applyDepthMap(data, width, height, params) {
    const { contrast, brightness, smoothing, depthStrength } = params;
    const result = new Uint8ClampedArray(data.length);
    
    // 1?계: 그레?스케??변???밝기 기반 깊이 추정
    const grayData = new Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        grayData[idx] = gray;
    }
    
    // 2?계: 그라?언??기반 깊이 추정
    const depthData = new Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const center = grayData[idx];
            
            // 주? ??과의 차이??한 깊이 추정
            let gradientSum = 0;
            let count = 0;
            
            // 8방향 그라?언??계산
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    const neighborIdx = (y + dy) * width + (x + dx);
                    const neighbor = grayData[neighborIdx];
                    gradientSum += Math.abs(center - neighbor);
                    count++;
                }
            }
            
            const avgGradient = gradientSum / count;
            
            // 밝기 + 그라?언??조합?로 깊이 계산
            // 밝? ?역 = 가까? (?? 깊이?
            // 그라?언?? ???역 = 경계?(중간 깊이?
            let depth = (center * 0.7 + (255 - avgGradient * 2) * 0.3) * depthStrength;
            
            // ???밝기 조정
            depth = (depth - 128) * contrast + 128 + brightness * 255;
            depth = Math.max(0, Math.min(255, depth));
            
            depthData[idx] = depth;
        }
    }
    
    // 3?계: ?무???용
    const smoothedData = new Array(width * height);
    const smoothRadius = Math.floor(smoothing);
    
    for (let y = smoothRadius; y < height - smoothRadius; y++) {
        for (let x = smoothRadius; x < width - smoothRadius; x++) {
            const idx = y * width + x;
            let sum = 0;
            let count = 0;
            
            for (let dy = -smoothRadius; dy <= smoothRadius; dy++) {
                for (let dx = -smoothRadius; dx <= smoothRadius; dx++) {
                    const neighborIdx = (y + dy) * width + (x + dx);
                    sum += depthData[neighborIdx];
                    count++;
                }
            }
            
            smoothedData[idx] = sum / count;
        }
    }
    
    // 4?계: 결과 ?이???성 (그레?스케??깊이 ?
    for (let i = 0; i < width * height; i++) {
        const depth = smoothedData[i] || depthData[i] || 128;
        const pixelIdx = i * 4;
        
        result[pixelIdx] = depth;     // R
        result[pixelIdx + 1] = depth; // G  
        result[pixelIdx + 2] = depth; // B
        result[pixelIdx + 3] = 255;   // A
    }
    
    return result;
}

/**
 * Konva 이미지 노드를 HTMLImageElement로 변환
 * @param {Konva.Image} imageNode - Konva 이미지 노드
 * @returns {Promise<HTMLImageElement>} HTML 이미지 엘리먼트
 */
export function konvaImageToHTMLImage(imageNode) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => resolve(img);
        img.onerror = reject;
        
        // Konva 이미지 인스턴스 가져오기
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
 * @param {HTMLCanvasElement} canvas - 변환할 캔버스
 * @returns {Promise<Blob>} 이미지 Blob
 */
export function canvasToBlob(canvas) {
    return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
    });
}

/**
 * ?처리된 ??지 ??? * @param {HTMLCanvasElement} canvas - ??할 캔버?? * @param {string} filename - ??할 ?일?(?택?항, ?동 ?성??
 * @param {Object} options - ????션
 * @returns {Promise<string>} ??된 ?일???체 경로
 */
export async function savePreprocessedImage(canvas, filename = null, options = {}) {
    try {
        // ?일명이 ?공?? ?으??동 ?성
        if (!filename) {
            const prefix = options.prefix || 'depth_map';
            filename = pathConfig.generateFilename(prefix, '.png');
        }
        
        // ?체 ?일 경로 ?성
        const fullPath = pathConfig.getFullPath('preprocessor', filename);
        
        const blob = await canvasToBlob(canvas);
        
        // 백엔???버??한 ?일 ????도
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
                console.log(`???버??해 Depth ?처???지 ??됨:`);
                console.log(`   ?일? ${filename}`);
                console.log(`   ???경로: ${result.saved_path}`);
                return result.saved_path;
            } else {
                throw new Error('Server save failed');
            }
            
        } catch (serverError) {
            console.warn('?️  ?버 ????패, 브라?? ?운로드 ?용:', serverError.message);
            
            // ?백: 브라?? ?운로드
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            console.log(`??브라?? ?운로드?Depth ?처???지 ??됨:`);
            console.log(`   ?일? ${filename}`);
            console.log(`   목표 경로: ${pathConfig.getPreprocessorPath()}`);
            console.log(`   ?제 ??? ?운로드 ?더`);
            
            return fullPath; // 목표 경로 반환 (UI ?시??
        }
        
    } catch (error) {
        console.error('??Depth ?처???지 ????패:', error);
        throw error;
    }
}

/**
 * ?처리기 출력 경로 가?오? * @returns {string} ?재 ?정???처리기 출력 경로
 */
export function getPreprocessorOutputPath() {
    return pathConfig.getPreprocessorPath();
}

/**
 * ?처리기 출력 경로 ?정
 * @param {string} path - ?정??경로
 */
export function setPreprocessorOutputPath(path) {
    pathConfig.setPreprocessorPath(path);
    console.log(`? Depth ?처리기 출력 경로 변경됨: ${path}`);
}
