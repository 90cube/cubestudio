// frontend/components/poseEditor/poseEditor.js

import { createPoseCanvas } from './poseCanvas.js';

/**
 * DW Pose 에디터 메인 모달
 * 전처리기 모달 위에 표시되는 포즈 편집 전용 모달
 */

let activePoseEditor = null;

/**
 * 포즈 에디터 열기
 * @param {Object} poseData - DW Pose JSON 데이터
 * @param {Object} options - 에디터 설정 옵션
 * @returns {Object} 포즈 에디터 인스턴스
 */
export function openPoseEditor(poseData, options = {}) {
    console.log('🎭 Opening pose editor with data:', poseData);
    
    // 기존 에디터가 열려있으면 닫기
    if (activePoseEditor) {
        closePoseEditor();
    }
    
    // 에디터 모달 생성
    const editorModal = createPoseEditorModal(poseData, options);
    
    // 전역 참조 저장
    activePoseEditor = editorModal;
    
    console.log('✅ Pose editor opened successfully');
    return editorModal;
}

/**
 * 포즈 에디터 닫기
 */
export function closePoseEditor() {
    if (activePoseEditor) {
        if (activePoseEditor.destroy) {
            activePoseEditor.destroy();
        }
        activePoseEditor = null;
        console.log('🚪 Pose editor closed');
    }
}

/**
 * 포즈 에디터 모달 생성
 */
