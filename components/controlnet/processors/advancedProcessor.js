// components/controlnet/processors/advancedProcessor.js

import pathConfig from '../../../core/pathConfig.js';

/**
 * Advanced 전처리기 (MLSD, Shuffle, Threshold, Inpainting Guide, Tile Resample)
 * 특수 목적 전처리 및 실험적 기능을 제공합니다.
 */

/**
 * 고급 전처리 수행
 * @param {HTMLImageElement} imageElement - 원본 이미지 엘리먼트
 * @param {string} processorType - 전처리 유형 ('mlsd', 'shuffle', 'threshold', 'inpaint', 'tile')
 * @param {Object} params - 전처리 파라미터
 * @returns {HTMLCanvasElement} 처리된 캔버스
 */
export function processAdvanced(imageElement, processorType, params = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    // 원본 이미지를 캔버스에 그리기
    ctx.drawImage(imageElement, 0, 0);
    
    switch (processorType) {
        case 'mlsd':
            return processMLSD(canvas, params);
        case 'shuffle':
            return processShuffle(canvas, params);
        case 'threshold':
            return processThreshold(canvas, params);
        case 'inpaint':
            return processInpaintingGuide(canvas, params);
        case 'tile':
            return processTileResample(canvas, params);
        default:
            console.warn(`Unknown advanced processor type: ${processorType}`);
            return canvas;
    }
}

/**
 * M-LSD (Mobile Line Segment Detection) 처리
 */
function processMLSD(canvas, params = {}) {
    const { lineThreshold = 0.1, lengthThreshold = 10, intensity = 1.0 } = params;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 그레이스케일 변환
    const grayData = new Array(canvas.width * canvas.height);
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        grayData[idx] = gray;
    }
    
    // 간단한 직선 검출 알고리즘
    const lines = detectLines(grayData, canvas.width, canvas.height, lineThreshold, lengthThreshold);
    
    // 배경을 검정으로 채우기
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 검출된 직선 그리기
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, intensity * 2);
    
    lines.forEach(line => {
        const { start, end, strength } = line;
        ctx.globalAlpha = Math.min(1.0, strength * intensity);
        
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    });
    
    ctx.globalAlpha = 1.0;
    
    // 정보 표시
    drawProcessorInfo(ctx, 'M-LSD Line Detection', {
        'Lines': lines.length,
        'Threshold': lineThreshold,
        'Min Length': lengthThreshold
    });
    
    return canvas;
}

/**
 * 이미지 셔플링 처리
 */
function processShuffle(canvas, params = {}) {
    const { tileSize = 64, intensity = 1.0 } = params;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 타일 기반 셔플링
    const tilesX = Math.ceil(canvas.width / tileSize);
    const tilesY = Math.ceil(canvas.height / tileSize);
    const tiles = [];
    
    // 타일 추출
    for (let y = 0; y < tilesY; y++) {
        for (let x = 0; x < tilesX; x++) {
            const startX = x * tileSize;
            const startY = y * tileSize;
            const width = Math.min(tileSize, canvas.width - startX);
            const height = Math.min(tileSize, canvas.height - startY);
            
            try {
                const tileData = ctx.getImageData(startX, startY, width, height);
                tiles.push({
                    data: tileData,
                    originalX: startX,
                    originalY: startY,
                    width: width,
                    height: height
                });
            } catch (error) {
                console.warn(`Failed to extract tile at (${startX}, ${startY}):`, error);
            }
        }
    }
    
    // Fisher-Yates 셔플
    for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        if (Math.random() < intensity) {
            [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        }
    }
    
    // 배경 클리어
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 셔플된 타일 배치
    let index = 0;
    for (let y = 0; y < tilesY; y++) {
        for (let x = 0; x < tilesX; x++) {
            if (index < tiles.length) {
                const tile = tiles[index];
                const destX = x * tileSize;
                const destY = y * tileSize;
                
                try {
                    ctx.putImageData(tile.data, destX, destY);
                } catch (error) {
                    console.warn(`Failed to place tile at (${destX}, ${destY}):`, error);
                }
                index++;
            }
        }
    }
    
    drawProcessorInfo(ctx, 'Shuffle', {
        'Tile Size': `${tileSize}px`,
        'Total Tiles': tiles.length,
        'Intensity': `${Math.round(intensity * 100)}%`
    });
    
    return canvas;
}

