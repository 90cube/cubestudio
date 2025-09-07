// components/controlnet/controlNetManager.js

import { 
    processCannyEdge, 
    konvaImageToHTMLImage, 
    savePreprocessedImage,
    canvasToBlob,
    getPreprocessorOutputPath
} from './processors/cannyProcessor.js';

import { 
    processDepthMap,
    konvaImageToHTMLImage as depthKonvaImageToHTMLImage,
    savePreprocessedImage as depthSavePreprocessedImage,
    canvasToBlob as depthCanvasToBlob,
    getPreprocessorOutputPath as depthGetPreprocessorOutputPath
} from './processors/depthProcessor.js';

import pathConfig from '../../core/pathConfig.js';

/**
 * ControlNet 관리자
 * 이미지별 ControlNet 전처리 모달을 관리합니다.
 */

// 활성화된 ControlNet 모달들
const activeControlNetModals = new Map();

// 사용 가능한 전처리기 모델 목록
let availablePreprocessors = [];

/**
 * 전처리기 모델 목록 로드
 */
async function loadPreprocessorModels() {
    try {
        // 백엔드 API에서 사용 가능한 전처리기 목록 가져오기
        const response = await fetch('http://localhost:9004/api/preprocessors');
        if (response.ok) {
            availablePreprocessors = await response.json();
            console.log('✅ 전처리기 모델 로드 완료:', availablePreprocessors.length, '개');
        } else {
            throw new Error(`API response error: ${response.status}`);
        }
    } catch (error) {
        console.warn('⚠️  백엔드 API 연결 실패, 폴백 모델 사용:', error);
        
        // 폴백으로 내장 + OpenCV 사용
        availablePreprocessors = [
            { id: 'builtin', name: '내장 알고리즘 (JavaScript)', type: 'builtin', available: true },
            { id: 'opencv_canny', name: 'OpenCV Canny (백엔드 필요)', type: 'opencv', available: false }
        ];
    }
}

/**
 * 이미지용 ControlNet 전처리 패널 열기
 * @param {Konva.Image} imageNode - 전처리할 이미지 노드
 */
export async function openControlNetPanel(imageNode) {
    const imageId = imageNode.id() || `image-${Date.now()}`;
    
    // 이미 해당 이미지의 모달이 열려있으면 포커스만 이동
    if (activeControlNetModals.has(imageId)) {
        const existingModal = activeControlNetModals.get(imageId);
        existingModal.focus();
        return existingModal;
    }
    
    // 전처리기 모델 목록 로드 (아직 로드되지 않았다면)
    if (availablePreprocessors.length === 0) {
        await loadPreprocessorModels();
    }
    
    // 모달 생성
    const modal = createControlNetModal(imageNode);
    
    // 모달 목록에 추가
    activeControlNetModals.set(imageId, modal);
    
    console.log(`ControlNet modal opened for image: ${imageId}`);
    return modal;
}

/**
 * ControlNet 모달 생성
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @returns {Object} 모달 객체
 */
