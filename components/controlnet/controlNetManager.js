// components/controlnet/controlNetManager.js

import { 
    processCannyEdge, 
    konvaImageToHTMLImage, 
    savePreprocessedImage,
    canvasToBlob
} from './processors/cannyProcessor.js';

/**
 * ControlNet 관리자
 * 이미지별 ControlNet 전처리 모달을 관리합니다.
 */

// 활성화된 ControlNet 모달들
const activeControlNetModals = new Map();

/**
 * 이미지용 ControlNet 전처리 패널 열기
 * @param {Konva.Image} imageNode - 전처리할 이미지 노드
 */
export function openControlNetPanel(imageNode) {
    const imageId = imageNode.id() || `image-${Date.now()}`;
    
    // 이미 해당 이미지의 모달이 열려있으면 포커스만 이동
    if (activeControlNetModals.has(imageId)) {
        const existingModal = activeControlNetModals.get(imageId);
        existingModal.focus();
        return existingModal;
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
            contentArea.appendChild(createDepthUI());
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
function createDepthUI() {
    const container = document.createElement('div');
    container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #999;">
            <h3 style="margin: 0 0 10px 0;">🏔️ Depth Map</h3>
            <p>깊이 정보를 추출하여 3D 구조를 파악합니다.</p>
            <p style="font-size: 12px; margin-top: 20px;">준비 중...</p>
        </div>
    `;
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
    
    // 파라미터 컨트롤
    const controlsDiv = document.createElement('div');
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
    applyButton.textContent = '적용 & 저장';
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
    
    buttonsDiv.appendChild(previewButton);
    buttonsDiv.appendChild(applyButton);
    
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
    
    // 모든 요소 조립
    controlsDiv.appendChild(lowThresholdDiv);
    controlsDiv.appendChild(highThresholdDiv);
    controlsDiv.appendChild(gradientDiv);
    
    container.appendChild(header);
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
    container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #999;">
            <h3 style="margin: 0 0 10px 0;">🤸 OpenPose</h3>
            <p>사람의 포즈와 골격 구조를 인식합니다.</p>
            <p style="font-size: 12px; margin-top: 20px;">준비 중...</p>
        </div>
    `;
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
    
    // 로딩 상태 표시
    previewDiv.innerHTML = '<div>처리 중...</div>';
    
    try {
        // 파라미터 수집
        const params = getCannyParameters(container);
        
        // Konva 이미지를 HTML 이미지로 변환
        const htmlImage = await konvaImageToHTMLImage(imageNode);
        
        // Canny 처리
        const processedCanvas = processCannyEdge(htmlImage, params);
        
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
 * Canny 적용 및 저장 처리
 * @param {HTMLElement} container - UI 컨테이너
 */
async function handleCannyApply(container) {
    const processedCanvas = container._processedCanvas;
    if (!processedCanvas) {
        alert('먼저 미리보기를 실행하세요.');
        return;
    }
    
    try {
        // 파일명 생성
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `canny_edge_${timestamp}.png`;
        
        // 이미지 저장
        await savePreprocessedImage(processedCanvas, filename);
        
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
        await applyProcessedImageToCanvas(imageNode, processedCanvas);
        
        console.log('Canny ControlNet applied to image:', imageNode.id());
        
        // 상태 메시지 표시
        const statusDiv = container.querySelector('#status-message');
        if (statusDiv) {
            statusDiv.textContent = `✅ 전처리 완료! 파일 저장됨: ${filename}`;
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
 * 전처리된 이미지를 캔버스의 원본 이미지 위에 덮어쓰기
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {HTMLCanvasElement} processedCanvas - 전처리된 캔버스
 */
async function applyProcessedImageToCanvas(imageNode, processedCanvas) {
    try {
        // 전처리된 캔버스를 이미지로 변환
        const processedImageSrc = processedCanvas.toDataURL();
        
        // 새 이미지 객체 생성
        const newImage = new Image();
        
        return new Promise((resolve, reject) => {
            newImage.onload = () => {
                // Konva 이미지 노드의 이미지를 교체
                imageNode.image(newImage);
                imageNode.getLayer().batchDraw();
                
                console.log('Processed image applied to canvas successfully');
                resolve();
            };
            
            newImage.onerror = () => {
                reject(new Error('Failed to load processed image'));
            };
            
            newImage.src = processedImageSrc;
        });
        
    } catch (error) {
        console.error('Failed to apply processed image to canvas:', error);
        throw error;
    }
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