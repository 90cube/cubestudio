// components/controlnet/processors/cannyProcessor.js

import pathConfig from '../../../core/pathConfig.js';

/**
 * Canny Edge Detection 전처리기
 * 이미지에서 윤곽선을 추출합니다.
 */

/**
 * Canny 엣지 검출 수행
 * @param {HTMLImageElement} imageElement - 원본 이미지 엘리먼트
 * @param {Object} params - Canny 파라미터
 * @returns {HTMLCanvasElement} 처리된 캔버스
 */
export function processCannyEdge(imageElement, params = {}) {
    const {
        lowThreshold = 100,
        highThreshold = 200,
        useL2Gradient = true,
        gaussianBlur = 1.4
    } = params;
    
    // 캔버스 생성
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    // 원본 이미지를 캔버스에 그리기
    ctx.drawImage(imageElement, 0, 0);
    
    // 이미지 데이터 가져오기
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 간단한 Canny 엣지 검출 구현 (프로토타입)
    const processedData = applyCanny(data, canvas.width, canvas.height, {
        lowThreshold,
        highThreshold,
        useL2Gradient,
        gaussianBlur
    });
    
    // 처리된 데이터를 다시 캔버스에 적용
    const newImageData = ctx.createImageData(canvas.width, canvas.height);
    newImageData.data.set(processedData);
    ctx.putImageData(newImageData, 0, 0);
    
    return canvas;
}

/**
 * 간단한 Canny 엣지 검출 알고리즘 (프로토타입)
 * 실제 구현에서는 더 정교한 알고리즘이나 WebGL을 사용할 수 있습니다.
 */
function applyCanny(data, width, height, params) {
    const { lowThreshold, highThreshold } = params;
    const result = new Uint8ClampedArray(data.length);
    
    // 1단계: 그레이스케일 변환
    const grayData = new Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        grayData[idx] = gray;
    }
    
    // 2단계: 소벨 필터로 그라디언트 계산
    const gradX = new Array(width * height);
    const gradY = new Array(width * height);
    const magnitude = new Array(width * height);
    
    // 소벨 커널
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            
            let gx = 0, gy = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const pixelIdx = (y + ky) * width + (x + kx);
                    const kernelIdx = (ky + 1) * 3 + (kx + 1);
                    
                    gx += grayData[pixelIdx] * sobelX[kernelIdx];
                    gy += grayData[pixelIdx] * sobelY[kernelIdx];
                }
            }
            
            gradX[idx] = gx;
            gradY[idx] = gy;
            magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
        }
    }
    
    // 3단계: 임계값 적용하여 엣지 검출
    for (let i = 0; i < width * height; i++) {
        const mag = magnitude[i];
        let edgeStrength = 0;
        
        if (mag > highThreshold) {
            edgeStrength = 255; // 강한 엣지
        } else if (mag > lowThreshold) {
            edgeStrength = 128; // 약한 엣지
        }
        
        // 결과 데이터에 적용 (흰색 엣지, 검은색 배경)
        const pixelIdx = i * 4;
        result[pixelIdx] = edgeStrength;     // R
        result[pixelIdx + 1] = edgeStrength; // G
        result[pixelIdx + 2] = edgeStrength; // B
        result[pixelIdx + 3] = 255;          // A
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
        
        // Konva 이미지의 소스 가져오기
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
 * 전처리된 이미지 저장
 * @param {HTMLCanvasElement} canvas - 저장할 캔버스
 * @param {string} filename - 저장할 파일명 (선택사항, 자동 생성됨)
 * @param {Object} options - 저장 옵션
 * @returns {Promise<string>} 저장된 파일의 전체 경로
 */
export async function savePreprocessedImage(canvas, filename = null, options = {}) {
    try {
        // 파일명이 제공되지 않으면 자동 생성
        if (!filename) {
            const prefix = options.prefix || 'controlnet_processed';
            filename = pathConfig.generateFilename(prefix, '.png');
        }
        
        // 전체 파일 경로 생성
        const fullPath = pathConfig.getFullPath('preprocessor', filename);
        
        const blob = await canvasToBlob(canvas);
        
        // 백엔드 서버를 통한 파일 저장 시도
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
                console.log(`✅ 서버를 통해 전처리 이미지 저장됨:`);
                console.log(`   파일명: ${filename}`);
                console.log(`   저장 경로: ${result.saved_path}`);
                return result.saved_path;
            } else {
                throw new Error('Server save failed');
            }
            
        } catch (serverError) {
            console.warn('⚠️  서버 저장 실패, 브라우저 다운로드 사용:', serverError.message);
            
            // 폴백: 브라우저 다운로드
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            console.log(`✅ 브라우저 다운로드로 전처리 이미지 저장됨:`);
            console.log(`   파일명: ${filename}`);
            console.log(`   목표 경로: ${pathConfig.getPreprocessorPath()}`);
            console.log(`   실제 저장: 다운로드 폴더`);
            
            return fullPath; // 목표 경로 반환 (UI 표시용)
        }
        
    } catch (error) {
        console.error('❌ 전처리 이미지 저장 실패:', error);
        throw error;
    }
}

/**
 * 전처리기 출력 경로 가져오기
 * @returns {string} 현재 설정된 전처리기 출력 경로
 */
export function getPreprocessorOutputPath() {
    return pathConfig.getPreprocessorPath();
}

/**
 * 전처리기 출력 경로 설정
 * @param {string} path - 설정할 경로
 */
export function setPreprocessorOutputPath(path) {
    pathConfig.setPreprocessorPath(path);
    console.log(`📁 전처리기 출력 경로 변경됨: ${path}`);
}