function createControlNetModal(imageNode) {
    const imageId = imageNode.id() || `image-${Date.now()}`;
    
    // 모달 백드롭 생성
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // 모달 컨테이너 생성
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #2a2a2a;
        border-radius: 12px;
        width: 500px;
        max-width: 90vw;
        max-height: 80vh;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
        border: 1px solid #444;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    `;
    
    // 모달 헤더 생성
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: between;
        padding: 16px 20px;
        background: #3498db;
        color: white;
        font-weight: 600;
    `;
    
    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0; flex: 1; font-size: 16px;';
    title.textContent = `🎛️ ControlNet - ${imageNode.name() || 'Image'}`;
    
    const closeButton = document.createElement('button');
    closeButton.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        margin-left: 16px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    closeButton.innerHTML = '×';
    
    // 모달 바디 생성
    const body = document.createElement('div');
    body.style.cssText = `
        flex: 1;
        overflow-y: auto;
        min-height: 400px;
    `;
    
    // ControlNet UI를 바디에 추가
    const controlNetUI = createControlNetUI(imageNode);
    body.appendChild(controlNetUI);
    
    // 헤더 구성
    header.appendChild(title);
    header.appendChild(closeButton);
    
    // 모달 구성
    modal.appendChild(header);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    
    // 닫기 기능 구현
    const closeModal = () => {
        document.body.removeChild(backdrop);
        activeControlNetModals.delete(imageId);
        console.log(`ControlNet modal closed for image: ${imageId}`);
    };
    
    // 이벤트 리스너 추가
    closeButton.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeModal();
        }
    });
    
    // ESC 키로 닫기
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // 모달 표시
    document.body.appendChild(backdrop);
    
    // 모달 객체 반환 (focus 메서드 포함)
    return {
        element: backdrop,
        close: closeModal,
        focus: () => {
            backdrop.style.zIndex = '10001';
            setTimeout(() => {
                backdrop.style.zIndex = '10000';
            }, 100);
        }
    };
}

/**
 * ControlNet UI 생성
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @returns {HTMLElement} ControlNet UI 엘리먼트
 */
function createControlNetUI(imageNode) {
    const container = document.createElement('div');
    container.className = 'controlnet-container';
    container.style.cssText = `
        height: 100%;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e8eaed;
    `;
    
    // 탭 컨테이너
    const tabContainer = document.createElement('div');
    tabContainer.className = 'controlnet-tabs';
    tabContainer.style.cssText = `
        display: flex;
        border-bottom: 1px solid #444;
        background: #2a2a2a;
        border-radius: 8px 8px 0 0;
    `;
    
    // 탭 버튼들
    const tabs = [
        { id: 'depth', name: 'Depth', icon: '🏔️' },
        { id: 'canny', name: 'Canny', icon: '📐' },
        { id: 'openpose', name: 'OpenPose', icon: '🤸' }
    ];
    
    let activeTab = 'canny'; // 기본 활성 탭
    
    tabs.forEach(tab => {
        const tabButton = document.createElement('button');
        tabButton.className = `controlnet-tab ${tab.id === activeTab ? 'active' : ''}`;
        tabButton.dataset.tab = tab.id;
        tabButton.innerHTML = `${tab.icon} ${tab.name}`;
        tabButton.style.cssText = `
            flex: 1;
            padding: 12px 8px;
            background: ${tab.id === activeTab ? '#3498db' : 'transparent'};
            color: ${tab.id === activeTab ? '#ffffff' : '#ccc'};
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        `;
        
        tabButton.addEventListener('click', () => {
            switchTab(tab.id, container, container._imageNode);
        });
        
        tabContainer.appendChild(tabButton);
    });
    
    // 컨텐츠 영역
    const contentArea = document.createElement('div');
    contentArea.className = 'controlnet-content';
    contentArea.style.cssText = `
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        background: #1a1a1a;
    `;
    
    // 이미지 노드 참조 저장
    container._imageNode = imageNode;
    
    container.appendChild(tabContainer);
    container.appendChild(contentArea);
    
    // 초기 탭 컨텐츠 로드
    switchTab(activeTab, container, imageNode);
    
    return container;
}

/**
 * 탭 전환
 * @param {string} tabId - 전환할 탭 ID
 * @param {HTMLElement} container - 컨테이너 엘리먼트
 */
function switchTab(tabId, container, imageNode) {
    // 탭 버튼 스타일 업데이트
    const tabButtons = container.querySelectorAll('.controlnet-tab');
    tabButtons.forEach(button => {
        const isActive = button.dataset.tab === tabId;
        button.style.background = isActive ? '#3498db' : 'transparent';
        button.style.color = isActive ? '#ffffff' : '#ccc';
    });
    
    // 컨텐츠 업데이트
    const contentArea = container.querySelector('.controlnet-content');
    contentArea.innerHTML = '';
    
    switch(tabId) {
        case 'depth':
            contentArea.appendChild(createDepthUI(imageNode));
            break;
        case 'canny':
            contentArea.appendChild(createCannyUI(imageNode));
            break;
        case 'openpose':
            contentArea.appendChild(createOpenPoseUI());
            break;
    }
}

/**
 * Depth 전처리 UI 생성
 */
function createDepthUI(imageNode) {
    const container = document.createElement('div');
    
    // 현재 이미지 참조 저장
    container._imageNode = imageNode;
    
    // UI 구성
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; padding: 20px 20px 10px 20px;';
    header.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #e67e22;">🏔️ Depth Map</h3>
        <p style="color: #ccc; margin: 0;">깊이 정보를 추출하여 3D 구조를 파악합니다.</p>
    `;
    
    // 모델 선택 영역
    const modelSelectorDiv = document.createElement('div');
    modelSelectorDiv.style.cssText = 'padding: 0 20px 16px 20px;';
    
    const modelLabel = document.createElement('label');
    modelLabel.style.cssText = 'display: block; margin-bottom: 8px; color: #ddd; font-size: 13px; font-weight: 500;';
    modelLabel.textContent = 'Depth 모델 선택';
    
    const modelSelect = document.createElement('select');
    modelSelect.id = 'depth-model-selector';
    modelSelect.style.cssText = `
        width: 100%;
        background: #3a3a3a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 5px;
        padding: 8px;
        font-size: 13px;
        cursor: pointer;
    `;
    
    // Depth 전용 모델 필터링 (백엔드에서 가져온 모델 중 depth 관련만)
    const depthModels = availablePreprocessors.filter(model => 
        model.id.includes('depth') || 
        model.id.includes('midas') || 
        model.id.includes('dpt') || 
        model.id.includes('zoedepth') ||
        model.id === 'builtin_depth'
    );
    
    // 폴백으로 내장 모델 추가 (백엔드에서 못 가져온 경우)
    if (depthModels.length === 0) {
        depthModels.push(
            { id: 'builtin_depth', name: '내장 알고리즘 (JavaScript)', type: 'builtin', available: true }
        );
    }
    
    depthModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        option.dataset.type = model.type;
        if (model.type === 'builtin') {
            option.selected = true; // 기본값: 내장 알고리즘
        }
        modelSelect.appendChild(option);
    });
    
    modelSelectorDiv.appendChild(modelLabel);
    modelSelectorDiv.appendChild(modelSelect);
    
    // 파라미터 컨트롤
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'depth-controls';
    controlsDiv.style.cssText = 'padding: 0 20px; text-align: left;';
    
    // 대비 조절
    const contrastDiv = document.createElement('div');
    contrastDiv.style.cssText = 'margin-bottom: 16px;';
    contrastDiv.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-size: 13px;">
            대비 (Contrast): <span id="contrast-value">1.2</span>
        </label>
        <input type="range" id="contrast" min="0.5" max="3.0" step="0.1" value="1.2" 
               style="width: 100%;">
    `;
    
    // 밝기 조절
    const brightnessDiv = document.createElement('div');
    brightnessDiv.style.cssText = 'margin-bottom: 16px;';
    brightnessDiv.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-size: 13px;">
            밝기 (Brightness): <span id="brightness-value">0.1</span>
        </label>
        <input type="range" id="brightness" min="-0.5" max="0.5" step="0.05" value="0.1" 
               style="width: 100%;">
    `;
    
    // 스무딩 정도
    const smoothingDiv = document.createElement('div');
    smoothingDiv.style.cssText = 'margin-bottom: 16px;';
    smoothingDiv.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-size: 13px;">
            스무딩 정도: <span id="smoothing-value">2</span>
        </label>
        <input type="range" id="smoothing" min="0" max="5" value="2" 
               style="width: 100%;">
    `;
    
    // 깊이 강도
    const depthStrengthDiv = document.createElement('div');
    depthStrengthDiv.style.cssText = 'margin-bottom: 16px;';
    depthStrengthDiv.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-size: 13px;">
            깊이 강도: <span id="depth-strength-value">1.0</span>
        </label>
        <input type="range" id="depth-strength" min="0.1" max="2.0" step="0.1" value="1.0" 
               style="width: 100%;">
    `;
    
    // 미리보기 영역
    const previewDiv = document.createElement('div');
    previewDiv.style.cssText = `
        margin: 20px;
        min-height: 150px;
        border: 2px dashed #444;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
        font-size: 14px;
        background: #111;
    `;
    previewDiv.innerHTML = '<div>미리보기가 여기에 표시됩니다</div>';
    
    // 버튼들
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.cssText = 'display: flex; gap: 8px; padding: 0 20px 20px 20px;';
    
    const previewButton = document.createElement('button');
    previewButton.textContent = '미리보기';
    previewButton.style.cssText = `
        flex: 1; padding: 10px; background: #e67e22; color: white; 
        border: none; border-radius: 4px; cursor: pointer;
        transition: background 0.2s;
    `;
    
    const applyButton = document.createElement('button');
    applyButton.textContent = '저장하기';
    applyButton.style.cssText = `
        flex: 1; padding: 10px; background: #3498db; color: white; 
        border: none; border-radius: 4px; cursor: pointer;
        transition: background 0.2s;
    `;
    
    // 이벤트 리스너들
    const contrastSlider = contrastDiv.querySelector('#contrast');
    const brightnessSlider = brightnessDiv.querySelector('#brightness');
    const smoothingSlider = smoothingDiv.querySelector('#smoothing');
    const depthStrengthSlider = depthStrengthDiv.querySelector('#depth-strength');
    const contrastValueSpan = contrastDiv.querySelector('#contrast-value');
    const brightnessValueSpan = brightnessDiv.querySelector('#brightness-value');
    const smoothingValueSpan = smoothingDiv.querySelector('#smoothing-value');
    const depthStrengthValueSpan = depthStrengthDiv.querySelector('#depth-strength-value');
    
    contrastSlider.addEventListener('input', (e) => {
        contrastValueSpan.textContent = e.target.value;
    });
    
    brightnessSlider.addEventListener('input', (e) => {
        brightnessValueSpan.textContent = e.target.value;
    });
    
    smoothingSlider.addEventListener('input', (e) => {
        smoothingValueSpan.textContent = e.target.value;
    });
    
    depthStrengthSlider.addEventListener('input', (e) => {
        depthStrengthValueSpan.textContent = e.target.value;
    });
    
    // 미리보기 버튼 이벤트
    previewButton.addEventListener('click', async () => {
        await handleDepthPreview(container, previewDiv);
    });
    
    // 적용 버튼 이벤트
    applyButton.addEventListener('click', async () => {
        await handleDepthApply(container);
    });
    
    // 호버 효과
    previewButton.addEventListener('mouseenter', () => {
        previewButton.style.background = '#d35400';
    });
    previewButton.addEventListener('mouseleave', () => {
        previewButton.style.background = '#e67e22';
    });
    
    applyButton.addEventListener('mouseenter', () => {
        applyButton.style.background = '#2980b9';
    });
    applyButton.addEventListener('mouseleave', () => {
        applyButton.style.background = '#3498db';
    });
    
    // 오버레이 제거 버튼 생성
    const removeOverlayButton = document.createElement('button');
    removeOverlayButton.textContent = '오버레이 제거';
    removeOverlayButton.style.cssText = `
        background: #e74c3c;
        color: white;
        border: none;
        padding: 10px 16px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        margin: 0 5px;
        transition: background-color 0.3s;
    `;
    
    // 오버레이 제거 버튼 이벤트
    removeOverlayButton.addEventListener('click', () => {
        const imageNode = container._imageNode;
        if (imageNode && imageNode.depthOverlay) {
            const overlay = imageNode.depthOverlay;
            
            // 이벤트 리스너 제거
            if (overlay._syncHandler) {
                imageNode.off('dragmove transform', overlay._syncHandler);
            }
            
            // 오버레이 제거
            overlay.destroy();
            imageNode.depthOverlay = null;
            imageNode.getLayer().batchDraw();
            
            // 상태 메시지 업데이트
            const statusDiv = container.querySelector('#depth-status-message');
            if (statusDiv) {
                statusDiv.textContent = '오버레이가 제거되었습니다 (원본만 표시됨)';
                statusDiv.style.color = '#e67e22';
                statusDiv.style.background = 'rgba(230, 126, 34, 0.1)';
                statusDiv.style.borderColor = 'rgba(230, 126, 34, 0.3)';
            }
        }
    });
    
    // 오버레이 제거 버튼 호버 효과
    removeOverlayButton.addEventListener('mouseenter', () => {
        removeOverlayButton.style.background = '#c0392b';
    });
    removeOverlayButton.addEventListener('mouseleave', () => {
        removeOverlayButton.style.background = '#e74c3c';
    });
    
    buttonsDiv.appendChild(previewButton);
    buttonsDiv.appendChild(applyButton);
    buttonsDiv.appendChild(removeOverlayButton);
    
    // 상태 메시지 영역
    const statusDiv = document.createElement('div');
    statusDiv.id = 'depth-status-message';
    statusDiv.style.cssText = `
        margin: 16px 20px 8px 20px;
        padding: 12px;
        background: rgba(230, 126, 34, 0.1);
        border: 1px solid rgba(230, 126, 34, 0.3);
        border-radius: 6px;
        color: #ccc;
        font-size: 13px;
        text-align: center;
        min-height: 20px;
        transition: all 0.3s;
    `;
    statusDiv.textContent = '미리보기 후 적용하여 Depth Map을 완료하세요';
    
    // 모델 선택 변경 이벤트 리스너
    modelSelect.addEventListener('change', (e) => {
        const selectedModel = depthModels.find(m => m.id === e.target.value);
        const isBuiltin = selectedModel && selectedModel.type === 'builtin';
        
        // 상태 메시지 업데이트
        const statusDiv = container.querySelector('#depth-status-message');
        if (statusDiv) {
            if (isBuiltin) {
                statusDiv.textContent = '미리보기 후 적용하여 Depth Map을 완료하세요';
                statusDiv.style.color = '#ccc';
                statusDiv.style.background = 'rgba(230, 126, 34, 0.1)';
                statusDiv.style.borderColor = 'rgba(230, 126, 34, 0.3)';
            } else {
                statusDiv.textContent = `선택됨: ${selectedModel.name} (AI 모델 - 백엔드 필요)`;
                statusDiv.style.color = '#e67e22';
                statusDiv.style.background = 'rgba(230, 126, 34, 0.1)';
                statusDiv.style.borderColor = 'rgba(230, 126, 34, 0.3)';
            }
        }
        
        console.log('Selected depth model:', selectedModel);
    });
    
    // 모든 요소 조립
    controlsDiv.appendChild(contrastDiv);
    controlsDiv.appendChild(brightnessDiv);
    controlsDiv.appendChild(smoothingDiv);
    controlsDiv.appendChild(depthStrengthDiv);
    
    container.appendChild(header);
    container.appendChild(modelSelectorDiv);
    container.appendChild(controlsDiv);
    container.appendChild(previewDiv);
    container.appendChild(buttonsDiv);
    container.appendChild(statusDiv);
    
    return container;
}

