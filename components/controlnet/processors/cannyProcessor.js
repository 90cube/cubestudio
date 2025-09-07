import pathConfig from '../../../core/pathConfig.js';

export function processCannyEdge(imageElement, params = {}) {
    const {
        lowThreshold = 100,
        highThreshold = 200,
        useL2Gradient = true,
        gaussianBlur = 1.4
    } = params;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    ctx.drawImage(imageElement, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const processedData = applyCanny(data, canvas.width, canvas.height, {
        lowThreshold,
        highThreshold,
        useL2Gradient,
        gaussianBlur
    });
    
    const newImageData = ctx.createImageData(canvas.width, canvas.height);
    newImageData.data.set(processedData);
    ctx.putImageData(newImageData, 0, 0);
    
    return canvas;
}

function applyCanny(data, width, height, params) {
    const { lowThreshold, highThreshold } = params;
    const result = new Uint8ClampedArray(data.length);
    
    const grayData = new Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        grayData[idx] = gray;
    }
    
    const gradX = new Array(width * height);
    const gradY = new Array(width * height);
    const magnitude = new Array(width * height);
    
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
    
    for (let i = 0; i < width * height; i++) {
        const mag = magnitude[i];
        let edgeStrength = 0;
        
        if (mag > highThreshold) {
            edgeStrength = 255;
        } else if (mag > lowThreshold) {
            edgeStrength = 128;
        }
        
        const pixelIdx = i * 4;
        result[pixelIdx] = edgeStrength;
        result[pixelIdx + 1] = edgeStrength;
        result[pixelIdx + 2] = edgeStrength;
        result[pixelIdx + 3] = 255;
    }
    
    return result;
}

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

export function canvasToBlob(canvas) {
    return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/png');
    });
}

export async function savePreprocessedImage(canvas, filename = null, options = {}) {
    try {
        if (!filename) {
            const prefix = options.prefix || 'controlnet_processed';
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
                console.log(`???버??해 ?처???지 ??됨:`);
                console.log(`   ?일? ${filename}`);
                console.log(`   ???경로: ${result.saved_path}`);
                return result.saved_path;
            } else {
                throw new Error('Server save failed');
            }
            
        } catch (serverError) {
            console.warn('?️  ?버 ????패, 브라?? ?운로드 ?용:', serverError.message);
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            console.log(`??브라?? ?운로드??처???지 ??됨:`);
            console.log(`   ?일? ${filename}`);
            console.log(`   목표 경로: ${pathConfig.getPreprocessorPath()}`);
            console.log(`   ?제 ??? ?운로드 ?더`);
            
            return fullPath;
        }
        
    } catch (error) {
        console.error('???처???지 ????패:', error);
        throw error;
    }
}

export function getPreprocessorOutputPath() {
    return pathConfig.getPreprocessorPath();
}

export function setPreprocessorOutputPath(path) {
    pathConfig.setPreprocessorPath(path);
    console.log(`? ?처리기 출력 경로 변경됨: ${path}`);
}
