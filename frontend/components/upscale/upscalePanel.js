// components/upscale/upscalePanel.js

/**
 * 이미지 업스케일 패널
 * RealESRGAN을 사용한 타일 기반 업스케일 기능 제공
 */

import { setSelectedImage } from '../canvas/canvas.js';

// 활성화된 업스케일 모달들
const activeUpscaleModals = new Map();

// 사용 가능한 업스케일 모델 목록
let availableUpscaleModels = [];

/**
 * 업스케일 모델 목록 로드
 */
async function loadUpscaleModels() {
    try {
        const response = await fetch('http://localhost:8080/api/upscale/models');
        if (response.ok) {
            const data = await response.json();
            availableUpscaleModels = data.models || [];
            console.log('✅ 업스케일 모델 로드 완료:', availableUpscaleModels.length, '개');
        } else {
            throw new Error(`API response error: ${response.status}`);
        }
    } catch (error) {
        console.warn('⚠️ 업스케일 모델 로드 실패:', error);
        availableUpscaleModels = [];
    }
}

/**
 * 이미지용 업스케일 패널 열기
 * @param {Konva.Image} imageNode - 업스케일할 이미지 노드
 */
export async function openUpscalePanel(imageNode) {
    const imageId = imageNode.id() || `image-${Date.now()}`;

    // 이미 해당 이미지의 모달이 열려있으면 포커스만 이동
    if (activeUpscaleModals.has(imageId)) {
        const existingModal = activeUpscaleModals.get(imageId);
        existingModal.focus();
        return existingModal;
    }

    // 업스케일 모델 목록 로드 (아직 로드되지 않았다면)
    if (availableUpscaleModels.length === 0) {
        await loadUpscaleModels();
    }

    // 모달 생성
    const modal = createUpscaleModal(imageNode, imageId);

    // 모달 목록에 추가
    activeUpscaleModals.set(imageId, modal);

    console.log(`Upscale modal opened for image: ${imageId}`);
    return modal;
}

/**
 * 업스케일 패널 닫기
 * @param {string} imageId - 닫을 모달의 이미지 ID
 */
export function closeUpscalePanel(imageId) {
    const modal = activeUpscaleModals.get(imageId);
    if (modal) {
        modal.element.remove();
        activeUpscaleModals.delete(imageId);
        console.log(`Upscale modal closed for image: ${imageId}`);
    }
}

/**
 * 업스케일 모달 생성
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {string} imageId - 이미지 ID
 * @returns {Object} 모달 객체
 */
function createUpscaleModal(imageNode, imageId) {
    // 모달 백드롭 생성
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 2000;
        display: flex;
        justify-content: center;
        align-items: center;
    `;

    // 모달 컨테이너 생성
    const modal = document.createElement('div');
    modal.className = 'upscale-modal';
    modal.style.cssText = `
        background: #2a2d3a;
        border-radius: 12px;
        width: 500px;
        max-height: 80vh;
        overflow-y: auto;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    `;

    // 모달 헤더
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 30px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: linear-gradient(135deg, #3a3d4a, #2a2d3a);
    `;

    const title = document.createElement('h2');
    title.textContent = 'Image Upscale';
    title.style.cssText = `
        color: #e8eaed;
        font-size: 18px;
        font-weight: 600;
        margin: 0;
    `;

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.cssText = `
        background: none;
        border: none;
        color: #999;
        font-size: 24px;
        cursor: pointer;
        padding: 5px;
        line-height: 1;
        transition: color 0.2s;
    `;

    closeButton.addEventListener('click', () => closeUpscalePanel(imageId));
    closeButton.addEventListener('mouseenter', () => closeButton.style.color = '#fff');
    closeButton.addEventListener('mouseleave', () => closeButton.style.color = '#999');

    header.appendChild(title);
    header.appendChild(closeButton);

    // 모달 콘텐츠 생성
    const content = createUpscaleUI(imageNode, imageId);

    modal.appendChild(header);
    modal.appendChild(content);
    backdrop.appendChild(modal);

    // 백드롭 클릭으로 닫기
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeUpscalePanel(imageId);
        }
    });

    // ESC 키로 닫기
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            closeUpscalePanel(imageId);
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    document.body.appendChild(backdrop);

    // 모달 객체 반환
    return {
        element: backdrop,
        close: () => closeUpscalePanel(imageId),
        focus: () => modal.focus()
    };
}