/**
 * Canny 전처리 UI 생성
 */
function createCannyUI(imageNode) {
    const container = document.createElement('div');
    
    // 현재 이미지 참조 저장
    container._imageNode = imageNode;
    
    // UI 구성
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; padding: 20px 20px 10px 20px;';
    header.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #3498db;">📐 Canny Edge</h3>
        <p style="color: #ccc; margin: 0;">윤곽선을 검출하여 구조적 정보를 추출합니다.</p>
    `;
    
    // 모델 선택 영역
    const modelSelectorDiv = document.createElement('div');
    modelSelectorDiv.style.cssText = 'padding: 0 20px 16px 20px;';
    
    const modelLabel = document.createElement('label');
    modelLabel.style.cssText = 'display: block; margin-bottom: 8px; color: #ddd; font-size: 13px; font-weight: 500;';
    modelLabel.textContent = '전처리기 모델 선택';
    
    const modelSelect = document.createElement('select');
    modelSelect.id = 'model-selector';
    modelSelect.style.cssText = `
        width: 100%;
        background: #3a3a3a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 5px;
        padding: 8px;
        font-size: 13px;
        cursor: pointer;
    `;
    
    // Canny/Edge Detection 전용 모델 필터링 (백엔드에서 가져온 모델 중 edge detection 관련만)
    const cannyModels = availablePreprocessors.filter(model => 
        model.id.includes('canny') || 
        model.id.includes('edge') || 
        model.id.includes('network-bsds500') ||
        model.id.includes('pidinet') ||
        model.id === 'builtin'
    );
    
    // 폴백으로 내장 모델 추가 (백엔드에서 못 가져온 경우)
    if (cannyModels.length === 0) {
        cannyModels.push(
            { id: 'builtin', name: '내장 알고리즘 (JavaScript)', type: 'builtin', available: true }
        );
    }
    
    // Canny 전용 모델 옵션 추가
    cannyModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        option.dataset.type = model.type;
        if (model.type === 'builtin') {
            option.selected = true; // 기본값: 내장 알고리즘
        }
        modelSelect.appendChild(option);
    });
    
    modelSelectorDiv.appendChild(modelLabel);
    modelSelectorDiv.appendChild(modelSelect);
    
    // 파라미터 컨트롤
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'canny-controls';
    controlsDiv.style.cssText = 'padding: 0 20px; text-align: left;';
    
    // 임계값 하한
    const lowThresholdDiv = document.createElement('div');
    lowThresholdDiv.style.cssText = 'margin-bottom: 16px;';
    lowThresholdDiv.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-size: 13px;">
            임계값 하한: <span id="low-value">100</span>
        </label>
        <input type="range" id="low-threshold" min="0" max="255" value="100" 
               style="width: 100%;">
    `;
    
    // 임계값 상한
    const highThresholdDiv = document.createElement('div');
    highThresholdDiv.style.cssText = 'margin-bottom: 16px;';
    highThresholdDiv.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-size: 13px;">
            임계값 상한: <span id="high-value">200</span>
        </label>
        <input type="range" id="high-threshold" min="0" max="255" value="200" 
               style="width: 100%;">
    `;
    
    // L2 Gradient 체크박스
    const gradientDiv = document.createElement('div');
    gradientDiv.style.cssText = 'margin: 16px 0;';
    gradientDiv.innerHTML = `
        <label style="display: flex; align-items: center; color: #ddd; font-size: 13px;">
            <input type="checkbox" id="l2-gradient" checked style="margin-right: 8px;">
            L2 Gradient 사용
        </label>
    `;
    
    // 미리보기 영역
    const previewDiv = document.createElement('div');
    previewDiv.style.cssText = `
        margin: 20px;
        min-height: 150px;
        border: 2px dashed #444;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
        font-size: 14px;
        background: #111;
    `;
    previewDiv.innerHTML = '<div>미리보기가 여기에 표시됩니다</div>';
    
    // 버튼들
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.cssText = 'display: flex; gap: 8px; padding: 0 20px 20px 20px;';
    
    const previewButton = document.createElement('button');
    previewButton.textContent = '미리보기';
    previewButton.style.cssText = `
        flex: 1; padding: 10px; background: #27ae60; color: white; 
        border: none; border-radius: 4px; cursor: pointer;
        transition: background 0.2s;
    `;
    
    const applyButton = document.createElement('button');
    applyButton.textContent = '저장하기';
    applyButton.style.cssText = `
        flex: 1; padding: 10px; background: #3498db; color: white; 
        border: none; border-radius: 4px; cursor: pointer;
        transition: background 0.2s;
    `;
    
    // 이벤트 리스너들
    const lowSlider = lowThresholdDiv.querySelector('#low-threshold');
    const highSlider = highThresholdDiv.querySelector('#high-threshold');
    const lowValueSpan = lowThresholdDiv.querySelector('#low-value');
    const highValueSpan = highThresholdDiv.querySelector('#high-value');
    
    lowSlider.addEventListener('input', (e) => {
        lowValueSpan.textContent = e.target.value;
    });
    
    highSlider.addEventListener('input', (e) => {
        highValueSpan.textContent = e.target.value;
    });
    
    // 미리보기 버튼 이벤트
    previewButton.addEventListener('click', async () => {
        await handleCannyPreview(container, previewDiv);
    });
    
    // 적용 버튼 이벤트
    applyButton.addEventListener('click', async () => {
        await handleCannyApply(container);
    });
    
    // 호버 효과
    previewButton.addEventListener('mouseenter', () => {
        previewButton.style.background = '#2ecc71';
    });
    previewButton.addEventListener('mouseleave', () => {
        previewButton.style.background = '#27ae60';
    });
    
    applyButton.addEventListener('mouseenter', () => {
        applyButton.style.background = '#2980b9';
    });
    applyButton.addEventListener('mouseleave', () => {
        applyButton.style.background = '#3498db';
    });
    
    // 오버레이 제거 버튼 생성
    const removeOverlayButton = document.createElement('button');
    removeOverlayButton.textContent = '오버레이 제거';
    removeOverlayButton.style.cssText = `
        background: #e74c3c;
        color: white;
        border: none;
        padding: 10px 16px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        margin: 0 5px;
        transition: background-color 0.3s;
    `;
    
    // 오버레이 제거 버튼 이벤트
    removeOverlayButton.addEventListener('click', () => {
        const imageNode = container._imageNode;
        if (imageNode && imageNode.controlNetOverlay) {
            const overlay = imageNode.controlNetOverlay;
            
            // 이벤트 리스너 제거
            if (overlay._syncHandler) {
                imageNode.off('dragmove transform', overlay._syncHandler);
            }
            
            // 오버레이 제거
            overlay.destroy();
            imageNode.controlNetOverlay = null;
            imageNode.getLayer().batchDraw();
            
            // 상태 메시지 업데이트
            const statusDiv = container.querySelector('#status-message');
            if (statusDiv) {
                statusDiv.textContent = '오버레이가 제거되었습니다 (원본만 표시됨)';
                statusDiv.style.color = '#e67e22';
                statusDiv.style.background = 'rgba(230, 126, 34, 0.1)';
                statusDiv.style.borderColor = 'rgba(230, 126, 34, 0.3)';
            }
        }
    });
    
    // 오버레이 제거 버튼 호버 효과
    removeOverlayButton.addEventListener('mouseenter', () => {
        removeOverlayButton.style.background = '#c0392b';
    });
    removeOverlayButton.addEventListener('mouseleave', () => {
        removeOverlayButton.style.background = '#e74c3c';
    });
    
    buttonsDiv.appendChild(previewButton);
    buttonsDiv.appendChild(applyButton);
    buttonsDiv.appendChild(removeOverlayButton);
    
    // 상태 메시지 영역
    const statusDiv = document.createElement('div');
    statusDiv.id = 'status-message';
    statusDiv.style.cssText = `
        margin: 16px 20px 8px 20px;
        padding: 12px;
        background: rgba(52, 152, 219, 0.1);
        border: 1px solid rgba(52, 152, 219, 0.3);
        border-radius: 6px;
        color: #ccc;
        font-size: 13px;
        text-align: center;
        min-height: 20px;
        transition: all 0.3s;
    `;
    statusDiv.textContent = '미리보기 후 적용하여 전처리를 완료하세요';
    
    // 모델 선택 변경 이벤트 리스너
    modelSelect.addEventListener('change', (e) => {
        const selectedModel = cannyModels.find(m => m.id === e.target.value);
        const isBuiltin = selectedModel && selectedModel.type === 'builtin';
        
        // 상태 메시지 업데이트 (파라미터 컨트롤은 항상 활성화 유지)
        const statusDiv = container.querySelector('#status-message');
        if (statusDiv) {
            if (isBuiltin) {
                statusDiv.textContent = '미리보기 후 적용하여 전처리를 완료하세요';
                statusDiv.style.color = '#ccc';
                statusDiv.style.background = 'rgba(52, 152, 219, 0.1)';
                statusDiv.style.borderColor = 'rgba(52, 152, 219, 0.3)';
            } else {
                statusDiv.textContent = `선택됨: ${selectedModel.name} (임계값 파라미터도 전송됨)`;
                statusDiv.style.color = '#27ae60';
                statusDiv.style.background = 'rgba(46, 204, 113, 0.1)';
                statusDiv.style.borderColor = 'rgba(46, 204, 113, 0.3)';
            }
        }
        
        console.log('Selected Canny preprocessor:', selectedModel);
    });
    
    // 모든 요소 조립
    controlsDiv.appendChild(lowThresholdDiv);
    controlsDiv.appendChild(highThresholdDiv);
    controlsDiv.appendChild(gradientDiv);
    
    container.appendChild(header);
    container.appendChild(modelSelectorDiv);
    container.appendChild(controlsDiv);
    container.appendChild(previewDiv);
    container.appendChild(buttonsDiv);
    container.appendChild(statusDiv);
    
    return container;
}

/**
 * OpenPose 전처리 UI 생성
 */
function createOpenPoseUI() {
    const container = document.createElement('div');
    
    // UI 구성
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; padding: 20px 20px 10px 20px;';
    header.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #9b59b6;">🤸 OpenPose</h3>
        <p style="color: #ccc; margin: 0;">사람의 포즈와 골격 구조를 인식합니다.</p>
    `;
    
    // 모델 선택 영역
    const modelSelectorDiv = document.createElement('div');
    modelSelectorDiv.style.cssText = 'padding: 0 20px 16px 20px;';
    
    const modelLabel = document.createElement('label');
    modelLabel.style.cssText = 'display: block; margin-bottom: 8px; color: #ddd; font-size: 13px; font-weight: 500;';
    modelLabel.textContent = 'OpenPose 모델 선택';
    
    const modelSelect = document.createElement('select');
    modelSelect.id = 'openpose-model-selector';
    modelSelect.style.cssText = `
        width: 100%;
        background: #3a3a3a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 5px;
        padding: 8px;
        font-size: 13px;
        cursor: pointer;
    `;
    
    // OpenPose 전용 모델 필터링
    const openposeModels = availablePreprocessors.filter(model => 
        model.id.includes('openpose') || 
        model.id.includes('pose') || 
        model.id.includes('human') ||
        model.id.includes('body')
    );
    
    // 폴백으로 내장 모델 추가 (백엔드에서 못 가져온 경우)
    if (openposeModels.length === 0) {
        openposeModels.push(
            { id: 'builtin_openpose', name: '내장 알고리즘 (준비중)', type: 'builtin', available: false }
        );
    }
    
    // OpenPose 전용 모델 옵션 추가
    openposeModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        option.dataset.type = model.type;
        if (model.available) {
            option.selected = true; // 사용 가능한 첫 번째 모델 선택
        } else {
            option.disabled = true; // 사용 불가능한 모델은 비활성화
        }
        modelSelect.appendChild(option);
    });
    
    modelSelectorDiv.appendChild(modelLabel);
    modelSelectorDiv.appendChild(modelSelect);
    
    // 상태 메시지 영역
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = `
        margin: 16px 20px 8px 20px;
        padding: 12px;
        background: rgba(155, 89, 182, 0.1);
        border: 1px solid rgba(155, 89, 182, 0.3);
        border-radius: 6px;
        color: #ccc;
        font-size: 13px;
        text-align: center;
        min-height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
    `;
    
    if (openposeModels.some(m => m.available)) {
        statusDiv.innerHTML = `
            <div style="font-size: 16px; margin-bottom: 8px;">🤸</div>
            <div>OpenPose 모델이 준비되었습니다</div>
            <div style="font-size: 11px; margin-top: 8px; opacity: 0.7;">
                현재 ${openposeModels.filter(m => m.available).length}개의 모델이 사용 가능합니다
            </div>
        `;
    } else {
        statusDiv.innerHTML = `
            <div style="font-size: 16px; margin-bottom: 8px;">⚠️</div>
            <div>OpenPose 모델 준비 중</div>
            <div style="font-size: 11px; margin-top: 8px; opacity: 0.7;">
                백엔드에서 OpenPose 모델을 로드하고 있습니다<br>
                잠시만 기다려 주세요
            </div>
        `;
    }
    
    container.appendChild(header);
    container.appendChild(modelSelectorDiv);
    container.appendChild(statusDiv);
    
    return container;
}