/**
 * 임계값 기반 이진화 처리
 */
function processThreshold(canvas, params = {}) {
    const { threshold = 128, intensity = 1.0, invertColors = false } = params;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        // 그레이스케일 값 계산
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // 임계값 적용
        let binaryValue = gray > threshold ? 255 : 0;
        
        if (invertColors) {
            binaryValue = 255 - binaryValue;
        }
        
        // 강도 적용
        const finalValue = Math.round(binaryValue * intensity);
        
        data[i] = finalValue;     // R
        data[i + 1] = finalValue; // G
        data[i + 2] = finalValue; // B
        // Alpha 값은 유지
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    drawProcessorInfo(ctx, 'Threshold', {
        'Threshold': threshold,
        'Intensity': `${Math.round(intensity * 100)}%`,
        'Inverted': invertColors ? 'Yes' : 'No'
    });
    
    return canvas;
}

/**
 * 인페인팅 가이드 생성
 */
function processInpaintingGuide(canvas, params = {}) {
    const { intensity = 1.0 } = params;
    const ctx = canvas.getContext('2d');
    
    // 원본 이미지를 희미하게 만들기
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
    
    // 인페인팅 영역 표시를 위한 그리드 오버레이
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * intensity})`;
    ctx.lineWidth = 1;
    
    const gridSize = 32;
    
    // 수직선
    for (let x = gridSize; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    // 수평선
    for (let y = gridSize; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // 중앙에 샘플 마스크 영역 표시
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maskRadius = Math.min(canvas.width, canvas.height) * 0.15;
    
    ctx.fillStyle = `rgba(255, 0, 0, ${0.5 * intensity})`;
    ctx.beginPath();
    ctx.arc(centerX, centerY, maskRadius, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 텍스트 표시
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Inpainting Mask Area', centerX, centerY + 5);
    
    drawProcessorInfo(ctx, 'Inpainting Guide', {
        'Grid Size': `${gridSize}px`,
        'Mask Opacity': `${Math.round(intensity * 50)}%`
    });
    
    return canvas;
}

/**
 * 타일 기반 리샘플링 처리
 */
function processTileResample(canvas, params = {}) {
    const { tileSize = 8, intensity = 1.0 } = params;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const newData = new Uint8ClampedArray(data.length);
    
    // 타일별로 평균 색상 계산 및 적용
    for (let y = 0; y < canvas.height; y += tileSize) {
        for (let x = 0; x < canvas.width; x += tileSize) {
            const tileWidth = Math.min(tileSize, canvas.width - x);
            const tileHeight = Math.min(tileSize, canvas.height - y);
            
            // 타일 영역의 평균 색상 계산
            let r = 0, g = 0, b = 0, a = 0;
            let count = 0;
            
            for (let ty = y; ty < y + tileHeight; ty++) {
                for (let tx = x; tx < x + tileWidth; tx++) {
                    const idx = (ty * canvas.width + tx) * 4;
                    r += data[idx];
                    g += data[idx + 1];
                    b += data[idx + 2];
                    a += data[idx + 3];
                    count++;
                }
            }
            
            const avgR = Math.round(r / count);
            const avgG = Math.round(g / count);
            const avgB = Math.round(b / count);
            const avgA = Math.round(a / count);
            
            // 타일 영역에 평균 색상 적용
            for (let ty = y; ty < y + tileHeight; ty++) {
                for (let tx = x; tx < x + tileWidth; tx++) {
                    const idx = (ty * canvas.width + tx) * 4;
                    
                    // 강도에 따라 원본과 타일화된 색상 혼합
                    newData[idx] = Math.round(data[idx] * (1 - intensity) + avgR * intensity);
                    newData[idx + 1] = Math.round(data[idx + 1] * (1 - intensity) + avgG * intensity);
                    newData[idx + 2] = Math.round(data[idx + 2] * (1 - intensity) + avgB * intensity);
                    newData[idx + 3] = data[idx + 3]; // Alpha는 유지
                }
            }
        }
    }
    
    const newImageData = ctx.createImageData(canvas.width, canvas.height);
    newImageData.data.set(newData);
    ctx.putImageData(newImageData, 0, 0);
    
    drawProcessorInfo(ctx, 'Tile Resample', {
        'Tile Size': `${tileSize}px`,
        'Intensity': `${Math.round(intensity * 100)}%`,
        'Total Tiles': Math.ceil(canvas.width / tileSize) * Math.ceil(canvas.height / tileSize)
    });
    
    return canvas;
}

/**
 * 직선 검출 (간단한 구현)
 */
function detectLines(grayData, width, height, threshold, minLength) {
    const lines = [];
    const visited = new Set();
    
    // Sobel 엣지 검출
    const edges = new Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            
            // Sobel X
            const gx = -grayData[(y-1)*width + x-1] + grayData[(y-1)*width + x+1] +
                      -2*grayData[y*width + x-1] + 2*grayData[y*width + x+1] +
                      -grayData[(y+1)*width + x-1] + grayData[(y+1)*width + x+1];
            
            // Sobel Y
            const gy = -grayData[(y-1)*width + x-1] - 2*grayData[(y-1)*width + x] - grayData[(y-1)*width + x+1] +
                       grayData[(y+1)*width + x-1] + 2*grayData[(y+1)*width + x] + grayData[(y+1)*width + x+1];
            
            edges[idx] = Math.sqrt(gx * gx + gy * gy);
        }
    }
    
    // 강한 엣지 포인트에서 직선 추적
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            
            if (edges[idx] > threshold * 255 && !visited.has(idx)) {
                const line = traceLine(x, y, edges, width, height, visited, minLength);
                if (line) {
                    lines.push(line);
                }
            }
        }
    }
    
    return lines;
}

/**
 * 직선 추적
 */
function traceLine(startX, startY, edges, width, height, visited, minLength) {
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1],  [1, 0],  [1, 1]
    ];
    
    let x = startX;
    let y = startY;
    let length = 0;
    let endX = startX;
    let endY = startY;
    
    while (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = y * width + x;
        
        if (visited.has(idx)) break;
        visited.add(idx);
        
        length++;
        endX = x;
        endY = y;
        
        // 다음 포인트 찾기
        let nextX = -1;
        let nextY = -1;
        let maxEdge = 0;
        
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = ny * width + nx;
                if (!visited.has(nidx) && edges[nidx] > maxEdge) {
                    maxEdge = edges[nidx];
                    nextX = nx;
                    nextY = ny;
                }
            }
        }
        
        if (nextX === -1 || maxEdge < 50) break;
        
        x = nextX;
        y = nextY;
    }
    
    if (length >= minLength) {
        return {
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            length: length,
            strength: length / minLength
        };
    }
    
    return null;
}

/**
 * 프로세서 정보 표시
 */
function drawProcessorInfo(ctx, processorName, params) {
    const infoHeight = Object.keys(params).length * 20 + 40;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 250, infoHeight);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(processorName, 15, 30);
    
    ctx.font = '12px Arial';
    let y = 50;
    for (const [key, value] of Object.entries(params)) {
        ctx.fillText(`${key}: ${value}`, 15, y);
        y += 20;
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
            const prefix = options.prefix || 'advanced_processing';
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
                console.log(`✅ 고급 전처리 이미지 서버 저장 완료: ${result.saved_path}`);
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
            
            console.log(`✅ 고급 전처리 이미지 브라우저 다운로드 완료: ${filename}`);
            return fullPath;
        }
        
    } catch (error) {
        console.error('❌ 고급 전처리 이미지 저장 실패:', error);
        throw error;
    }
}

/**
 * 전처리기 출력 경로 가져오기
 */
export function getPreprocessorOutputPath() {
    return pathConfig.getPreprocessorPath();
}