/**
 * 업스케일 UI 생성
 * @param {Konva.Image} imageNode - 대상 이미지
 * @param {string} imageId - 이미지 ID
 * @returns {HTMLElement} UI 컨테이너
 */
function createUpscaleUI(imageNode, imageId) {
    const container = document.createElement('div');
    container.style.cssText = `
        padding: 30px;
    `;

    // 원본 이미지 정보
    const image = imageNode.image();
    const originalWidth = image.width;
    const originalHeight = image.height;

    // 이미지 정보 표시
    const imageInfo = document.createElement('div');
    imageInfo.style.cssText = `
        margin-bottom: 25px;
        padding: 15px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        color: #b8bcc8;
        font-size: 14px;
    `;
    imageInfo.innerHTML = `
        <div style="margin-bottom: 8px;">
            <strong style="color: #e8eaed;">Original Size:</strong> ${originalWidth} × ${originalHeight}
        </div>
        <div id="upscale-target-size" style="color: #6b9eff;">
            <strong>Target Size:</strong> ${originalWidth * 2} × ${originalHeight * 2}
        </div>
    `;

    // 모델 선택
    const modelSection = createModelSelector();

    // 스케일 팩터 슬라이더
    const scaleSection = createScaleSlider(originalWidth, originalHeight);

    // 고급 설정
    const advancedSection = createAdvancedSettings();

    // 진행 상태 표시
    const progressSection = createProgressDisplay();

    // 버튼 그룹
    const buttonGroup = createButtonGroup(imageNode, imageId, {
        originalWidth,
        originalHeight
    });

    container.appendChild(imageInfo);
    container.appendChild(modelSection);
    container.appendChild(scaleSection);
    container.appendChild(advancedSection);
    container.appendChild(progressSection);
    container.appendChild(buttonGroup);

    return container;
}

/**
 * 모델 선택 UI 생성
 */
function createModelSelector() {
    const section = document.createElement('div');
    section.style.cssText = `
        margin-bottom: 25px;
    `;

    const label = document.createElement('label');
    label.textContent = 'Upscale Model';
    label.style.cssText = `
        display: block;
        margin-bottom: 10px;
        color: #e8eaed;
        font-size: 14px;
        font-weight: 500;
    `;

    const select = document.createElement('select');
    select.id = 'upscale-model-select';
    select.style.cssText = `
        width: 100%;
        padding: 12px;
        background: #1e2029;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: #e8eaed;
        font-size: 14px;
        cursor: pointer;
        transition: border-color 0.2s;
    `;

    // 모델 옵션 추가
    if (availableUpscaleModels.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'No models available - Please add models to models/upscale_models/';
        option.disabled = true;
        select.appendChild(option);
    } else {
        availableUpscaleModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = `${model.name} (${model.native_scale}x, ${model.size_mb}MB)`;
            select.appendChild(option);
        });
    }

    select.addEventListener('mouseenter', () => {
        select.style.borderColor = 'rgba(107, 158, 255, 0.5)';
    });
    select.addEventListener('mouseleave', () => {
        select.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    });

    section.appendChild(label);
    section.appendChild(select);

    return section;
}

/**
 * 스케일 팩터 슬라이더 생성
 */