/**
 * 모든 ControlNet 모달 닫기
 */
export function closeAllControlNetPanels() {
    activeControlNetModals.forEach(modal => {
        modal.close();
    });
    activeControlNetModals.clear();
}

/**
 * 특정 이미지의 ControlNet 모달 닫기
 * @param {string} imageId - 이미지 ID
 */
export function closeControlNetPanel(imageId) {
    if (activeControlNetModals.has(imageId)) {
        const modal = activeControlNetModals.get(imageId);
        modal.close();
    }
}

/**
 * Canny 미리보기 처리
 * @param {HTMLElement} container - UI 컨테이너
 * @param {HTMLElement} previewDiv - 미리보기 영역
 */
async function handleCannyPreview(container, previewDiv) {
    const imageNode = container._imageNode;
    if (!imageNode) return;
    
    // 선택된 모델 확인 (Canny 전용 모델에서 찾기)
    const modelSelect = container.querySelector('#model-selector');
    const selectedModelId = modelSelect ? modelSelect.value : 'builtin';
    const cannyModels = availablePreprocessors.filter(model => 
        model.id.includes('canny') || 
        model.id.includes('edge') || 
        model.id.includes('network-bsds500') ||
        model.id.includes('pidinet') ||
        model.id === 'builtin'
    );
    const selectedModel = cannyModels.find(m => m.id === selectedModelId);
    
    // 로딩 상태 표시
    previewDiv.innerHTML = `<div style="color: #ccc; text-align: center; padding: 20px;">처리 중... (${selectedModel ? selectedModel.name : '내장 알고리즘'})</div>`;
    
    try {
        let processedCanvas;
        
        if (selectedModel && selectedModel.type === 'builtin') {
            // 내장 알고리즘 사용
            const params = getCannyParameters(container);
            const htmlImage = await konvaImageToHTMLImage(imageNode);
            processedCanvas = processCannyEdge(htmlImage, params);
        } else {
            // 외부 모델 사용 - 백엔드 API 호출
            const params = getCannyParameters(container);
            processedCanvas = await processWithExternalModel(imageNode, selectedModel, params);
        }
        
        // 미리보기 영역에 결과 표시
        processedCanvas.style.cssText = `
            max-width: 100%;
            max-height: 150px;
            border-radius: 4px;
            image-rendering: crisp-edges;
        `;
        
        previewDiv.innerHTML = '';
        previewDiv.appendChild(processedCanvas);
        
        // 처리된 캔버스를 컨테이너에 저장 (적용 시 사용)
        container._processedCanvas = processedCanvas;
        
    } catch (error) {
        console.error('Canny preview failed:', error);
        previewDiv.innerHTML = '<div style="color: #e74c3c;">처리 중 오류 발생</div>';
    }
}

