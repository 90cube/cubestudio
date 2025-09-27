// components/preprocessing/preprocessorManager.js

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
import { setSelectedImage } from '../canvas/canvas.js';

/**
 * 이미지 전처리 관리자
 * 이미지별 전처리 모달을 관리합니다.
 * (ControlNet과 분리된 독립 모듈)
 */

// 활성화된 전처리 모달들
const activePreprocessingModals = new Map();

// 사용 가능한 전처리기 모델 목록
let availablePreprocessors = [];

/**
 * 전처리기 모델 목록 로드
 */
async function loadPreprocessorModels() {
    try {
        // 백엔드 API에서 사용 가능한 전처리기 목록 가져오기
        const response = await fetch('http://localhost:8080/api/preprocessors');
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
 * 이미지용 전처리 패널 열기
 * @param {Konva.Image} imageNode - 전처리할 이미지 노드
 */
export async function openPreprocessingPanel(imageNode) {
    const imageId = imageNode.id() || `image-${Date.now()}`;
    
    // 이미 해당 이미지의 모달이 열려있으면 포커스만 이동
    if (activePreprocessingModals.has(imageId)) {
        const existingModal = activePreprocessingModals.get(imageId);
        existingModal.focus();
        return existingModal;
    }
    
    // 전처리기 모델 목록 로드 (아직 로드되지 않았다면)
    if (availablePreprocessors.length === 0) {
        await loadPreprocessorModels();
    }
    
    // 모달 생성
    const modal = createPreprocessingModal(imageNode, imageId);
    
    // 모달 목록에 추가
    activePreprocessingModals.set(imageId, modal);
    
    console.log(`Preprocessing modal opened for image: ${imageId}`);
    return modal;
}

/**
 * 전처리 모달 생성
 * @param {Konva.Image} imageNode - 대상 이미지 노드
 * @param {string} imageId - 이미지 ID
 * @returns {Object} 모달 객체
 */
function createPreprocessingModal(imageNode, imageId) {
    
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
    modal.className = 'preprocessing-modal';
    modal.style.cssText = `
        background: #2a2d3a;
        border-radius: 12px;
        width: 90%;
        max-width: 1200px;
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
    title.textContent = '이미지 전처리';
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
    
    closeButton.addEventListener('click', () => {
        console.log('❌ Close button clicked, imageId:', imageId);
        closePreprocessingPanel(imageId);
    });
    closeButton.addEventListener('mouseenter', () => closeButton.style.color = '#fff');
    closeButton.addEventListener('mouseleave', () => closeButton.style.color = '#999');
    
    header.appendChild(title);
    header.appendChild(closeButton);
    
    // 모달 콘텐츠 생성
    const content = createPreprocessingUI(imageNode);
    content._imageNode = imageNode; // 이미지 노드 참조 저장
    
    modal.appendChild(header);
    modal.appendChild(content);
    backdrop.appendChild(modal);
    
    // 백드롭 클릭으로 닫기
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closePreprocessingPanel(imageId);
        }
    });
    
    // ESC 키로 닫기
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            closePreprocessingPanel(imageId);
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    document.body.appendChild(backdrop);
    
    // 모달 객체 반환
    return {
        element: backdrop,
        close: () => closePreprocessingPanel(imageId),
        focus: () => modal.focus()
    };
}

/**
 * 전처리 UI 생성 
 */
function createPreprocessingUI(imageNode) {
    const container = document.createElement('div');
    container.style.cssText = `
        padding: 30px;
        color: #e8eaed;
    `;
    
    // 탭 헤더 생성
    const tabHeader = document.createElement('div');
    tabHeader.style.cssText = `
        display: flex;
        margin-bottom: 25px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;
    
    const tabs = [
        { id: 'edge', name: 'Edge & Lines', icon: '🖋️' },
        { id: 'depth', name: 'Depth & Normals', icon: '🏔️' },
        { id: 'pose', name: 'Pose & Human', icon: '🤸' }
    ];
    
    tabs.forEach((tab, index) => {
        const tabButton = document.createElement('button');
        tabButton.textContent = `${tab.icon} ${tab.name}`;
        tabButton.style.cssText = `
            padding: 12px 24px;
            background: none;
            border: none;
            color: ${index === 0 ? '#4a9eff' : '#888'};
            border-bottom: 2px solid ${index === 0 ? '#4a9eff' : 'transparent'};
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.3s;
        `;
        
        tabButton.addEventListener('click', () => switchTab(tab.id, container, imageNode));
        tabHeader.appendChild(tabButton);
    });
    
    container.appendChild(tabHeader);
    
    // 초기 탭 콘텐츠 생성
    const contentArea = document.createElement('div');
    contentArea.className = 'tab-content';
    container.appendChild(contentArea);
    
    // 기본적으로 Edge 탭 표시
    switchTab('edge', container, imageNode);
    
    return container;
}

/**
 * 탭 전환
 */
function switchTab(tabId, container, imageNode) {
    // 탭 헤더 업데이트
    const tabButtons = container.querySelectorAll('button');
    tabButtons.forEach((button, index) => {
        const isActive = (tabId === 'edge' && index === 0) || (tabId === 'depth' && index === 1) || (tabId === 'pose' && index === 2);
        button.style.color = isActive ? '#4a9eff' : '#888';
        button.style.borderBottomColor = isActive ? '#4a9eff' : 'transparent';
    });
    
    // 콘텐츠 영역 업데이트
    const contentArea = container.querySelector('.tab-content');
    contentArea.innerHTML = '';
    
    if (tabId === 'edge') {
        contentArea.appendChild(createEdgeUI(imageNode));
    } else if (tabId === 'depth') {
        contentArea.appendChild(createDepthUI(imageNode));
    } else if (tabId === 'pose') {
        contentArea.appendChild(createPoseUI(imageNode));
    }
}

/**
 * Edge & Lines UI 생성
 */
function createEdgeUI(imageNode) {
    const edgeContainer = document.createElement('div');
    edgeContainer.dataset.category = 'edge';
    edgeContainer._imageNode = imageNode; // 이미지 노드 저장
    
    // 모델 선택 카드들
    const modelsSection = document.createElement('div');
    modelsSection.innerHTML = `
        <h3 style="color: #e8eaed; margin-bottom: 15px; font-size: 16px;">Edge Detection Models</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 25px;">
            <div class="model-card selected" data-model-id="canny_builtin" style="
                background: rgba(74, 158, 255, 0.1);
                border: 2px solid #4a9eff;
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
                transition: all 0.3s;
            ">
                <h4 style="color: #4a9eff; margin: 0 0 8px 0;">Canny (Built-in)</h4>
                <p style="color: #ccc; margin: 0; font-size: 13px;">Fast frontend processing</p>
            </div>
            <div class="model-card" data-model-id="canny_opencv" style="
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
                transition: all 0.3s;
            ">
                <h4 style="color: #e8eaed; margin: 0 0 8px 0;">Canny OpenCV</h4>
                <p style="color: #999; margin: 0; font-size: 13px;">Backend OpenCV processing</p>
            </div>
        </div>
    `;
    
    // 파라미터 컨트롤
    const parametersSection = document.createElement('div');
    parametersSection.innerHTML = `
        <h3 style="color: #e8eaed; margin-bottom: 15px; font-size: 16px;">Parameters</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
            <div>
                <label style="color: #ccc; display: block; margin-bottom: 8px;">Low Threshold: <span class="low-threshold-value">100</span></label>
                <input type="range" class="low-threshold" min="50" max="200" value="100" style="width: 100%;">
            </div>
            <div>
                <label style="color: #ccc; display: block; margin-bottom: 8px;">High Threshold: <span class="high-threshold-value">200</span></label>
                <input type="range" class="high-threshold" min="100" max="300" value="200" style="width: 100%;">
            </div>
        </div>
    `;
    
    // 미리보기 섹션
    const previewSection = document.createElement('div');
    previewSection.innerHTML = `
        <h3 style="color: #e8eaed; margin-bottom: 15px; font-size: 16px;">Preview</h3>
        <div style="display: flex; gap: 20px; margin-bottom: 25px;">
            <button class="preview-btn" style="
                background: #4a9eff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            ">Generate Preview</button>
            <button class="apply-btn" style="
                background: #28a745;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            ">Apply to Canvas</button>
        </div>
        <div class="preview-area" style="
            padding: 20px;
            min-height: 200px;
            background: rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #888;
        ">Click "Generate Preview" to see results</div>
    `;
    
    edgeContainer.appendChild(modelsSection);
    edgeContainer.appendChild(parametersSection);
    edgeContainer.appendChild(previewSection);
    
    // 이벤트 리스너 추가
    setupEdgeEventListeners(edgeContainer, imageNode);
    
    return edgeContainer;
}

/**
 * Depth & Normals UI 생성
 */
function createDepthUI(imageNode) {
    const depthContainer = document.createElement('div');
    depthContainer.dataset.category = 'depth';
    depthContainer._imageNode = imageNode; // 이미지 노드 저장
    
    // 모델 선택 카드들 - 백엔드 API에서 가져온 모델들 사용
    const depthModels = availablePreprocessors.filter(p => p.type === 'depth_estimation');
    
    const modelsSection = document.createElement('div');
    modelsSection.innerHTML = `
        <h3 style="color: #e8eaed; margin-bottom: 15px; font-size: 16px;">Depth Estimation Models</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 25px;">
            ${depthModels.map((model, index) => `
                <div class="model-card ${index === 0 ? 'selected' : ''}" data-model-id="${model.id}" style="
                    background: ${index === 0 ? 'rgba(74, 158, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
                    border: 2px solid ${index === 0 ? '#4a9eff' : 'rgba(255, 255, 255, 0.1)'};
                    border-radius: 8px;
                    padding: 15px;
                    cursor: pointer;
                    transition: all 0.3s;
                ">
                    <h4 style="color: ${index === 0 ? '#4a9eff' : '#e8eaed'}; margin: 0 0 8px 0;">${model.name}</h4>
                    <p style="color: #999; margin: 0; font-size: 13px;">${model.available ? 'Available' : 'Not available'}</p>
                </div>
            `).join('')}
        </div>
    `;
    
    // 파라미터 컨트롤 (첫 번째 모델 기준)
    const firstModel = depthModels[0];
    const params = firstModel ? firstModel.parameters : {};
    
    const parametersSection = document.createElement('div');
    parametersSection.innerHTML = `
        <h3 style="color: #e8eaed; margin-bottom: 15px; font-size: 16px;">Parameters</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
            ${params.contrast ? `
                <div>
                    <label style="color: #ccc; display: block; margin-bottom: 8px;">Contrast: <span class="contrast-value">${params.contrast.default}</span></label>
                    <input type="range" class="contrast" min="${params.contrast.min}" max="${params.contrast.max}" value="${params.contrast.default}" step="0.1" style="width: 100%;">
                </div>
            ` : ''}
            ${params.brightness ? `
                <div>
                    <label style="color: #ccc; display: block; margin-bottom: 8px;">Brightness: <span class="brightness-value">${params.brightness.default}</span></label>
                    <input type="range" class="brightness" min="${params.brightness.min}" max="${params.brightness.max}" value="${params.brightness.default}" step="0.1" style="width: 100%;">
                </div>
            ` : ''}
        </div>
    `;
    
    // 미리보기 섹션
    const previewSection = document.createElement('div');
    previewSection.innerHTML = `
        <h3 style="color: #e8eaed; margin-bottom: 15px; font-size: 16px;">Preview</h3>
        <div style="display: flex; gap: 20px; margin-bottom: 25px;">
            <button class="preview-btn" style="
                background: #4a9eff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            ">Generate Preview</button>
            <button class="apply-btn" style="
                background: #28a745;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
            ">Apply to Canvas</button>
        </div>
        <div class="preview-area" style="
            padding: 20px;
            min-height: 200px;
            background: rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #888;
        ">Click "Generate Preview" to see results</div>
    `;
    
    depthContainer.appendChild(modelsSection);
    depthContainer.appendChild(parametersSection);
    depthContainer.appendChild(previewSection);
    
    // 이벤트 리스너 추가
    setupDepthEventListeners(depthContainer, imageNode);
    
    return depthContainer;
}

/**
 * Pose & Human UI 생성
 */
function createPoseUI(imageNode) {
    const poseContainer = document.createElement('div');
    poseContainer.dataset.category = 'pose';
    poseContainer._imageNode = imageNode; // 이미지 노드 저장
    
    // 모델 선택 카드들
    const modelsSection = document.createElement('div');
    modelsSection.innerHTML = `
        <h3 style="color: #e8eaed; margin-bottom: 15px; font-size: 16px;">Pose Detection Model</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 25px;">
            <div class="model-card selected" data-model-id="dwpose_onnx" style="
                background: rgba(74, 158, 255, 0.1);
                border: 2px solid #4a9eff;
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
                transition: all 0.3s;
            ">
                <h4 style="color: #4a9eff; margin: 0 0 8px 0;">DWPose (ONNX)</h4>
                <p style="color: #ccc; margin: 0; font-size: 13px;">High-quality model (YOLOX + RTMPose)</p>
            </div>
        </div>
    `;
    
    // 매개변수 조정 영역
    const parametersSection = document.createElement('div');
    parametersSection.innerHTML = `
        <h3 style="color: #e8eaed; margin-bottom: 15px; font-size: 16px;">Parameters</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
            <div>
                <label style="display: block; color: #ccc; margin-bottom: 8px; font-size: 14px;">
                    Confidence Threshold: <span class="threshold-value">0.3</span>
                </label>
                <input type="range" class="pose-threshold" min="0.1" max="1.0" step="0.1" value="0.3" 
                       style="width: 100%; margin-bottom: 15px;">
                
                <label style="display: block; color: #ccc; margin-bottom: 8px; font-size: 14px;">
                    Line Width: <span class="line-width-value">2</span>
                </label>
                <input type="range" class="pose-line-width" min="1" max="10" step="1" value="2" 
                       style="width: 100%; margin-bottom: 15px;">
                
                <label style="display: block; color: #ccc; margin-bottom: 8px; font-size: 14px;">
                    Point Radius: <span class="point-radius-value">4</span>
                </label>
                <input type="range" class="pose-point-radius" min="1" max="10" step="1" value="4" 
                       style="width: 100%;">
            </div>
            <div>
                <label style="display: block; color: #ccc; margin-bottom: 12px; font-size: 14px;">Detection Options</label>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; color: #ccc; cursor: pointer;">
                        <input type="checkbox" class="detect-body" checked style="margin-right: 8px;">
                        Detect Body
                    </label>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: flex; align-items: center; color: #ccc; cursor: pointer;">
                        <input type="checkbox" class="detect-hand" style="margin-right: 8px;">
                        Detect Hands
                    </label>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; color: #ccc; cursor: pointer;">
                        <input type="checkbox" class="detect-face" style="margin-right: 8px;">
                        Detect Face
                    </label>
                </div>
                
                <label style="display: block; color: #ccc; margin-bottom: 8px; font-size: 14px;">Output Format</label>
                <select class="output-format" style="width: 100%; padding: 8px; background: #3a3d4a; border: 1px solid #555; border-radius: 4px; color: #e8eaed;">
                    <option value="image">Skeleton Image</option>
                    <option value="json">JSON Data (for editing)</option>
                    <option value="both">Both</option>
                </select>
            </div>
        </div>
    `;
    
    // 액션 버튼들
    const buttonsSection = document.createElement('div');
    buttonsSection.innerHTML = `
        <div style="display: flex; gap: 15px; justify-content: flex-end; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
            <button class="btn-process" style="
                padding: 12px 24px;
                background: linear-gradient(135deg, #4a9eff, #0f7b0f);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.3s;
            ">🚀 Process Image</button>
            <button class="btn-save" style="
                padding: 12px 24px;
                background: linear-gradient(135deg, #28a745, #20c997);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
                transition: all 0.3s;
            " disabled>💾 Save Result</button>
        </div>
    `;
    
    poseContainer.appendChild(modelsSection);
    poseContainer.appendChild(parametersSection);
    poseContainer.appendChild(buttonsSection);
    
    // 결과 미리보기 영역 추가
    const previewSection = document.createElement('div');
    previewSection.className = 'pose-preview-section';
    previewSection.style.cssText = `
        margin-top: 25px;
        padding-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        display: none;
    `;
    poseContainer.appendChild(previewSection);
    
    // 이벤트 리스너 추가
    setupPoseEventListeners(poseContainer, imageNode);
    
    return poseContainer;
}

// Pose 탭 이벤트 리스너 설정
function setupPoseEventListeners(poseContainer, imageNode) {
    let selectedProcessor = 'dwpose_onnx';
    
    // 모델 카드 선택 이벤트
    const modelCards = poseContainer.querySelectorAll('.model-card');
    modelCards.forEach(card => {
        card.addEventListener('click', () => {
            // 기존 선택 해제
            modelCards.forEach(c => {
                c.classList.remove('selected');
                c.style.background = 'rgba(255, 255, 255, 0.05)';
                c.style.border = '2px solid rgba(255, 255, 255, 0.1)';
            });
            // 새 선택 표시
            card.classList.add('selected');
            card.style.background = 'rgba(74, 158, 255, 0.1)';
            card.style.border = '2px solid #4a9eff';
            selectedProcessor = card.dataset.modelId;
            
            console.log(`[POSE] Selected processor: ${selectedProcessor}`);
        });
    });
    
    // 파라미터 슬라이더 업데이트
    const confidenceSlider = poseContainer.querySelector('.pose-threshold');
    const confidenceValue = poseContainer.querySelector('.threshold-value');
    if (confidenceSlider) {
        confidenceSlider.addEventListener('input', (e) => {
            confidenceValue.textContent = e.target.value;
        });
    }
    
    const lineWidthSlider = poseContainer.querySelector('.pose-line-width');
    const lineWidthValue = poseContainer.querySelector('.line-width-value');
    if (lineWidthSlider) {
        lineWidthSlider.addEventListener('input', (e) => {
            lineWidthValue.textContent = e.target.value;
        });
    }
    
    const pointRadiusSlider = poseContainer.querySelector('.pose-point-radius');
    const pointRadiusValue = poseContainer.querySelector('.point-radius-value');
    if (pointRadiusSlider) {
        pointRadiusSlider.addEventListener('input', (e) => {
            pointRadiusValue.textContent = e.target.value;
        });
    }
    
    // Process 버튼 이벤트
    const processButton = poseContainer.querySelector('.btn-process');
    if (processButton) {
        processButton.addEventListener('click', async () => {
            await processPoseImage(poseContainer, imageNode, selectedProcessor);
        });
    }
    
    // Save 버튼 이벤트
    const saveButton = poseContainer.querySelector('.btn-save');
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            savePoseResult(poseContainer, imageNode);
        });
    }
}

