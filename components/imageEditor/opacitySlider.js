// components/imageEditor/opacitySlider.js

import { getNodeRect } from '../../core/coordinates.js';

let opacitySliderContainer = null;
let currentImage = null;
let stage = null;

export function init(konvaStage) {
    stage = konvaStage;
    console.log('🎚️ Opacity slider initialized');
}

/**
 * 전처리된 이미지에 불투명도 슬라이더 표시
 * @param {Konva.Image} imageNode - 전처리된 이미지 노드
 */
export function showOpacitySlider(imageNode) {
    if (!imageNode || !stage) return;
    
    // 이미지 타입 확인
    const imageType = imageNode.getAttr('imageType');
    if (imageType !== 'preproc') {
        console.log('🚫 Not a preprocessed image, opacity slider not needed');
        return;
    }
    
    console.log('🎚️ Showing opacity slider for preprocessed image');
    
    currentImage = imageNode;
    
    // 기존 슬라이더 제거
    hideOpacitySlider();
    
    // 이미지의 화면상 위치 계산
    const imageRect = getNodeRect(imageNode);
    
    // Stage 변환 고려한 화면 좌표 계산
    const stagePos = stage.getAbsolutePosition();
    const stageScale = stage.scaleX();
    
    const screenRect = {
        x: (imageRect.x * stageScale) + stagePos.x,
        y: (imageRect.y * stageScale) + stagePos.y,
        width: imageRect.width * stageScale,
        height: imageRect.height * stageScale
    };
    
    // 슬라이더 컨테이너 생성
    opacitySliderContainer = document.createElement('div');
    opacitySliderContainer.className = 'opacity-slider-container';
    opacitySliderContainer.style.cssText = `
        position: fixed;
        left: ${screenRect.x}px;
        top: ${screenRect.y + screenRect.height + 10}px;
        width: ${Math.max(screenRect.width, 200)}px;
        background: rgba(42, 48, 56, 0.95);
        border: 1px solid rgba(134, 142, 150, 0.3);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
        padding: 12px 16px;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e8eaed;
        font-size: 12px;
    `;
    
    // 레이블 생성
    const label = document.createElement('div');
    label.style.cssText = `
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 500;
        color: #6cb6ff;
    `;
    label.innerHTML = `
        <span style="margin-right: 8px;">⚙️</span>
        <span>Preprocessed Image Opacity</span>
        <span id="opacity-value" style="margin-left: auto; font-weight: 600; color: #ffffff;">100%</span>
    `;
    
    // 슬라이더 생성
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = Math.round((imageNode.opacity() || 1) * 100);
    slider.id = 'opacity-slider';
    slider.style.cssText = `
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: linear-gradient(to right, transparent 0%, #6cb6ff 100%);
        outline: none;
        -webkit-appearance: none;
        cursor: pointer;
    `;
    
    // 슬라이더 thumb 스타일링
    const style = document.createElement('style');
    style.textContent = `
        #opacity-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #6cb6ff;
            border: 2px solid #ffffff;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        
        #opacity-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #6cb6ff;
            border: 2px solid #ffffff;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        
        #opacity-slider:hover::-webkit-slider-thumb {
            background: #5aa3e8;
            transform: scale(1.1);
        }
    `;
    
    document.head.appendChild(style);
    
    // 슬라이더 이벤트 핸들러
    const valueDisplay = label.querySelector('#opacity-value');
    
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const opacity = value / 100;
        
        // 값 표시 업데이트
        valueDisplay.textContent = `${value}%`;
        
        // 이미지 불투명도 실시간 업데이트
        if (currentImage) {
            currentImage.opacity(opacity);
            currentImage.getLayer().batchDraw();
        }
    });
    
    // 닫기 버튼 생성
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.cssText = `
        position: absolute;
        top: 4px;
        right: 6px;
        background: none;
        border: none;
        color: #9ca3af;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        transition: all 0.2s;
    `;
    
    closeButton.addEventListener('mouseenter', () => {
        closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
        closeButton.style.color = '#ffffff';
    });
    
    closeButton.addEventListener('mouseleave', () => {
        closeButton.style.background = 'none';
        closeButton.style.color = '#9ca3af';
    });
    
    closeButton.addEventListener('click', () => {
        hideOpacitySlider();
    });
    
    // 요소들 조립
    opacitySliderContainer.appendChild(label);
    opacitySliderContainer.appendChild(slider);
    opacitySliderContainer.appendChild(closeButton);
    
    // DOM에 추가
    document.body.appendChild(opacitySliderContainer);
    
    // 초기 값 표시 업데이트
    valueDisplay.textContent = `${slider.value}%`;
    
    console.log(`🎚️ Opacity slider shown for image at opacity: ${slider.value}%`);
}

/**
 * 불투명도 슬라이더 숨기기
 */
export function hideOpacitySlider() {
    if (opacitySliderContainer) {
        opacitySliderContainer.remove();
        opacitySliderContainer = null;
        currentImage = null;
        console.log('🎚️ Opacity slider hidden');
    }
}

/**
 * 현재 슬라이더가 표시되고 있는지 확인
 */
export function isOpacitySliderVisible() {
    return opacitySliderContainer !== null;
}

/**
 * 슬라이더 위치 업데이트 (스크롤이나 줌 변경 시)
 */
export function updateOpacitySliderPosition() {
    if (!opacitySliderContainer || !currentImage || !stage) return;
    
    // 이미지의 현재 화면상 위치 재계산
    const imageRect = getNodeRect(currentImage);
    const stagePos = stage.getAbsolutePosition();
    const stageScale = stage.scaleX();
    
    const screenRect = {
        x: (imageRect.x * stageScale) + stagePos.x,
        y: (imageRect.y * stageScale) + stagePos.y,
        width: imageRect.width * stageScale,
        height: imageRect.height * stageScale
    };
    
    // 슬라이더 위치 업데이트
    opacitySliderContainer.style.left = `${screenRect.x}px`;
    opacitySliderContainer.style.top = `${screenRect.y + screenRect.height + 10}px`;
    opacitySliderContainer.style.width = `${Math.max(screenRect.width, 200)}px`;
}