function createScaleSlider(originalWidth, originalHeight) {
    const section = document.createElement('div');
    section.style.cssText = `
        margin-bottom: 25px;
    `;

    const label = document.createElement('label');
    label.textContent = 'Scale Factor';
    label.style.cssText = `
        display: block;
        margin-bottom: 10px;
        color: #e8eaed;
        font-size: 14px;
        font-weight: 500;
    `;

    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 15px;
    `;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'upscale-factor-slider';
    slider.min = '1.0';
    slider.max = '4.0';
    slider.step = '0.1';
    slider.value = '2.0';
    slider.style.cssText = `
        flex: 1;
        height: 6px;
        background: #1e2029;
        border-radius: 3px;
        outline: none;
        cursor: pointer;
    `;

    const valueDisplay = document.createElement('div');
    valueDisplay.id = 'upscale-factor-value';
    valueDisplay.textContent = '2.0x';
    valueDisplay.style.cssText = `
        min-width: 50px;
        text-align: right;
        color: #6b9eff;
        font-size: 14px;
        font-weight: 600;
    `;

    // 슬라이더 값 변경 이벤트
    slider.addEventListener('input', (e) => {
        const factor = parseFloat(e.target.value);
        valueDisplay.textContent = `${factor.toFixed(1)}x`;

        // 타겟 사이즈 업데이트
        const targetSizeElement = document.getElementById('upscale-target-size');
        if (targetSizeElement) {
            const targetWidth = Math.round(originalWidth * factor);
            const targetHeight = Math.round(originalHeight * factor);
            targetSizeElement.innerHTML = `
                <strong>Target Size:</strong> ${targetWidth} × ${targetHeight}
            `;
        }
    });

    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(valueDisplay);

    section.appendChild(label);
    section.appendChild(sliderContainer);

    return section;
}

/**
 * 고급 설정 UI 생성
 */
function createAdvancedSettings() {
    const section = document.createElement('div');
    section.style.cssText = `
        margin-bottom: 25px;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        cursor: pointer;
        user-select: none;
    `;

    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.style.cssText = `
        color: #999;
        font-size: 12px;
        transition: transform 0.2s;
    `;

    const label = document.createElement('label');
    label.textContent = 'Advanced Settings';
    label.style.cssText = `
        color: #e8eaed;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        display: none;
        padding: 15px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 6px;
    `;

    // Tile Size 설정
    const tileSizeGroup = createNumberInput('Tile Size', 'upscale-tile-size', 512, 256, 1024, 64);

    // Overlap 설정
    const overlapGroup = createNumberInput('Tile Overlap', 'upscale-overlap', 64, 0, 256, 16);

    content.appendChild(tileSizeGroup);
    content.appendChild(overlapGroup);

    // 토글 기능
    let isExpanded = false;
    header.addEventListener('click', () => {
        isExpanded = !isExpanded;
        content.style.display = isExpanded ? 'block' : 'none';
        arrow.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
    });

    header.appendChild(arrow);
    header.appendChild(label);
    section.appendChild(header);
    section.appendChild(content);

    return section;
}

/**
 * 숫자 입력 필드 생성 헬퍼
 */
function createNumberInput(labelText, id, defaultValue, min, max, step) {
    const group = document.createElement('div');
    group.style.cssText = `
        margin-bottom: 15px;
    `;

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = `
        display: block;
        margin-bottom: 8px;
        color: #b8bcc8;
        font-size: 13px;
    `;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.value = defaultValue;
    input.min = min;
    input.max = max;
    input.step = step;
    input.style.cssText = `
        width: 100%;
        padding: 10px;
        background: #1e2029;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: #e8eaed;
        font-size: 14px;
    `;

    group.appendChild(label);
    group.appendChild(input);

    return group;
}

/**
 * 진행 상태 표시 UI 생성
 */
function createProgressDisplay() {
    const section = document.createElement('div');
    section.id = 'upscale-progress-section';
    section.style.cssText = `
        display: none;
        margin-bottom: 25px;
        padding: 15px;
        background: rgba(107, 158, 255, 0.1);
        border-radius: 6px;
        border: 1px solid rgba(107, 158, 255, 0.2);
    `;

    const statusText = document.createElement('div');
    statusText.id = 'upscale-status-text';
    statusText.style.cssText = `
        color: #6b9eff;
        font-size: 14px;
        margin-bottom: 10px;
        text-align: center;
    `;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
        width: 100%;
        height: 6px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 3px;
        overflow: hidden;
    `;

    const progressFill = document.createElement('div');
    progressFill.id = 'upscale-progress-fill';
    progressFill.style.cssText = `
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #6b9eff, #4a7fd5);
        transition: width 0.3s ease;
    `;

    progressBar.appendChild(progressFill);
    section.appendChild(statusText);
    section.appendChild(progressBar);

    return section;
}

/**
 * 버튼 그룹 생성
 */