function createPoseEditorModal(poseData, options) {
    console.log('🏗️ Creating pose editor modal');
    
    // 모달 백드롭 생성 (전처리 모달보다 높은 z-index)
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 3000;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.3s ease-out;
    `;
    
    // 모달 컨테이너 생성
    const modal = document.createElement('div');
    modal.className = 'pose-editor-modal';
    modal.style.cssText = `
        background: #1a1d2e;
        border-radius: 16px;
        width: 95%;
        max-width: 1400px;
        height: 90vh;
        max-height: 900px;
        border: 2px solid #4a9eff;
        box-shadow: 0 25px 80px rgba(74, 158, 255, 0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.4s ease-out;
    `;
    
    // 모달 헤더
    const header = createEditorHeader(poseData);
    
    // 메인 컨텐츠 영역 (캔버스 + 컨트롤)
    const content = createEditorContent(poseData, options);
    
    // 하단 액션 버튼들
    const footer = createEditorFooter();
    
    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    
    // CSS 애니메이션 추가
    addEditorStyles();
    
    // 이벤트 리스너 설정
    setupEditorEvents(backdrop, modal, content);
    
    // DOM에 추가
    document.body.appendChild(backdrop);
    
    // 모달 객체 반환
    return {
        element: backdrop,
        modal: modal,
        content: content,
        
        // 공개 메서드들
        getPoseData: () => content._poseCanvas ? content._poseCanvas.getPoseData() : null,
        updatePose: (newData) => content._poseCanvas ? content._poseCanvas.updatePose(newData) : null,
        resetPose: () => content._poseCanvas ? content._poseCanvas.resetPose() : null,
        destroy: () => {
            if (content._poseCanvas) {
                content._poseCanvas.destroy();
            }
            backdrop.remove();
            activePoseEditor = null;
        }
    };
}

/**
 * 에디터 헤더 생성
 */
function createEditorHeader(poseData) {
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 30px;
        background: linear-gradient(135deg, #4a9eff, #0f7b0f);
        color: white;
        border-radius: 16px 16px 0 0;
    `;
    
    // 제목 영역
    const titleSection = document.createElement('div');
    titleSection.innerHTML = `
        <h2 style="margin: 0; font-size: 20px; font-weight: 600; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">🎭</span>
            DW Pose Editor
        </h2>
        <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">
            드래그하여 포즈를 수정하세요 • 키포인트: ${countValidKeypoints(poseData)}개 감지됨
        </p>
    `;
    
    // 도구 버튼들
    const toolsSection = document.createElement('div');
    toolsSection.style.cssText = `
        display: flex;
        gap: 15px;
        align-items: center;
    `;
    
    // 확대/축소 버튼들
    const zoomControls = document.createElement('div');
    zoomControls.style.cssText = `
        display: flex;
        gap: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 8px;
    `;
    zoomControls.innerHTML = `
        <button class="zoom-in-btn" style="
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
        " title="확대">🔍+</button>
        <button class="zoom-out-btn" style="
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
        " title="축소">🔍-</button>
        <button class="zoom-fit-btn" style="
            background: none;
            border: none;
            color: white;
            font-size: 16px;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
        " title="전체보기">⛶</button>
    `;
    
    // 리셋 버튼
    const resetButton = document.createElement('button');
    resetButton.className = 'reset-pose-btn';
    resetButton.innerHTML = '🔄 리셋';
    resetButton.style.cssText = `
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s;
    `;
    
    // 닫기 버튼
    const closeButton = document.createElement('button');
    closeButton.className = 'close-editor-btn';
    closeButton.innerHTML = '✕';
    closeButton.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 5px;
        line-height: 1;
        transition: transform 0.2s;
        margin-left: 15px;
    `;
    
    toolsSection.appendChild(zoomControls);
    toolsSection.appendChild(resetButton);
    toolsSection.appendChild(closeButton);
    
    header.appendChild(titleSection);
    header.appendChild(toolsSection);
    
    return header;
}

/**
 * 에디터 메인 컨텐츠 생성
 */
function createEditorContent(poseData, options) {
    const content = document.createElement('div');
    content.style.cssText = `
        flex: 1;
        display: flex;
        background: #16213e;
        overflow: hidden;
    `;
    
    // 캔버스 영역
    const canvasArea = document.createElement('div');
    canvasArea.className = 'pose-canvas-area';
    canvasArea.style.cssText = `
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
        background: radial-gradient(circle at center, #1a2332, #16213e);
        position: relative;
    `;
    
    // 사이드 패널 (편집 도구, 키포인트 리스트)
    const sidePanel = createSidePanel(poseData);
    
    content.appendChild(canvasArea);
    content.appendChild(sidePanel);
    
    // 캔버스 초기화 (비동기)
    setTimeout(() => {
        try {
            console.log('🎨 Initializing pose canvas...');
            const poseCanvas = createPoseCanvas(canvasArea, poseData, {
                pointRadius: 8,
                lineWidth: 4,
                pointColor: '#ff4757',
                lineColor: '#ffffff',
                selectedPointColor: '#ffa502'
            });
            
            // 캔버스 참조 저장
            content._poseCanvas = poseCanvas;
            
            console.log('✅ Pose canvas initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize pose canvas:', error);
            canvasArea.innerHTML = `
                <div style="color: #ff6b6b; text-align: center; padding: 40px;">
                    ❌ 캔버스 초기화 실패<br>
                    <small style="opacity: 0.7;">${error.message}</small>
                </div>
            `;
        }
    }, 100);
    
    return content;
}

/**
 * 사이드 패널 생성
 */
function createSidePanel(poseData) {
    const panel = document.createElement('div');
    panel.style.cssText = `
        width: 300px;
        background: #1a1d2e;
        border-left: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    `;
    
    // 키포인트 정보 섹션
    const keypointsSection = createKeypointsSection(poseData);
    
    // 설정 섹션
    const settingsSection = createSettingsSection();
    
    panel.appendChild(keypointsSection);
    panel.appendChild(settingsSection);
    
    return panel;
}

/**
 * 키포인트 정보 섹션
 */
function createKeypointsSection(poseData) {
    const section = document.createElement('div');
    section.style.cssText = `
        padding: 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;
    
    // DW Pose 키포인트 이름 정의
    const keypointNames = [
        '코 (Nose)',
        '왼쪽 눈 (Left Eye)',
        '오른쪽 눈 (Right Eye)', 
        '왼쪽 귀 (Left Ear)',
        '오른쪽 귀 (Right Ear)',
        '왼쪽 어깨 (Left Shoulder)',
        '오른쪽 어깨 (Right Shoulder)',
        '왼쪽 팔꿈치 (Left Elbow)',
        '오른쪽 팔꿈치 (Right Elbow)',
        '왼쪽 손목 (Left Wrist)',
        '오른쪽 손목 (Right Wrist)',
        '왼쪽 엉덩이 (Left Hip)',
        '오른쪽 엉덩이 (Right Hip)',
        '왼쪽 무릎 (Left Knee)',
        '오른쪽 무릎 (Right Knee)',
        '왼쪽 발목 (Left Ankle)',
        '오른쪽 발목 (Right Ankle)'
    ];
    
    let keypointsHTML = `
        <h3 style="color: #e8eaed; margin: 0 0 15px 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
            📍 키포인트 목록
        </h3>
        <div style="max-height: 300px; overflow-y: auto;">
    `;
    
    if (poseData && poseData.keypoints) {
        for (let i = 0; i < keypointNames.length && i * 3 < poseData.keypoints.length; i++) {
            const x = poseData.keypoints[i * 3];
            const y = poseData.keypoints[i * 3 + 1];
            const confidence = poseData.keypoints[i * 3 + 2];
            
            const isVisible = confidence > 0.3;
            const confidenceColor = confidence > 0.7 ? '#4a9eff' : confidence > 0.3 ? '#ffa502' : '#999';
            
            keypointsHTML += `
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    margin-bottom: 6px;
                    background: ${isVisible ? 'rgba(74, 158, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
                    border-radius: 6px;
                    border-left: 3px solid ${confidenceColor};
                ">
                    <div>
                        <div style="color: #e8eaed; font-size: 13px; font-weight: 500;">
                            ${i}. ${keypointNames[i]}
                        </div>
                        <div style="color: #999; font-size: 11px;">
                            (${x.toFixed(1)}, ${y.toFixed(1)})
                        </div>
                    </div>
                    <div style="color: ${confidenceColor}; font-size: 11px; font-weight: 600;">
                        ${(confidence * 100).toFixed(0)}%
                    </div>
                </div>
            `;
        }
    }
    
    keypointsHTML += '</div>';
    section.innerHTML = keypointsHTML;
    
    return section;
}

/**
 * 설정 섹션
 */
function createSettingsSection() {
    const section = document.createElement('div');
    section.style.cssText = `
        padding: 20px;
        flex: 1;
    `;
    
    section.innerHTML = `
        <h3 style="color: #e8eaed; margin: 0 0 15px 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
            ⚙️ 편집 설정
        </h3>
        
        <div style="margin-bottom: 20px;">
            <label style="color: #ccc; display: block; margin-bottom: 8px; font-size: 13px;">
                포인트 크기: <span class="point-size-value">8</span>px
            </label>
            <input type="range" class="point-size-slider" min="4" max="12" value="8" step="1" 
                   style="width: 100%; margin-bottom: 15px;">
            
            <label style="color: #ccc; display: block; margin-bottom: 8px; font-size: 13px;">
                선 두께: <span class="line-width-value">4</span>px
            </label>
            <input type="range" class="line-width-slider" min="1" max="8" value="4" step="1" 
                   style="width: 100%; margin-bottom: 15px;">
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4 style="color: #e8eaed; margin: 0 0 10px 0; font-size: 14px;">표시 옵션</h4>
            <label style="display: flex; align-items: center; color: #ccc; margin-bottom: 8px; cursor: pointer;">
                <input type="checkbox" class="show-connections" checked style="margin-right: 8px;">
                연결선 표시
            </label>
            <label style="display: flex; align-items: center; color: #ccc; margin-bottom: 8px; cursor: pointer;">
                <input type="checkbox" class="show-labels" style="margin-right: 8px;">
                키포인트 번호 표시
            </label>
            <label style="display: flex; align-items: center; color: #ccc; margin-bottom: 8px; cursor: pointer;">
                <input type="checkbox" class="show-confidence" style="margin-right: 8px;">
                신뢰도 기반 색상
            </label>
        </div>
        
        <div style="padding-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
            <h4 style="color: #e8eaed; margin: 0 0 10px 0; font-size: 14px;">단축키</h4>
            <div style="font-size: 12px; color: #999; line-height: 1.5;">
                <div><kbd style="background: #333; padding: 2px 4px; border-radius: 2px;">ESC</kbd> 선택 해제</div>
                <div><kbd style="background: #333; padding: 2px 4px; border-radius: 2px;">Ctrl+Z</kbd> 실행 취소</div>
                <div><kbd style="background: #333; padding: 2px 4px; border-radius: 2px;">R</kbd> 포즈 리셋</div>
            </div>
        </div>
    `;
    
    return section;
}

/**
 * 에디터 하단 버튼들
 */
function createEditorFooter() {
    const footer = document.createElement('div');
    footer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 30px;
        background: #1a1d2e;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 0 0 16px 16px;
    `;
    
    // 왼쪽: 정보
    const infoSection = document.createElement('div');
    infoSection.style.cssText = `
        color: #999;
        font-size: 13px;
    `;
    infoSection.innerHTML = `
        💡 팁: 키포인트를 드래그하여 포즈를 수정할 수 있습니다
    `;
    
    // 오른쪽: 액션 버튼들
    const actionsSection = document.createElement('div');
    actionsSection.style.cssText = `
        display: flex;
        gap: 15px;
    `;
    
    actionsSection.innerHTML = `
        <button class="cancel-btn" style="
            padding: 12px 24px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        ">취소</button>
        
        <button class="apply-changes-btn" style="
            padding: 12px 24px;
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
        ">✅ 변경사항 적용</button>
    `;
    
    footer.appendChild(infoSection);
    footer.appendChild(actionsSection);
    
    return footer;
}

/**
 * 에디터 이벤트 설정
 */
function setupEditorEvents(backdrop, modal, content) {
    // 닫기 버튼
    const closeBtn = modal.querySelector('.close-editor-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePoseEditor);
    }
    
    // 취소 버튼
    const cancelBtn = modal.querySelector('.cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closePoseEditor);
    }
    
    // 백드롭 클릭으로 닫기 (캔버스 영역 제외)
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closePoseEditor();
        }
    });
    
    // ESC 키로 닫기
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            closePoseEditor();
            document.removeEventListener('keydown', handleKeyDown);
        } else if (e.key === 'r' || e.key === 'R') {
            // 리셋 단축키
            const resetBtn = modal.querySelector('.reset-pose-btn');
            if (resetBtn) resetBtn.click();
        }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    // 리셋 버튼
    const resetBtn = modal.querySelector('.reset-pose-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (content._poseCanvas && content._poseCanvas.resetPose) {
                content._poseCanvas.resetPose();
                console.log('🔄 Pose reset to original');
            }
        });
    }
    
    // 변경사항 적용 버튼
    const applyBtn = modal.querySelector('.apply-changes-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            handleApplyChanges(content);
        });
    }
    
    // 설정 슬라이더들
    setupSettingsEvents(modal, content);
    
    // 줌 컨트롤 버튼들
    setupZoomControls(modal, content);
    
    // 호버 효과들
    setupHoverEffects(modal);
}

/**
 * 설정 이벤트 설정
 */
function setupSettingsEvents(modal, content) {
    // 포인트 크기 슬라이더
    const pointSizeSlider = modal.querySelector('.point-size-slider');
    const pointSizeValue = modal.querySelector('.point-size-value');
    
    if (pointSizeSlider && pointSizeValue) {
        pointSizeSlider.addEventListener('input', (e) => {
            pointSizeValue.textContent = e.target.value;
            // TODO: 캔버스에 실시간 적용
        });
    }
    
    // 선 두께 슬라이더
    const lineWidthSlider = modal.querySelector('.line-width-slider');
    const lineWidthValue = modal.querySelector('.line-width-value');
    
    if (lineWidthSlider && lineWidthValue) {
        lineWidthSlider.addEventListener('input', (e) => {
            lineWidthValue.textContent = e.target.value;
            // TODO: 캔버스에 실시간 적용
        });
    }
}

/**
 * 줌 컨트롤 설정
 */
function setupZoomControls(modal, content) {
    const zoomInBtn = modal.querySelector('.zoom-in-btn');
    const zoomOutBtn = modal.querySelector('.zoom-out-btn');
    const zoomFitBtn = modal.querySelector('.zoom-fit-btn');
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            // TODO: 캔버스 확대 구현
            console.log('🔍 Zoom in');
        });
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            // TODO: 캔버스 축소 구현
            console.log('🔍 Zoom out');
        });
    }
    
    if (zoomFitBtn) {
        zoomFitBtn.addEventListener('click', () => {
            // TODO: 전체보기 구현
            console.log('⛶ Zoom fit');
        });
    }
}

/**
 * 호버 효과 설정
 */
function setupHoverEffects(modal) {
    // 버튼 호버 효과
    const buttons = modal.querySelectorAll('button');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            if (this.style.background.includes('gradient')) return;
            this.style.transform = 'translateY(-1px)';
            this.style.filter = 'brightness(1.1)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.filter = 'brightness(1)';
        });
    });
}

/**
 * 변경사항 적용 처리
 */
async function handleApplyChanges(content) {
    try {
        if (content._poseCanvas && content._poseCanvas.getPoseData) {
            const modifiedPoseData = content._poseCanvas.getPoseData();
            console.log('💾 Applying pose changes:', modifiedPoseData);
            
            // 원본 이미지 크기 정보 확인
            const originalWidth = modifiedPoseData.image_info?.width || 1280; // 로그에서 확인된 원본 크기
            const originalHeight = modifiedPoseData.image_info?.height || 1920; // 로그에서 확인된 원본 크기
            
            console.log('🖼️ Original image dimensions:', { originalWidth, originalHeight });
            
            // 백엔드에 수정된 포즈 데이터 전송하여 스켈레톤 이미지 생성
            const response = await fetch('http://127.0.0.1:8080/api/pose/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pose_data: modifiedPoseData,
                    image_width: originalWidth,
                    image_height: originalHeight,
                    parameters: {
                        skeleton_color: 'white',
                        point_color: 'red', 
                        background_color: 'black',
                        line_width: 3,
                        point_radius: 6
                    }
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Skeleton image generated successfully');
                
                // 생성된 스켈레톤 이미지를 메인 캔버스에 적용
                const imageDataUrl = `data:image/png;base64,${result.skeleton_image}`;
                await applySkelentonToCanvas(imageDataUrl);
                console.log('✅ Modified pose applied to canvas');
                
                // 성공 메시지 표시
                showSuccessMessage('포즈가 캔버스에 적용되었습니다!');
                
                // 에디터 닫기
                setTimeout(closePoseEditor, 1500);
                
            } else {
                throw new Error(result.error || 'Skeleton rendering failed');
            }
            
        } else {
            throw new Error('Pose canvas not available');
        }
    } catch (error) {
        console.error('❌ Failed to apply pose changes:', error);
        showErrorMessage('포즈 적용에 실패했습니다: ' + error.message);
    }
}

/**
 * 스켈레톤 이미지를 메인 캔버스에 적용
 */
async function applySkelentonToCanvas(skeletonImageDataUrl) {
    console.log('🎨 Applying skeleton image to main canvas');
    
    try {
        // 메인 캔버스 가져오기
        const { getStage } = await import('../canvas/canvas.js');
        const canvas = getStage();
        
        if (!canvas) {
            throw new Error('Main canvas not found');
        }
        
        // 캔버스의 메인 레이어 가져오기
        const mainLayer = canvas.getLayers()[0];
        if (!mainLayer) {
            throw new Error('Main layer not found');
        }
        
        // 새 이미지 객체 생성
        const skeletonImage = new Image();
        
        return new Promise((resolve, reject) => {
            skeletonImage.onload = () => {
                try {
                    // 캔버스 중앙에 스켈레톤 이미지 추가
                    const canvasWidth = canvas.width();
                    const canvasHeight = canvas.height();
                    
                    // 적절한 크기로 스케일링 (캔버스의 1/3 정도)
                    const targetSize = Math.min(canvasWidth, canvasHeight) / 3;
                    const scale = targetSize / Math.max(skeletonImage.width, skeletonImage.height);
                    
                    const processedImageNode = new window.Konva.Image({
                        image: skeletonImage,
                        x: canvasWidth / 2 - (skeletonImage.width * scale) / 2,
                        y: canvasHeight / 2 - (skeletonImage.height * scale) / 2,
                        scaleX: scale,
                        scaleY: scale,
                        draggable: true,
                        
                        // 이미지 타입 속성 추가 (preproc 타입)
                        imageType: 'preproc',
                        processingSource: 'pose_editor',
                        originalImageId: null, // 필요시 추후 설정
                        createdAt: new Date().toISOString(),
                        processingParams: {
                            type: 'dwpose_skeleton',
                            method: 'visual_editor'
                        }
                    });
                    
                    // 메인 레이어에 추가
                    mainLayer.add(processedImageNode);
                    mainLayer.draw();
                    
                    console.log('✅ Skeleton image applied to canvas as preproc type');
                    resolve();
                    
                } catch (error) {
                    console.error('❌ Error adding skeleton to canvas:', error);
                    reject(error);
                }
            };
            
            skeletonImage.onerror = () => {
                reject(new Error('Failed to load skeleton image'));
            };
            
            skeletonImage.src = skeletonImageDataUrl;
        });
        
    } catch (error) {
        console.error('❌ Error applying skeleton to canvas:', error);
        throw error;
    }
}

/**
 * 유효한 키포인트 개수 계산
 */
function countValidKeypoints(poseData) {
    if (!poseData || !poseData.keypoints) return 0;
    
    let count = 0;
    for (let i = 2; i < poseData.keypoints.length; i += 3) {
        if (poseData.keypoints[i] > 0.3) { // confidence > 0.3
            count++;
        }
    }
    return count;
}

/**
 * 성공 메시지 표시
 */
function showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 4000;
        font-size: 14px;
        box-shadow: 0 4px 20px rgba(40, 167, 69, 0.3);
        animation: slideInRight 0.3s ease-out;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * 에러 메시지 표시
 */
function showErrorMessage(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #dc3545;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 4000;
        font-size: 14px;
        box-shadow: 0 4px 20px rgba(220, 53, 69, 0.3);
        animation: slideInRight 0.3s ease-out;
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

/**
 * CSS 애니메이션 추가
 */
function addEditorStyles() {
    if (document.getElementById('pose-editor-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'pose-editor-styles';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes slideUp {
            from { 
                opacity: 0;
                transform: translateY(30px) scale(0.95);
            }
            to { 
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }
        
        @keyframes slideInRight {
            from { 
                opacity: 0;
                transform: translateX(100%);
            }
            to { 
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes slideOutRight {
            from { 
                opacity: 1;
                transform: translateX(0);
            }
            to { 
                opacity: 0;
                transform: translateX(100%);
            }
        }
        
        .pose-editor-modal::-webkit-scrollbar {
            width: 8px;
        }
        
        .pose-editor-modal::-webkit-scrollbar-track {
            background: #1a1d2e;
        }
        
        .pose-editor-modal::-webkit-scrollbar-thumb {
            background: #4a9eff;
            border-radius: 4px;
        }
        
        .pose-editor-modal button:hover {
            transform: translateY(-1px);
            filter: brightness(1.1);
        }
        
        .pose-editor-modal input[type="range"] {
            -webkit-appearance: none;
            height: 6px;
            background: #333;
            border-radius: 3px;
            outline: none;
        }
        
        .pose-editor-modal input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            background: #4a9eff;
            border-radius: 50%;
            cursor: pointer;
        }
    `;
    
    document.head.appendChild(style);
}