// Pose 이미지 처리 함수
async function processPoseImage(poseContainer, imageNode, processor) {
    const processButton = poseContainer.querySelector('.btn-process');
    const previewSection = poseContainer.querySelector('.pose-preview-section');
    
    try {
        processButton.disabled = true;
        processButton.innerHTML = '🔄 Processing...';
        
        // 파라미터 수집
        const confidence = poseContainer.querySelector('.pose-threshold')?.value || '0.3';
        const lineWidth = poseContainer.querySelector('.pose-line-width')?.value || '2';
        const pointRadius = poseContainer.querySelector('.pose-point-radius')?.value || '4';
        const detectBody = poseContainer.querySelector('.detect-body')?.checked || true;
        const detectHand = poseContainer.querySelector('.detect-hand')?.checked || false;
        const detectFace = poseContainer.querySelector('.detect-face')?.checked || false;
        const outputFormat = poseContainer.querySelector('.output-format')?.value || 'image';
        
        const parameters = {
            confidence_threshold: parseFloat(confidence),
            line_width: parseInt(lineWidth),
            point_radius: parseInt(pointRadius),
            detect_body: detectBody,
            detect_hands: detectHand,
            detect_face: detectFace,
            output_format: outputFormat
        };
        
        console.log(`[POSE] Processing with ${processor}`, parameters);
        
        // 이미지를 base64로 변환
        const canvas = imageNode.toCanvas();
        const imageBase64 = canvas.toDataURL().split(',')[1];
        
        // 백엔드 API 호출
        let result;
        if (outputFormat === 'json') {
            // JSON 추출 API 호출
            const response = await fetch('http://127.0.0.1:8080/api/pose/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    processor: processor,
                    image: imageBase64,
                    parameters: parameters
                })
            });
            result = await response.json();
        } else {
            // 일반 이미지 처리 API 호출
            const response = await fetch('http://127.0.0.1:8080/api/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    processor: processor,
                    image: `data:image/png;base64,${imageBase64}`,
                    parameters: parameters
                })
            });
            result = await response.json();
        }
        
        if (result.success) {
            displayPoseResult(poseContainer, result, outputFormat);
            console.log(`[POSE] Processing completed successfully`);
            // Show preview section and enable save
            previewSection.style.display = 'block';
            const saveBtn = poseContainer.querySelector('.btn-save');
            if (saveBtn) saveBtn.disabled = false;
        } else {
            throw new Error(result.error || 'Processing failed');
        }
        
    } catch (error) {
        console.error('[POSE] Processing error:', error);
        previewSection.style.display = 'block';
        previewSection.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #ff6b6b;">
                ❌ Processing failed: ${error.message}
            </div>
        `;
    } finally {
        processButton.disabled = false;
        processButton.innerHTML = '🚀 Process Image';
    }
}

// Pose 결과 표시 함수
function displayPoseResult(poseContainer, result, outputFormat) {
    const previewSection = poseContainer.querySelector('.pose-preview-section');
    previewSection.style.display = 'block';
    
    if (outputFormat === 'json' && result.pose_data) {
        // JSON 데이터 표시
        previewSection.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h4 style="color: #e8eaed; margin: 0 0 10px 0;">📊 Pose Data (JSON)</h4>
                <div style="background: #2a2d3a; border: 1px solid #444; border-radius: 4px; padding: 15px; max-height: 300px; overflow-y: auto;">
                    <pre style="color: #a8dadc; font-family: monospace; font-size: 12px; margin: 0;">${JSON.stringify(result.pose_data, null, 2)}</pre>
                </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="btn-edit-pose" style="
                    padding: 8px 16px;
                    background: #4a9eff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">✏️ Edit Pose</button>
                <button class="btn-render-skeleton" style="
                    padding: 8px 16px;
                    background: #0f7b0f;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">🎨 Render Skeleton</button>
            </div>
        `;
        
        // JSON 편집 버튼 이벤트
        const editButton = previewSection.querySelector('.btn-edit-pose');
        editButton.addEventListener('click', () => {
            openPoseEditor(result.pose_data);
        });
        
        // 스켈레톤 렌더링 버튼 이벤트
        const renderButton = previewSection.querySelector('.btn-render-skeleton');
        renderButton.addEventListener('click', () => {
            renderSkeletonFromJSON(poseContainer, result.pose_data);
        });
        
    } else if (result.processed_image) {
        // 이미지 결과 표시
        previewSection.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h4 style="color: #e8eaed; margin: 0 0 10px 0;">🎨 Processed Result</h4>
                <div style="text-align: center; background: #2a2d3a; border: 1px solid #444; border-radius: 4px; padding: 15px;">
                    <img src="${result.processed_image}" style="max-width: 100%; max-height: 300px; border-radius: 4px;" alt="Pose Result">
                </div>
                <div style="text-align: center; margin-top: 10px; color: #999; font-size: 12px;">
                    Processing time: ${result.processing_time}s
                </div>
            </div>
        `;
    }
}

// Pose 편집기 열기 (향후 구현)
function openPoseEditor(poseData) {
    console.log('[POSE] Opening pose editor with data:', poseData);
    // TODO: Konva.js 기반 포즈 편집기 구현
    alert('Pose editor will be implemented in the next phase.\n\nThis will allow you to:\n• Drag and adjust pose keypoints\n• Add/remove joints\n• Edit connections\n• Preview changes in real-time');
}

// JSON에서 스켈레톤 렌더링
async function renderSkeletonFromJSON(poseContainer, poseData) {
    try {
        console.log('[POSE] Rendering skeleton from JSON:', poseData);
        
        // 스켈레톤 렌더링 API 호출
        const response = await fetch('http://127.0.0.1:8080/api/pose/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pose_data: poseData,
                image_width: 512,
                image_height: 512,
                parameters: {
                    skeleton_color: 'white',
                    point_color: 'red',
                    background_color: 'black',
                    line_width: 2,
                    point_radius: 4
                }
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 렌더링된 스켈레톤 이미지 표시
            const previewSection = poseContainer.querySelector('.pose-preview-section');
            previewSection.innerHTML += `
                <div style="margin-top: 15px;">
                    <h4 style="color: #e8eaed; margin: 0 0 10px 0;">🦴 Rendered Skeleton</h4>
                    <div style="text-align: center; background: #2a2d3a; border: 1px solid #444; border-radius: 4px; padding: 15px;">
                        <img src="data:image/png;base64,${result.skeleton_image}" style="max-width: 100%; max-height: 300px; border-radius: 4px;" alt="Skeleton Result">
                    </div>
                </div>
            `;
        } else {
            throw new Error(result.error || 'Skeleton rendering failed');
        }
        
    } catch (error) {
        console.error('[POSE] Skeleton rendering error:', error);
        alert(`Skeleton rendering failed: ${error.message}`);
    }
}

// Pose 결과 저장 함수
function savePoseResult(poseContainer, imageNode) {
    console.log('[POSE] Saving pose result');
    // TODO: 결과를 캔버스에 추가하거나 다운로드 기능 구현
    alert('Save functionality will be implemented to:\n• Add result to canvas as new layer\n• Download processed image\n• Export JSON data\n• Save to project');
}

/**
 * Edge UI 이벤트 리스너 설정
 */
function setupEdgeEventListeners(container, imageNode) {
    // 모델 카드 선택
    const modelCards = container.querySelectorAll('.model-card');
    modelCards.forEach(card => {
        card.addEventListener('click', () => {
            // 모든 카드 선택 해제
            modelCards.forEach(c => {
                c.classList.remove('selected');
                c.style.background = 'rgba(255, 255, 255, 0.05)';
                c.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                c.querySelector('h4').style.color = '#e8eaed';
            });
            
            // 선택된 카드 스타일 적용
            card.classList.add('selected');
            card.style.background = 'rgba(74, 158, 255, 0.1)';
            card.style.borderColor = '#4a9eff';
            card.querySelector('h4').style.color = '#4a9eff';
        });
    });
    
    // 파라미터 슬라이더
    const lowThresholdSlider = container.querySelector('.low-threshold');
    const highThresholdSlider = container.querySelector('.high-threshold');
    const lowThresholdValue = container.querySelector('.low-threshold-value');
    const highThresholdValue = container.querySelector('.high-threshold-value');
    
    if (lowThresholdSlider) {
        lowThresholdSlider.addEventListener('input', (e) => {
            lowThresholdValue.textContent = e.target.value;
        });
    }
    
    if (highThresholdSlider) {
        highThresholdSlider.addEventListener('input', (e) => {
            highThresholdValue.textContent = e.target.value;
        });
    }
    
    // 미리보기 버튼
    const previewBtn = container.querySelector('.preview-btn');
    const previewDiv = container.querySelector('.preview-area');
    
    if (previewBtn) {
        previewBtn.addEventListener('click', async () => {
            console.log('🖋️ Edge preview clicked');
            await handleEdgePreview(container, previewDiv);
        });
    }
    
    // 적용 버튼
    const applyBtn = container.querySelector('.apply-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
            console.log('🖋️ Edge apply clicked');
            await handleEdgeApply(container);
        });
    }
}

/**
 * Depth UI 이벤트 리스너 설정
 */
function setupDepthEventListeners(container, imageNode) {
    // 모델 카드 선택
    const modelCards = container.querySelectorAll('.model-card');
    modelCards.forEach(card => {
        card.addEventListener('click', () => {
            console.log('🎲 Depth model card clicked:', card.dataset.modelId);
            
            // 모든 카드 선택 해제
            modelCards.forEach(c => {
                c.classList.remove('selected');
                c.style.background = 'rgba(255, 255, 255, 0.05)';
                c.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                c.querySelector('h4').style.color = '#e8eaed';
            });
            
            // 선택된 카드 스타일 적용
            card.classList.add('selected');
            card.style.background = 'rgba(74, 158, 255, 0.1)';
            card.style.borderColor = '#4a9eff';
            card.querySelector('h4').style.color = '#4a9eff';
            
            console.log('✅ Depth model card selected:', card.dataset.modelId);
        });
    });
    
    // 파라미터 슬라이더
    const contrastSlider = container.querySelector('.contrast');
    const brightnessSlider = container.querySelector('.brightness');
    const contrastValue = container.querySelector('.contrast-value');
    const brightnessValue = container.querySelector('.brightness-value');
    
    if (contrastSlider) {
        contrastSlider.addEventListener('input', (e) => {
            contrastValue.textContent = e.target.value;
        });
    }
    
    if (brightnessSlider) {
        brightnessSlider.addEventListener('input', (e) => {
            brightnessValue.textContent = e.target.value;
        });
    }
    
    // 미리보기 버튼
    const previewBtn = container.querySelector('.preview-btn');
    const previewDiv = container.querySelector('.preview-area');
    
    if (previewBtn) {
        previewBtn.addEventListener('click', async () => {
            console.log('🏔️ Depth preview clicked');
            await handleDepthPreview(container, previewDiv);
        });
    }
    
    // 적용 버튼  
    const applyBtn = container.querySelector('.apply-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
            console.log('🏔️ Depth apply clicked');
            await handleDepthApply(container);
        });
    }
}

// ========== 핵심 처리 함수들 (원본 controlNetManager.js에서 가져온 실제 구현) ==========

/**
 * Edge 미리보기 처리 (원본 handleEdgePreview 함수)
 */
async function handleEdgePreview(container, previewDiv) {
    const imageNode = container._imageNode;
    if (!imageNode) return;
    
    // 선택된 모델 확인 - 카드 기반 UI에서 선택된 모델 가져오기
    const edgeSection = container.querySelector('[data-category="edge"]');
    const selectedCard = edgeSection ? edgeSection.querySelector('.model-card.selected') : null;
    const selectedModelId = selectedCard ? selectedCard.dataset.modelId : 'canny_builtin';
    
    // 로딩 상태 표시
    previewDiv.innerHTML = `<div style="color: #ccc; text-align: center; padding: 20px;">처리 중... (${selectedModelId === 'canny_builtin' ? 'Canny 프론트엔드' : 'Canny OpenCV'})</div>`;
    
    try {
        let processedCanvas;
        
        // 파라미터 가져오기
        const params = getEdgeParameters(container);
        
        if (selectedModelId === 'canny_builtin') {
            // 프론트엔드에서 직접 처리 (processCannyEdge 사용)
            const htmlImage = await konvaImageToHTMLImage(imageNode);
            processedCanvas = processCannyEdge(htmlImage, params);
        } else if (selectedModelId === 'canny_opencv') {
            // OpenCV 백엔드 API 호출
            processedCanvas = await processEdgeWithOpenCV(imageNode, params);
        } else {
            // 기본값: 프론트엔드 처리
            const htmlImage = await konvaImageToHTMLImage(imageNode);
            processedCanvas = processCannyEdge(htmlImage, params);
        }
        
        // 미리보기 영역에 결과 표시
        processedCanvas.style.cssText = `
            max-width: 100%;
            max-height: 200px;
            border-radius: 4px;
            image-rendering: crisp-edges;
        `;
        
        previewDiv.innerHTML = '';
        previewDiv.appendChild(processedCanvas);
        
        // 처리된 캔버스를 컨테이너에 저장 (적용 시 사용)
        container._processedCanvas = processedCanvas;
        
        // 마지막 처리 파라미터 저장 (Edge)
        container._lastProcessingParams = {
            type: 'edge_detection',
            model: selectedModelId,
            params: params,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Edge preview failed:', error);
        previewDiv.innerHTML = '<div style="color: #e74c3c;">처리 중 오류 발생</div>';
    }
}

/**
 * Depth 미리보기 처리 (원본 handleDepthPreview 함수)
 */
async function handleDepthPreview(container, previewDiv) {
    console.log('🔍 handleDepthPreview called', { container, previewDiv });
    const imageNode = container._imageNode;
    console.log('🖼️ imageNode:', imageNode);
    if (!imageNode) {
        console.error('❌ No imageNode found in container');
        return;
    }
    
    // 선택된 모델 확인 - 현재 활성화된 Depth 탭에서 선택된 카드 찾기
    const depthSection = container.querySelector('[data-category="depth"]');
    let selectedCard = null;
    let selectedModelId = 'midas_v21';
    
    if (depthSection) {
        selectedCard = depthSection.querySelector('.model-card.selected');
        selectedModelId = selectedCard ? selectedCard.dataset.modelId : 'midas_v21';
    } else {
        // 폴백: 전체 컨테이너에서 현재 visible한 depth 카드들 중 선택된 것 찾기
        const allCards = container.querySelectorAll('.model-card.selected');
        const depthModelsIds = availablePreprocessors
            .filter(p => p.type === 'depth_estimation')
            .map(p => p.id);
        
        selectedCard = Array.from(allCards).find(card => 
            depthModelsIds.includes(card.dataset.modelId)
        );
        selectedModelId = selectedCard ? selectedCard.dataset.modelId : 'midas_v21';
    }
    
    console.log('🔍 Depth section:', depthSection);
    console.log('🎯 Selected card:', selectedCard);
    console.log('🆔 Selected model ID:', selectedModelId);
    console.log('📋 Available cards in depth section:', depthSection ? depthSection.querySelectorAll('.model-card') : 'No depth section found');
    
    // 백엔드 API에서 가져온 depth estimation 모델들 사용
    const depthModels = availablePreprocessors
        .filter(processor => processor.type === 'depth_estimation')
        .map(processor => ({
            id: processor.id,
            name: processor.name,
            type: 'external_model',  // 백엔드 모델이므로 외부 모델로 처리
            available: processor.available
        }));
    
    console.log('🔧 Available depth models:', depthModels);
    
    const selectedModel = depthModels.find(m => m.id === selectedModelId);
    console.log('🎯 Found selected model:', selectedModel);
    
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
            processedCanvas = await processDepthWithExternalModel(imageNode, selectedModel, {});
        }
        
        // 파라미터 가져와서 CSS 필터 적용
        const params = getDepthParameters(container);
        
        // 미리보기 영역에 결과 표시 + CSS 필터로 contrast/brightness 조정
        processedCanvas.style.cssText = `
            max-width: 100%;
            max-height: 200px;
            border-radius: 4px;
            image-rendering: crisp-edges;
            filter: contrast(${params.contrast || 1.2}) brightness(${1 + (params.brightness || 0.1)});
        `;
        
        previewDiv.innerHTML = '';
        previewDiv.appendChild(processedCanvas);
        
        // 처리된 캔버스를 컨테이너에 저장 (적용 시 사용)
        container._processedCanvas = processedCanvas;
        
        // 마지막 처리 파라미터 저장 (Depth)
        container._lastProcessingParams = {
            type: 'depth_estimation',
            model: selectedModelId,
            params: params,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Depth preview failed:', error);
        previewDiv.innerHTML = '<div style="color: #e74c3c;">처리 중 오류 발생</div>';
    }
}

/**
 * Edge 매개변수 가져오기
 */
function getEdgeParameters(container) {
    const lowThreshold = container.querySelector('.low-threshold')?.value || 100;
    const highThreshold = container.querySelector('.high-threshold')?.value || 200;
    
    return {
        low_threshold: parseInt(lowThreshold),
        high_threshold: parseInt(highThreshold),
        blur_kernel: 3
    };
}

/**
 * Depth 매개변수 가져오기
 */
function getDepthParameters(container) {
    const contrast = container.querySelector('.contrast')?.value || 1.2;
    const brightness = container.querySelector('.brightness')?.value || 0.1;
    
    return {
        contrast: parseFloat(contrast),
        brightness: parseFloat(brightness)
    };
}

/**
 * OpenCV로 Edge 처리 (백엔드 API 호출)
 */
async function processEdgeWithOpenCV(imageNode, params) {
    const imageDataUrl = await konvaImageToDataUrl(imageNode);
    const base64Data = imageDataUrl.split(',')[1];
    
    const response = await fetch('http://localhost:8080/api/v3/process', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image: base64Data,
            processor: 'canny_opencv',
            parameters: params
        })
    });
    
    if (response.ok) {
        const result = await response.json();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        return new Promise((resolve) => {
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.src = result.processed_image;
        });
    } else {
        throw new Error('OpenCV processing failed');
    }
}

/**
 * 외부 Depth 모델로 처리 (백엔드 API 호출)
 */
async function processDepthWithExternalModel(imageNode, model, params) {
    console.log('🚀 processDepthWithExternalModel called', { imageNode, model, params });
    
    try {
        const imageDataUrl = await konvaImageToDataUrl(imageNode);
        console.log('📸 imageDataUrl length:', imageDataUrl.length);
        const base64Data = imageDataUrl.split(',')[1];
        console.log('📦 base64Data length:', base64Data.length);
        
        const requestData = {
            image_base64: base64Data,
            model_id: model.id,
            params: params
        };
        console.log('📤 Request data:', { model_id: model.id, params, base64_length: base64Data.length });
        
        console.log('🌐 Sending request to:', 'http://localhost:8080/api/v3/process');
        const response = await fetch('http://localhost:8080/api/v3/process', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image: base64Data,
            processor: model.id,
            parameters: params
        })
    });
    
    console.log('📡 Response status:', response.status, response.statusText);
    
    if (response.ok) {
        console.log('✅ Response OK, parsing JSON...');
        const result = await response.json();
        console.log('📋 Response result:', { hasProcessedImage: !!result.processed_image });
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                console.log('🖼️ Image loaded successfully:', img.width, 'x', img.height);
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = (error) => {
                console.error('❌ Image load error:', error);
                reject(error);
            };
            img.src = result.processed_image;
        });
    } else {
        console.error('❌ Response failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('❌ Error details:', errorText);
        throw new Error(`${model.name} processing failed: ${response.status} ${errorText}`);
    }
    } catch (error) {
        console.error('💥 processDepthWithExternalModel error:', error);
        throw error;
    }
}

/**
 * Konva 이미지를 DataURL로 변환
 */
async function konvaImageToDataUrl(imageNode) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const image = imageNode.image();
    
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    
    return canvas.toDataURL();
}

/**
 * Edge 적용
 */
async function handleEdgeApply(container) {
    console.log('🔧 Edge apply - implementing canvas application');
    
    // 처리된 캔버스 또는 미리보기 영역에서 결과 찾기
    const processedCanvas = container._processedCanvas;
    const previewArea = container.querySelector('.preview-area');
    let processedImageSrc = null;
    
    if (processedCanvas) {
        console.log('📋 Using stored processed canvas');
        processedImageSrc = processedCanvas.toDataURL();
    } else if (previewArea) {
        // 미리보기 영역에서 캔버스 찾기
        const canvasElement = previewArea.querySelector('canvas');
        if (canvasElement) {
            console.log('🎨 Found canvas in preview area');
            processedImageSrc = canvasElement.toDataURL();
        }
    }
    
    if (!processedImageSrc) {
        console.error('❌ No preview result to apply');
        alert('미리보기 결과가 없습니다. 먼저 미리보기를 실행해주세요.');
        return;
    }

    try {
        console.log('🚀 Applying edge processing to canvas');
        // 캔버스에 적용
        await applyPreprocessedImageToCanvas(container, processedImageSrc);
        console.log('✅ Edge preprocessing applied to canvas');
        
        // 모달 닫기
        const imageId = container._imageId;
        if (imageId) {
            closePreprocessingPanel(imageId);
        }
        
    } catch (error) {
        console.error('❌ Failed to apply edge preprocessing:', error);
        alert('Edge 전처리 적용에 실패했습니다.');
    }
}

/**
 * Depth 적용
 */
async function handleDepthApply(container) {
    console.log('🔧 Depth apply - implementing canvas application');
    
    // 처리된 캔버스 또는 미리보기 영역에서 결과 찾기
    const processedCanvas = container._processedCanvas;
    const previewArea = container.querySelector('.preview-area');
    let processedImageSrc = null;
    
    if (processedCanvas) {
        console.log('📋 Using stored processed canvas');
        processedImageSrc = processedCanvas.toDataURL();
    } else if (previewArea) {
        // 미리보기 영역에서 캔버스 찾기
        const canvasElement = previewArea.querySelector('canvas');
        if (canvasElement) {
            console.log('🎨 Found canvas in preview area');
            processedImageSrc = canvasElement.toDataURL();
        }
    }
    
    if (!processedImageSrc) {
        console.error('❌ No preview result to apply');
        alert('미리보기 결과가 없습니다. 먼저 미리보기를 실행해주세요.');
        return;
    }

    try {
        console.log('🚀 Applying depth processing to canvas');
        // 캔버스에 적용
        await applyPreprocessedImageToCanvas(container, processedImageSrc);
        console.log('✅ Depth preprocessing applied to canvas');
        
        // 모달 닫기
        const imageId = container._imageId;
        if (imageId) {
            closePreprocessingPanel(imageId);
        }
        
    } catch (error) {
        console.error('❌ Failed to apply depth preprocessing:', error);
        alert('Depth 전처리 적용에 실패했습니다.');
    }
}

/**
 * 전처리 패널 닫기
 */
export function closePreprocessingPanel(imageId) {
    console.log('🚪 closePreprocessingPanel called with imageId:', imageId);
    console.log('🗂️ activePreprocessingModals size:', activePreprocessingModals.size);
    console.log('🗂️ activePreprocessingModals keys:', Array.from(activePreprocessingModals.keys()));
    
    if (activePreprocessingModals.has(imageId)) {
        console.log('✅ Found modal for imageId:', imageId);
        const modal = activePreprocessingModals.get(imageId);
        console.log('📋 Modal object:', modal);
        
        if (modal && modal.element && modal.element.remove) {
            console.log('🗑️ Removing modal element...');
            modal.element.remove();
        } else {
            console.warn('⚠️ Modal element not found or no remove method');
        }
        activePreprocessingModals.delete(imageId);
        console.log(`✅ Preprocessing panel ${imageId} closed`);
    }
}

/**
 * 모든 전처리 패널 닫기
 */
export function closeAllPreprocessingPanels() {
    for (const [imageId, modal] of activePreprocessingModals.entries()) {
        if (modal && modal.element && modal.element.remove) {
            modal.element.remove();
        }
    }
    activePreprocessingModals.clear();
    console.log('All preprocessing panels closed');
}

/**
 * 전처리된 이미지를 캔버스에 적용 (원본 옆에 새로 추가)
 * @param {HTMLElement} container - 전처리 패널 컨테이너
 * @param {string} processedImageSrc - 전처리된 이미지의 데이터 URL
 */
async function applyPreprocessedImageToCanvas(container, processedImageSrc) {
    console.log('🎨 Applying preprocessed image to canvas (as new layer)');
    
    // 원본 이미지 노드 가져오기
    const imageNode = container._imageNode;
    if (!imageNode) {
        throw new Error('Original image node not found');
    }
    
    console.log('📷 Original image node:', imageNode);
    
    // 새 이미지 객체 생성
    const newImage = new Image();
    
    return new Promise((resolve, reject) => {
        newImage.onload = () => {
            try {
                console.log('✅ New processed image loaded');
                
                // 원본 이미지 노드의 위치와 크기 정보 가져오기
                const originalX = imageNode.x();
                const originalY = imageNode.y();
                const originalWidth = imageNode.width();
                const originalHeight = imageNode.height();
                const originalScaleX = imageNode.scaleX();
                const originalScaleY = imageNode.scaleY();
                const originalRotation = imageNode.rotation();
                
                console.log(`📍 Original position: (${originalX}, ${originalY}), size: ${originalWidth}x${originalHeight}`);
                
                // 전처리된 이미지 타입으로 설정
                const imageType = 'preproc';
                
                // 새로운 전처리된 이미지 노드 생성
                const processedImageNode = new Konva.Image({
                    image: newImage,
                    x: originalX, // 원본과 동일한 위치에 배치
                    y: originalY,
                    scaleX: originalScaleX,
                    scaleY: originalScaleY,
                    rotation: originalRotation,
                    draggable: true, // 드래그 가능
                    name: 'preprocessed-image', // 식별용 이름
                    // 커스텀 속성들
                    imageType: imageType, // 이미지 타입
                    processingSource: 'preprocessing', // 처리 소스
                    originalImageId: imageNode.id() || imageNode._id, // 원본 이미지 ID
                    createdAt: new Date().toISOString(), // 생성 시간
                    processingParams: container._lastProcessingParams || {} // 마지막 사용된 파라미터
                });
                
                console.log(`📋 Image type set to: ${imageType}`);
                
                // 새 이미지의 중심점을 원본과 동일하게 설정
                processedImageNode.offsetX(newImage.width / 2);
                processedImageNode.offsetY(newImage.height / 2);
                
                // 레이어에 새 이미지 추가
                const layer = imageNode.getLayer();
                if (layer) {
                    layer.add(processedImageNode);
                    layer.batchDraw();
                    console.log(`🎨 New preprocessed image added at (${processedImageNode.x()}, ${processedImageNode.y()})`);
                    
                    // 새로 추가된 이미지를 선택 상태로 만들기
                    // 캔버스의 선택 시스템과 연동
                    setSelectedImage(processedImageNode);
                    
                    // 불투명도 슬라이더는 imageEditor.js에서 이미지 타입 감지로 자동 표시됩니다
                    
                } else {
                    console.warn('⚠️  Layer not found for image node');
                }
                
                resolve(processedImageNode);
                
            } catch (error) {
                console.error('❌ Error applying image to canvas:', error);
                reject(error);
            }
        };
        
        newImage.onerror = (error) => {
            console.error('❌ Failed to load processed image:', error);
            reject(new Error('Failed to load processed image'));
        };
        
        // 이미지 로딩 시작
        newImage.src = processedImageSrc;
    });
}

/**
 * 이미지 노드의 타입 정보 가져오기
 * @param {Konva.Image} imageNode - Konva 이미지 노드
 * @returns {Object} 이미지 타입 정보
 */
export function getImageTypeInfo(imageNode) {
    if (!imageNode) return null;
    
    return {
        imageType: imageNode.getAttr('imageType') || 'normal', // 'normal' 또는 'preproc'
        processingSource: imageNode.getAttr('processingSource') || 'user',
        originalImageId: imageNode.getAttr('originalImageId') || null,
        createdAt: imageNode.getAttr('createdAt') || null,
        processingParams: imageNode.getAttr('processingParams') || {}
    };
}

/**
 * 캔버스에서 특정 타입의 이미지들 찾기
 * @param {string} imageType - 찾을 이미지 타입 ('normal', 'preproc')
 * @returns {Promise<Array>} 해당 타입의 이미지 노드들
 */
export async function findImagesByType(imageType) {
    // 캔버스 레이어에서 모든 이미지 노드 가져오기
    const { getLayer } = await import('../canvas/canvas.js');
    const layer = getLayer();
    
    if (!layer) return [];
    
    const imageNodes = layer.find('Image');
    return imageNodes.filter(node => node.getAttr('imageType') === imageType);
}

/**
 * 원본 이미지에서 파생된 전처리 이미지들 찾기
 * @param {Konva.Image} originalImageNode - 원본 이미지 노드
 * @returns {Array} 파생된 전처리 이미지 노드들
 */
export function findDerivedImages(originalImageNode) {
    if (!originalImageNode) return [];
    
    const originalId = originalImageNode.id() || originalImageNode._id;
    const layer = originalImageNode.getLayer();
    
    if (!layer || !originalId) return [];
    
    const allImages = layer.find('Image');
    return allImages.filter(node => 
        node.getAttr('originalImageId') === originalId && 
        node !== originalImageNode
    );
}
