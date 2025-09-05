// components/controlnet/processors/cannyProcessor.js

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
 * @param {string} filename - 저장할 파일명
 */
export async function savePreprocessedImage(canvas, filename) {
    try {
        const blob = await canvasToBlob(canvas);
        
        // 다운로드 링크 생성
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        console.log(`Preprocessed image saved: ${filename}`);
    } catch (error) {
        console.error('Failed to save preprocessed image:', error);
    }
}