function createButtonGroup(imageNode, imageId, imageInfo) {
    const group = document.createElement('div');
    group.style.cssText = `
        display: flex;
        gap: 15px;
        justify-content: flex-end;
    `;

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
        padding: 12px 30px;
        background: #3a3d4a;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: #e8eaed;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
    `;

    cancelButton.addEventListener('click', () => closeUpscalePanel(imageId));
    cancelButton.addEventListener('mouseenter', () => {
        cancelButton.style.background = '#4a4d5a';
    });
    cancelButton.addEventListener('mouseleave', () => {
        cancelButton.style.background = '#3a3d4a';
    });

    const upscaleButton = document.createElement('button');
    upscaleButton.id = 'upscale-process-button';
    upscaleButton.textContent = 'Upscale Image';
    upscaleButton.style.cssText = `
        padding: 12px 30px;
        background: linear-gradient(135deg, #6b9eff, #4a7fd5);
        border: none;
        border-radius: 6px;
        color: #ffffff;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    `;

    upscaleButton.addEventListener('click', () => {
        processUpscale(imageNode, imageId, imageInfo);
    });
    upscaleButton.addEventListener('mouseenter', () => {
        upscaleButton.style.transform = 'translateY(-2px)';
        upscaleButton.style.boxShadow = '0 5px 15px rgba(107, 158, 255, 0.4)';
    });
    upscaleButton.addEventListener('mouseleave', () => {
        upscaleButton.style.transform = 'translateY(0)';
        upscaleButton.style.boxShadow = 'none';
    });

    // 모델이 없으면 비활성화
    if (availableUpscaleModels.length === 0) {
        upscaleButton.disabled = true;
        upscaleButton.style.opacity = '0.5';
        upscaleButton.style.cursor = 'not-allowed';
    }

    group.appendChild(cancelButton);
    group.appendChild(upscaleButton);

    return group;
}

/**
 * 업스케일 처리 실행
 */
async function processUpscale(imageNode, imageId, imageInfo) {
    const modelSelect = document.getElementById('upscale-model-select');
    const scaleSlider = document.getElementById('upscale-factor-slider');
    const tileSizeInput = document.getElementById('upscale-tile-size');
    const overlapInput = document.getElementById('upscale-overlap');
    const processButton = document.getElementById('upscale-process-button');
    const progressSection = document.getElementById('upscale-progress-section');
    const statusText = document.getElementById('upscale-status-text');
    const progressFill = document.getElementById('upscale-progress-fill');

    // 파라미터 수집
    const modelName = modelSelect.value;
    const scaleFactor = parseFloat(scaleSlider.value);
    const tileSize = parseInt(tileSizeInput.value);
    const overlap = parseInt(overlapInput.value);

    console.log('Starting upscale:', { modelName, scaleFactor, tileSize, overlap });

    // UI 상태 업데이트
    processButton.disabled = true;
    processButton.textContent = 'Processing...';
    progressSection.style.display = 'block';
    statusText.textContent = 'Preparing image...';
    progressFill.style.width = '10%';

    try {
        // 이미지를 base64로 변환
        const image = imageNode.image();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const base64Image = canvas.toDataURL('image/png').split(',')[1];

        statusText.textContent = 'Uploading to backend...';
        progressFill.style.width = '30%';

        // API 호출
        const response = await fetch('http://localhost:8080/api/upscale/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: base64Image,
                model_name: modelName,
                scale_factor: scaleFactor,
                tile_size: tileSize,
                overlap: overlap
            })
        });

        if (!response.ok) {
            throw new Error(`Upscale failed: ${response.status} ${response.statusText}`);
        }

        statusText.textContent = 'Processing with AI model...';
        progressFill.style.width = '70%';

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Upscale processing failed');
        }

        statusText.textContent = 'Applying to canvas...';
        progressFill.style.width = '90%';

        // 결과 이미지를 캔버스에 적용
        const upscaledImage = new Image();
        upscaledImage.onload = () => {
            imageNode.image(upscaledImage);
            imageNode.getLayer().batchDraw();

            statusText.textContent = 'Complete!';
            progressFill.style.width = '100%';

            console.log('✅ Upscale complete:', result.upscaled_size);

            // 2초 후 모달 닫기
            setTimeout(() => {
                closeUpscalePanel(imageId);
            }, 2000);
        };

        upscaledImage.onerror = () => {
            throw new Error('Failed to load upscaled image');
        };

        upscaledImage.src = `data:image/png;base64,${result.image}`;

    } catch (error) {
        console.error('❌ Upscale error:', error);
        statusText.textContent = `Error: ${error.message}`;
        statusText.style.color = '#ff6b6b';
        progressFill.style.background = '#ff6b6b';

        // 버튼 복구
        processButton.disabled = false;
        processButton.textContent = 'Retry';
    }
}

export { loadUpscaleModels };