/**
 * 외부 모델을 사용한 전처리
 * @param {Konva.Image} imageNode - 처리할 이미지 노드
 * @param {Object} model - 선택된 모델 정보
 * @param {Object} params - 전처리 파라미터
 * @returns {HTMLCanvasElement} 처리된 캔버스
 */
async function processWithExternalModel(imageNode, model, params = {}) {
    try {
        // Konva 이미지를 데이터 URL로 변환
        const imageDataUrl = await konvaImageToDataUrl(imageNode);
        
        console.log(`🎛️  ${model.name} 전처리 시작...`);
        
        // 백엔드 API 호출
        const response = await fetch('http://localhost:9004/api/preprocess', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageDataUrl,
                model: model.id,
                params: params
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`API request failed: ${response.status} - ${error.error || 'Unknown error'}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Processing failed');
        }
        
        console.log(`✅ ${model.name} 전처리 완료`);
        
        // 결과 이미지를 캔버스로 변환
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = () => reject(new Error('Failed to load processed image'));
            img.src = result.processed_image; // Base64 데이터 URL
        });
        
    } catch (error) {
        console.error(`❌ ${model.name} 전처리 실패:`, error);
        
        // 폴백: 에러 메시지가 포함된 플레이스홀더 캔버스 반환
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        
        // 배경
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, 400, 300);
        
        // 에러 아이콘
        ctx.fillStyle = '#e74c3c';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('❌', 200, 80);
        
        // 에러 메시지
        ctx.fillStyle = '#ccc';
        ctx.font = '16px Arial';
        ctx.fillText('전처리 실패', 200, 120);
        ctx.fillText(model.name, 200, 145);
        
        ctx.fillStyle = '#e74c3c';
        ctx.font = '12px Arial';
        const errorMsg = error.message.length > 40 ? error.message.substring(0, 37) + '...' : error.message;
        ctx.fillText(errorMsg, 200, 180);
        
        ctx.fillStyle = '#95a5a6';
        ctx.fillText('백엔드 서버 확인 필요', 200, 220);
        ctx.fillText('python preprocess_server.py', 200, 240);
        
        return canvas;
    }
}

/**
 * Konva 이미지를 데이터 URL로 변환
 * @param {Konva.Image} imageNode - 변환할 이미지 노드
 * @returns {Promise<string>} 데이터 URL
 */
async function konvaImageToDataUrl(imageNode) {
    // 임시 캔버스에 이미지 그리기
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const originalImage = imageNode.image();
    canvas.width = originalImage.width || imageNode.width();
    canvas.height = originalImage.height || imageNode.height();
    
    ctx.drawImage(originalImage, 0, 0);
    
    return canvas.toDataURL('image/png');
}

/**
 * Canny 적용 및 저장 처리
 * @param {HTMLElement} container - UI 컨테이너
 */
async function handleCannyApply(container) {
    const processedCanvas = container._processedCanvas;
    console.log('📋 handleCannyApply 시작, processedCanvas:', processedCanvas);
    if (!processedCanvas) {
        alert('먼저 미리보기를 실행하세요.');
        return;
    }
    
    try {
        // 자동 파일명 생성으로 저장 (pathConfig 사용)
        const savedPath = await savePreprocessedImage(processedCanvas, null, {
            prefix: 'canny_edge'
        });
        
        const filename = savedPath.split('/').pop(); // 파일명만 추출
        
        // 이미지에 ControlNet 정보 바인딩
        const imageNode = container._imageNode;
        const params = getCannyParameters(container);
        
        if (!imageNode.controlNets) {
            imageNode.controlNets = [];
        }
        
        // 기존 Canny 설정 제거 (중복 방지)
        imageNode.controlNets = imageNode.controlNets.filter(cn => cn.type !== 'canny');
        
        // 캔버스를 Blob으로 변환
        const blob = await canvasToBlob(processedCanvas);
        
        // 새 ControlNet 정보 추가
        imageNode.controlNets.push({
            type: 'canny',
            weight: 1.0, // 기본 가중치
            parameters: params,
            processedImageUrl: URL.createObjectURL(blob),
            timestamp: new Date().toISOString()
        });
        
        // 전처리 이미지를 캔버스의 원본 이미지 위에 덮어쓰기
        console.log('🎨 오버레이 적용 시작...');
        await applyProcessedImageToCanvas(imageNode, processedCanvas);
        
        console.log('✅ Canny ControlNet applied to image:', imageNode.id());
        
        // 상태 메시지 표시 (경로 정보 포함)
        const statusDiv = container.querySelector('#status-message');
        if (statusDiv) {
            const outputPath = getPreprocessorOutputPath();
            statusDiv.innerHTML = `
                <div>✅ 전처리 완료!</div>
                <div style="font-size: 11px; margin-top: 4px; opacity: 0.9;">
                    📁 ${outputPath}/${filename}
                </div>
            `;
            statusDiv.style.color = '#2ecc71';
            statusDiv.style.background = 'rgba(46, 204, 113, 0.1)';
            statusDiv.style.borderColor = 'rgba(46, 204, 113, 0.3)';
        }
        
    } catch (error) {
        console.error('Canny apply failed:', error);
        alert('적용 중 오류가 발생했습니다.');
    }
}

/**
 * 전처리된 이미지를 원본 이미지 위에 오버레이로 추가
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {HTMLCanvasElement} processedCanvas - 전처리된 캔버스
 */
async function applyProcessedImageToCanvas(imageNode, processedCanvas) {
    try {
        console.log('📍 applyProcessedImageToCanvas 시작:', imageNode.id());
        const layer = imageNode.getLayer();
        
        // 전처리된 캔버스를 이미지로 변환
        const processedImageSrc = processedCanvas.toDataURL();
        console.log('🖼️  processedCanvas를 DataURL로 변환 완료');
        
        return new Promise((resolve, reject) => {
            const processedImage = new Image();
            
            processedImage.onload = () => {
                console.log('🎯 처리된 이미지 로드 완료, 오버레이 생성 중...');
                // 기존 ControlNet 오버레이 제거 (있다면)
                const existingOverlay = imageNode.controlNetOverlay;
                if (existingOverlay) {
                    // 기존 이벤트 리스너 제거
                    if (existingOverlay._syncHandler) {
                        imageNode.off('dragmove transform', existingOverlay._syncHandler);
                    }
                    existingOverlay.destroy();
                }
                
                // 원본 이미지의 현재 변형 상태 가져오기
                const imageTransform = imageNode.getAbsoluteTransform();
                const imageAttrs = imageNode.attrs;
                
                // 새 전처리 오버레이 이미지 생성
                const overlayImage = new Konva.Image({
                    x: imageNode.x(),
                    y: imageNode.y(),
                    image: processedImage,
                    width: imageNode.width(),
                    height: imageNode.height(),
                    scaleX: imageNode.scaleX(),
                    scaleY: imageNode.scaleY(),
                    rotation: imageNode.rotation(),
                    skewX: imageNode.skewX(),
                    skewY: imageNode.skewY(),
                    offsetX: imageNode.offsetX(),
                    offsetY: imageNode.offsetY(),
                    opacity: 0.8, // 반투명으로 설정하여 원본도 보이게 함
                    listening: true, // 마우스 이벤트 활성화 - 선택 및 조작 가능
                    name: 'controlnet-overlay',
                    draggable: true, // 드래그 가능하도록 설정
                    id: `controlnet-overlay-${imageNode.id()}-${Date.now()}` // 고유 ID 부여
                });
                
                // 선택 시 시각적 피드백 추가
                overlayImage.on('mouseenter', () => {
                    overlayImage.opacity(1.0); // 선택 시 완전 불투명
                    layer.batchDraw();
                });
                
                overlayImage.on('mouseleave', () => {
                    overlayImage.opacity(0.8); // 기본 반투명 상태로 복원
                    layer.batchDraw();
                });
                
                // 클릭 시 선택 상태 표시
                overlayImage.on('click', () => {
                    console.log(`ControlNet overlay selected: ${overlayImage.id()}`);
                    // 다른 오버레이들의 선택 해제
                    layer.find('.controlnet-overlay').forEach(node => {
                        if (node !== overlayImage) {
                            node.stroke(null);
                        }
                    });
                    // 현재 오버레이에 선택 테두리 추가
                    overlayImage.stroke('#3498db');
                    overlayImage.strokeWidth(2);
                    layer.batchDraw();
                });
                
                // 이미지 노드에 오버레이 참조 저장
                imageNode.controlNetOverlay = overlayImage;
                
                // 원본 이미지 바로 위에 오버레이 추가
                const imageIndex = imageNode.getZIndex();
                console.log('🔄 레이어에 오버레이 추가 중... imageIndex:', imageIndex);
                layer.add(overlayImage);
                overlayImage.setZIndex(imageIndex + 1);
                console.log('✅ 오버레이가 레이어에 추가됨, zIndex:', imageIndex + 1);
                
                // 원본 이미지 변형 시 오버레이도 함께 업데이트
                const syncOverlay = () => {
                    if (overlayImage && !overlayImage.isDestroyed()) {
                        overlayImage.position(imageNode.position());
                        overlayImage.scale(imageNode.scale());
                        overlayImage.rotation(imageNode.rotation());
                        overlayImage.skew(imageNode.skew());
                        overlayImage.offset(imageNode.offset());
                        overlayImage.setZIndex(imageNode.getZIndex() + 1);
                    }
                };
                
                // 이벤트 리스너 추가 (이미지 변형 시 오버레이 동기화)
                imageNode.on('dragmove transform', syncOverlay);
                
                // 기존 이벤트 리스너 제거를 위한 참조 저장
                overlayImage._syncHandler = syncOverlay;
                
                layer.batchDraw();
                
                console.log('ControlNet overlay applied successfully (원본 보존됨)');
                resolve();
            };
            
            processedImage.onerror = () => {
                reject(new Error('Failed to load processed image'));
            };
            
            processedImage.src = processedImageSrc;
        });
        
    } catch (error) {
        console.error('Failed to apply processed overlay to canvas:', error);
        throw error;
    }
}

/**
 * Depth 미리보기 처리
 * @param {HTMLElement} container - UI 컨테이너
 * @param {HTMLElement} previewDiv - 미리보기 영역
 */
async function handleDepthPreview(container, previewDiv) {
    const imageNode = container._imageNode;
    if (!imageNode) return;
    
    // 선택된 모델 확인
    const modelSelect = container.querySelector('#depth-model-selector');
    const selectedModelId = modelSelect ? modelSelect.value : 'builtin_depth';
    
    // 모델 정보 찾기
    const depthModels = [
        { id: 'builtin_depth', name: '내장 알고리즘 (JavaScript)', type: 'builtin', available: true },
        { id: 'midas_v3', name: 'MiDaS v3.1 (DPT-Large)', type: 'ai_model', available: true },
        { id: 'midas_v2', name: 'MiDaS v2.1 (ResNet)', type: 'ai_model', available: true },
        { id: 'dpt_hybrid', name: 'DPT-Hybrid', type: 'ai_model', available: true },
        { id: 'depth_anything', name: 'Depth Anything V2', type: 'ai_model', available: true }
    ];
    
    const selectedModel = depthModels.find(m => m.id === selectedModelId);
    
    // 로딩 상태 표시
    previewDiv.innerHTML = `<div style="color: #ccc; text-align: center; padding: 20px;">처리 중... (${selectedModel ? selectedModel.name : '내장 알고리즘'})</div>`;
    
    try {
        let processedCanvas;
        
        if (selectedModel && selectedModel.type === 'builtin') {
            // 내장 알고리즘 사용
            const params = getDepthParameters(container);
            const htmlImage = await depthKonvaImageToHTMLImage(imageNode);
            processedCanvas = processDepthMap(htmlImage, params);
        } else {
            // 외부 AI 모델 사용 - 백엔드 API 호출
            const params = getDepthParameters(container);
            processedCanvas = await processDepthWithExternalModel(imageNode, selectedModel, params);
        }
        
        // 미리보기 영역에 결과 표시
        processedCanvas.style.cssText = `
            max-width: 100%;
            max-height: 150px;
            border-radius: 4px;
            image-rendering: crisp-edges;
        `;
        
        previewDiv.innerHTML = '';
        previewDiv.appendChild(processedCanvas);
        
        // 처리된 캔버스를 컨테이너에 저장 (적용 시 사용)
        container._processedCanvas = processedCanvas;
        
    } catch (error) {
        console.error('Depth preview failed:', error);
        previewDiv.innerHTML = '<div style="color: #e74c3c;">처리 중 오류 발생</div>';
    }
}

/**
 * Depth 적용 및 저장 처리
 * @param {HTMLElement} container - UI 컨테이너
 */
async function handleDepthApply(container) {
    const processedCanvas = container._processedCanvas;
    console.log('📋 handleDepthApply 시작, processedCanvas:', processedCanvas);
    if (!processedCanvas) {
        alert('먼저 미리보기를 실행하세요.');
        return;
    }
    
    try {
        // 자동 파일명 생성으로 저장
        const savedPath = await depthSavePreprocessedImage(processedCanvas, null, {
            prefix: 'depth_map'
        });
        
        const filename = savedPath.split('/').pop();
        
        // 이미지에 Depth ControlNet 정보 바인딩
        const imageNode = container._imageNode;
        const params = getDepthParameters(container);
        
        if (!imageNode.controlNets) {
            imageNode.controlNets = [];
        }
        
        // 기존 Depth 설정 제거 (중복 방지)
        imageNode.controlNets = imageNode.controlNets.filter(cn => cn.type !== 'depth');
        
        // 캔버스를 Blob으로 변환
        const blob = await depthCanvasToBlob(processedCanvas);
        
        // 새 ControlNet 정보 추가
        imageNode.controlNets.push({
            type: 'depth',
            weight: 1.0,
            parameters: params,
            processedImageUrl: URL.createObjectURL(blob),
            timestamp: new Date().toISOString()
        });
        
        // 전처리 이미지를 캔버스의 원본 이미지 위에 덮어쓰기
        console.log('🎨 Depth 오버레이 적용 시작...');
        try {
            await applyDepthProcessedImageToCanvas(imageNode, processedCanvas);
            console.log('✅ Depth 오버레이 적용 완료');
        } catch (overlayError) {
            console.warn('⚠️ Depth 오버레이 적용 실패, 계속 진행:', overlayError);
        }
        
        console.log('✅ Depth ControlNet applied to image:', imageNode.id());
        
        // 상태 메시지 표시
        const statusDiv = container.querySelector('#depth-status-message');
        if (statusDiv) {
            const outputPath = depthGetPreprocessorOutputPath();
            statusDiv.innerHTML = `
                <div>✅ Depth Map 완료!</div>
                <div style="font-size: 11px; margin-top: 4px; opacity: 0.9;">
                    📁 ${outputPath}/${filename}
                </div>
            `;
            statusDiv.style.color = '#e67e22';
            statusDiv.style.background = 'rgba(230, 126, 34, 0.1)';
            statusDiv.style.borderColor = 'rgba(230, 126, 34, 0.3)';
        }
        
    } catch (error) {
        console.error('Depth apply failed:', error);
        alert('적용 중 오류가 발생했습니다.');
    }
}

/**
 * Depth 전처리된 이미지를 원본 이미지 위에 오버레이로 추가
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {HTMLCanvasElement} processedCanvas - 전처리된 캔버스
 */
async function applyDepthProcessedImageToCanvas(imageNode, processedCanvas) {
    try {
        console.log('📍 applyDepthProcessedImageToCanvas 시작:', imageNode.id());
        const layer = imageNode.getLayer();
        
        // 전처리된 캔버스를 이미지로 변환
        const processedImageSrc = processedCanvas.toDataURL();
        console.log('🖼️  processedCanvas를 DataURL로 변환 완료');
        
        return new Promise((resolve, reject) => {
            const processedImage = new Image();
            
            processedImage.onload = () => {
                console.log('🎯 처리된 Depth 이미지 로드 완료, 오버레이 생성 중...');
                // 기존 Depth 오버레이 제거 (있다면)
                const existingOverlay = imageNode.depthOverlay;
                if (existingOverlay) {
                    if (existingOverlay._syncHandler) {
                        imageNode.off('dragmove transform', existingOverlay._syncHandler);
                    }
                    existingOverlay.destroy();
                }
                
                // 새 Depth 오버레이 이미지 생성
                const overlayImage = new Konva.Image({
                    x: imageNode.x(),
                    y: imageNode.y(),
                    image: processedImage,
                    width: imageNode.width(),
                    height: imageNode.height(),
                    scaleX: imageNode.scaleX(),
                    scaleY: imageNode.scaleY(),
                    rotation: imageNode.rotation(),
                    skewX: imageNode.skewX(),
                    skewY: imageNode.skewY(),
                    offsetX: imageNode.offsetX(),
                    offsetY: imageNode.offsetY(),
                    opacity: 0.8,
                    listening: true,
                    name: 'depth-overlay',
                    draggable: true,
                    id: `depth-overlay-${imageNode.id()}-${Date.now()}`
                });
                
                // 선택 시 시각적 피드백 추가
                overlayImage.on('mouseenter', () => {
                    overlayImage.opacity(1.0);
                    layer.batchDraw();
                });
                
                overlayImage.on('mouseleave', () => {
                    overlayImage.opacity(0.8);
                    layer.batchDraw();
                });
                
                // 클릭 시 선택 상태 표시
                overlayImage.on('click', () => {
                    console.log(`Depth overlay selected: ${overlayImage.id()}`);
                    // 다른 오버레이들의 선택 해제
                    layer.find('.depth-overlay').forEach(node => {
                        if (node !== overlayImage) {
                            node.stroke(null);
                        }
                    });
                    // 현재 오버레이에 선택 테두리 추가
                    overlayImage.stroke('#e67e22');
                    overlayImage.strokeWidth(2);
                    layer.batchDraw();
                });
                
                // 이미지 노드에 오버레이 참조 저장
                imageNode.depthOverlay = overlayImage;
                
                // 원본 이미지 바로 위에 오버레이 추가
                const imageIndex = imageNode.getZIndex();
                console.log('🔄 레이어에 Depth 오버레이 추가 중... imageIndex:', imageIndex);
                layer.add(overlayImage);
                overlayImage.setZIndex(imageIndex + 1);
                console.log('✅ Depth 오버레이가 레이어에 추가됨, zIndex:', imageIndex + 1);
                
                // 원본 이미지 변형 시 오버레이도 함께 업데이트
                const syncOverlay = () => {
                    if (overlayImage && !overlayImage.isDestroyed()) {
                        overlayImage.position(imageNode.position());
                        overlayImage.scale(imageNode.scale());
                        overlayImage.rotation(imageNode.rotation());
                        overlayImage.skew(imageNode.skew());
                        overlayImage.offset(imageNode.offset());
                        overlayImage.setZIndex(imageNode.getZIndex() + 1);
                    }
                };
                
                // 이벤트 리스너 추가
                imageNode.on('dragmove transform', syncOverlay);
                overlayImage._syncHandler = syncOverlay;
                
                layer.batchDraw();
                
                console.log('Depth overlay applied successfully (원본 보존됨)');
                resolve();
            };
            
            processedImage.onerror = () => {
                reject(new Error('Failed to load processed depth image'));
            };
            
            processedImage.src = processedImageSrc;
        });
        
    } catch (error) {
        console.error('Failed to apply depth overlay to canvas:', error);
        throw error;
    }
}

/**
 * 외부 AI 모델을 사용한 Depth 전처리
 * @param {Konva.Image} imageNode - 처리할 이미지 노드
 * @param {Object} model - 선택된 Depth 모델 정보
 * @param {Object} params - 전처리 파라미터
 * @returns {HTMLCanvasElement} 처리된 캔버스
 */
async function processDepthWithExternalModel(imageNode, model, params = {}) {
    try {
        // Konva 이미지를 데이터 URL로 변환
        const imageDataUrl = await konvaImageToDataUrl(imageNode);
        
        console.log(`🏔️  ${model.name} Depth 전처리 시작...`);
        
        // 백엔드 API 호출 (Depth 전용 엔드포인트)
        const response = await fetch('http://localhost:9004/api/depth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageDataUrl,
                model: model.id,
                params: {
                    ...params,
                    // Depth 전용 파라미터 추가
                    model_type: model.id,
                    output_type: 'depth_map'
                }
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Depth API request failed: ${response.status} - ${error.error || 'Unknown error'}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            console.error('❌ Depth API error:', result.error);
            throw new Error(result.error || 'Depth processing failed');
        }
        
        if (!result.processed_image) {
            console.error('❌ No processed_image in response:', result);
            throw new Error('No processed image returned from API');
        }
        
        console.log(`✅ ${model.name} Depth 전처리 완료`);
        
        // 결과 이미지를 캔버스로 변환
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = () => reject(new Error('Failed to load processed depth image'));
            img.src = result.processed_image || result.depth_map; // Base64 데이터 URL
        });
        
    } catch (error) {
        console.error(`❌ ${model.name} Depth 전처리 실패:`, error);
        
        // 폴백: 에러 메시지가 포함된 플레이스홀더 캔버스 반환
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        
        // 배경
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, 400, 300);
        
        // 에러 아이콘
        ctx.fillStyle = '#e67e22';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🏔️', 200, 80);
        
        // 에러 메시지
        ctx.fillStyle = '#ccc';
        ctx.font = '16px Arial';
        ctx.fillText('Depth 처리 실패', 200, 120);
        ctx.fillText(model.name, 200, 145);
        
        ctx.fillStyle = '#e67e22';
        ctx.font = '12px Arial';
        const errorMsg = error.message.length > 40 ? error.message.substring(0, 37) + '...' : error.message;
        ctx.fillText(errorMsg, 200, 180);
        
        ctx.fillStyle = '#95a5a6';
        ctx.fillText('백엔드 Depth 서버 확인 필요', 200, 220);
        ctx.fillText('python depth_server.py', 200, 240);
        
        return canvas;
    }
}

/**
 * UI에서 Depth 파라미터 수집
 * @param {HTMLElement} container - UI 컨테이너
 * @returns {Object} Depth 파라미터
 */
function getDepthParameters(container) {
    const contrast = parseFloat(container.querySelector('#contrast').value);
    const brightness = parseFloat(container.querySelector('#brightness').value);
    const smoothing = parseInt(container.querySelector('#smoothing').value);
    const depthStrength = parseFloat(container.querySelector('#depth-strength').value);
    
    return {
        contrast,
        brightness,
        smoothing,
        depthStrength
    };
}

/**
 * UI에서 Canny 파라미터 수집
 * @param {HTMLElement} container - UI 컨테이너
 * @returns {Object} Canny 파라미터
 */
function getCannyParameters(container) {
    const lowThreshold = parseInt(container.querySelector('#low-threshold').value);
    const highThreshold = parseInt(container.querySelector('#high-threshold').value);
    const useL2Gradient = container.querySelector('#l2-gradient').checked;
    
    return {
        lowThreshold,
        highThreshold,
        useL2Gradient
    };
}

