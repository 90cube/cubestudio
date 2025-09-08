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
    
    // 5개 전문 탭 시스템
    const tabs = [
        { id: 'edges', name: 'Edge & Lines', icon: '📐', category: 'structural' },
        { id: 'depth', name: 'Depth & Normals', icon: '🏔️', category: 'spatial' },
        { id: 'pose', name: 'Pose & Human', icon: '🤸', category: 'human' },
        { id: 'segment', name: 'Segmentation', icon: '🎯', category: 'semantic' },
        { id: 'advanced', name: 'Advanced', icon: '⚡', category: 'specialized' }
    ];
    
    let activeTab = 'edges'; // 기본 활성 탭
    
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
        case 'edges':
            contentArea.appendChild(createEdgeUI(imageNode));
            break;
        case 'depth':
            contentArea.appendChild(createDepthUI(imageNode));
            break;
        case 'pose':
            contentArea.appendChild(createPoseUI(imageNode));
            break;
        case 'segment':
            contentArea.appendChild(createSegmentationUI(imageNode));
            break;
        case 'advanced':
            contentArea.appendChild(createAdvancedUI(imageNode));
            break;
    }
}

/**
 * Edge & Lines 전처리 UI 생성 (Canny, HED, PiDiNet, Line Art, Scribble)
 */
function createEdgeUI(imageNode) {
    const container = document.createElement('div');
    container._imageNode = imageNode;
    
    // 헤더
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; padding: 16px 20px 12px 20px;';
    header.innerHTML = `
        <h3 style="margin: 0 0 8px 0; color: #3498db; font-size: 18px;">📐 Edge & Lines Detection</h3>
        <p style="color: #bbb; margin: 0; font-size: 13px;">윤곽선, 라인아트, 스케치 검출을 통한 구조적 정보 추출</p>
    `;
    
    // 모델 선택 카드 영역
    const modelSection = createModelSelectionSection('edge', [
        { 
            id: 'canny', 
            name: 'Canny Edge', 
            description: '클래식한 엣지 검출 알고리즘',
            capabilities: ['빠른 처리', '정확한 윤곽선'],
            requirements: '낮음',
            icon: '📐'
        },
        { 
            id: 'hed', 
            name: 'Holistically-Nested Edge Detection', 
            description: '딥러닝 기반 전체적 엣지 검출',
            capabilities: ['자연스러운 윤곽', '세밀한 디테일'],
            requirements: 'GPU 권장',
            icon: '🎨'
        },
        { 
            id: 'pidinet', 
            name: 'PiDiNet', 
            description: '픽셀 차분 네트워크 기반 엣지 검출',
            capabilities: ['고품질 엣지', '노이즈 저항성'],
            requirements: 'GPU 필요',
            icon: '⚡'
        },
        { 
            id: 'lineart', 
            name: 'Line Art', 
            description: '라인아트 스타일 변환',
            capabilities: ['깔끔한 선화', '일러스트 최적화'],
            requirements: 'GPU 권장',
            icon: '✏️'
        },
        { 
            id: 'scribble', 
            name: 'Scribble', 
            description: '스케치/낙서 스타일 검출',
            capabilities: ['자유로운 스케치', '손그림 느낌'],
            requirements: '중간',
            icon: '✨'
        }
    ]);
    
    // 파라미터 섹션
    const parametersSection = createParametersSection('edge', {
        basic: [
            { id: 'threshold_low', name: '하위 임계값', type: 'range', min: 0, max: 255, value: 100, step: 1 },
            { id: 'threshold_high', name: '상위 임계값', type: 'range', min: 0, max: 255, value: 200, step: 1 },
            { id: 'edge_strength', name: '엣지 강도', type: 'range', min: 0.1, max: 3.0, value: 1.0, step: 0.1 }
        ],
        advanced: [
            { id: 'blur_radius', name: '블러 반경', type: 'range', min: 0, max: 10, value: 1.4, step: 0.1 },
            { id: 'l2_gradient', name: 'L2 Gradient 사용', type: 'checkbox', value: true },
            { id: 'safe_mode', name: '안전 모드 (노이즈 감소)', type: 'checkbox', value: false },
            { id: 'resolution', name: '처리 해상도', type: 'select', options: [
                { value: 'original', label: '원본 해상도' },
                { value: '512', label: '512px' },
                { value: '768', label: '768px' },
                { value: '1024', label: '1024px' }
            ], value: '512' }
        ]
    });
    
    // 미리보기 섹션
    const previewSection = createAdvancedPreviewSection();
    
    // 버튼 섹션
    const buttonSection = createActionButtonsSection('edge', container);
    
    container.appendChild(header);
    container.appendChild(modelSection);
    container.appendChild(parametersSection);
    container.appendChild(previewSection);
    container.appendChild(buttonSection);
    
    return container;
}

/**
 * Enhanced Depth & Normals 전처리 UI 생성 (MiDaS, LeReS, ZoeDepth, Normal Maps)
 */
function createDepthUI(imageNode) {
    const container = document.createElement('div');
    container._imageNode = imageNode;
    
    // 헤더
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; padding: 16px 20px 12px 20px;';
    header.innerHTML = `
        <h3 style="margin: 0 0 8px 0; color: #e67e22; font-size: 18px;">🏔️ Depth & Normals</h3>
        <p style="color: #bbb; margin: 0; font-size: 13px;">깊이 맵, 법선 맵을 통한 3D 공간 정보 추출</p>
    `;
    
    // 모델 선택 카드 영역
    const modelSection = createModelSelectionSection('depth', [
        { 
            id: 'midas_v3', 
            name: 'MiDaS v3.1 (DPT-Large)', 
            description: '최신 비전 트랜스포머 기반 깊이 추정',
            capabilities: ['고정밀도', '실외/실내 범용'],
            requirements: 'GPU 필요',
            icon: '🏔️'
        },
        { 
            id: 'midas_v2', 
            name: 'MiDaS v2.1 (ResNet)', 
            description: 'ResNet 기반 안정적인 깊이 추정',
            capabilities: ['균형잡힌 성능', '빠른 처리'],
            requirements: 'GPU 권장',
            icon: '⛰️'
        },
        { 
            id: 'dpt_hybrid', 
            name: 'DPT-Hybrid', 
            description: 'CNN + Transformer 하이브리드 모델',
            capabilities: ['세밀한 디테일', '경계 보존'],
            requirements: 'GPU 필요',
            icon: '🗻'
        },
        { 
            id: 'zoedepth', 
            name: 'ZoeDepth', 
            description: '영상 기하학 기반 제로샷 깊이 추정',
            capabilities: ['실내 특화', '메트릭 깊이'],
            requirements: 'GPU 필요',
            icon: '🏠'
        },
        { 
            id: 'normal_map', 
            name: 'Normal Map', 
            description: '표면 법선 벡터 추출',
            capabilities: ['라이팅 정보', '표면 디테일'],
            requirements: 'GPU 권장',
            icon: '🎯'
        }
    ]);
    
    // 파라미터 섹션
    const parametersSection = createParametersSection('depth', {
        basic: [
            { id: 'depth_strength', name: '깊이 강도', type: 'range', min: 0.1, max: 3.0, value: 1.0, step: 0.1 },
            { id: 'contrast', name: '대비', type: 'range', min: 0.5, max: 3.0, value: 1.2, step: 0.1 },
            { id: 'brightness', name: '밝기', type: 'range', min: -0.5, max: 0.5, value: 0.1, step: 0.05 }
        ],
        advanced: [
            { id: 'smoothing', name: '스무딩 정도', type: 'range', min: 0, max: 10, value: 2, step: 1 },
            { id: 'invert_depth', name: '깊이 반전', type: 'checkbox', value: false },
            { id: 'remove_background', name: '배경 제거', type: 'checkbox', value: false },
            { id: 'depth_range', name: '깊이 범위', type: 'select', options: [
                { value: 'auto', label: '자동 감지' },
                { value: 'near', label: '근거리 (0-10m)' },
                { value: 'medium', label: '중거리 (0-50m)' },
                { value: 'far', label: '원거리 (0-1000m)' }
            ], value: 'auto' },
            { id: 'output_format', name: '출력 형식', type: 'select', options: [
                { value: 'disparity', label: 'Disparity Map' },
                { value: 'depth', label: 'Depth Map' },
                { value: 'normal', label: 'Normal Map' },
                { value: 'both', label: 'Depth + Normal' }
            ], value: 'depth' }
        ]
    });
    
    // 미리보기 섹션
    const previewSection = createAdvancedPreviewSection();
    
    // 버튼 섹션
    const buttonSection = createActionButtonsSection('depth', container);
    
    container.appendChild(header);
    container.appendChild(modelSection);
    container.appendChild(parametersSection);
    container.appendChild(previewSection);
    container.appendChild(buttonSection);
    
    return container;
}

/**
 * Pose & Human 전처리 UI 생성 (OpenPose, DWPose, MediaPipe)
 */
function createPoseUI(imageNode) {
    const container = document.createElement('div');
    container._imageNode = imageNode;
    
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; padding: 16px 20px 12px 20px;';
    header.innerHTML = `
        <h3 style="margin: 0 0 8px 0; color: #9b59b6; font-size: 18px;">🤸 Pose & Human</h3>
        <p style="color: #bbb; margin: 0; font-size: 13px;">인체 포즈, 골격, 얼굴 랜드마크 인식 및 추출</p>
    `;
    
    const modelSection = createModelSelectionSection('pose', [
        { 
            id: 'openpose', 
            name: 'OpenPose', 
            description: '클래식한 멀티퍼슨 포즈 추정',
            capabilities: ['다중 인물', '18개 골격점'],
            requirements: 'GPU 필요',
            icon: '🤸'
        },
        { 
            id: 'openpose_face', 
            name: 'OpenPose + Face', 
            description: 'OpenPose + 얼굴 랜드마크',
            capabilities: ['얼굴 디테일', '70개 얼굴점'],
            requirements: 'GPU 필요',
            icon: '😊'
        },
        { 
            id: 'openpose_hand', 
            name: 'OpenPose + Hand', 
            description: 'OpenPose + 손 골격 추출',
            capabilities: ['손가락 디테일', '21개 손 골격점'],
            requirements: 'GPU 필요',
            icon: '✋'
        },
        { 
            id: 'dwpose', 
            name: 'DWPose', 
            description: '분산 가중치 포즈 추정',
            capabilities: ['높은 정확도', '실시간 처리'],
            requirements: 'GPU 권장',
            icon: '🎭'
        },
        { 
            id: 'mediapipe', 
            name: 'MediaPipe Pose', 
            description: 'Google MediaPipe 포즈 솔루션',
            capabilities: ['빠른 처리', '경량화'],
            requirements: '낮음',
            icon: '⚡'
        }
    ]);
    
    const parametersSection = createParametersSection('pose', {
        basic: [
            { id: 'confidence_threshold', name: '신뢰도 임계값', type: 'range', min: 0.1, max: 1.0, value: 0.5, step: 0.05 },
            { id: 'keypoint_thickness', name: '키포인트 두께', type: 'range', min: 1, max: 10, value: 3, step: 1 },
            { id: 'skeleton_thickness', name: '골격선 두께', type: 'range', min: 1, max: 8, value: 2, step: 1 }
        ],
        advanced: [
            { id: 'detect_face', name: '얼굴 검출', type: 'checkbox', value: false },
            { id: 'detect_hands', name: '손 검출', type: 'checkbox', value: false },
            { id: 'multi_person', name: '다중 인물 검출', type: 'checkbox', value: true },
            { id: 'pose_model', name: '포즈 모델', type: 'select', options: [
                { value: 'COCO', label: 'COCO (18 points)' },
                { value: 'BODY_25', label: 'BODY_25 (25 points)' },
                { value: 'MPII', label: 'MPII (15 points)' }
            ], value: 'COCO' }
        ]
    });
    
    const previewSection = createAdvancedPreviewSection();
    const buttonSection = createActionButtonsSection('pose', container);
    
    container.appendChild(header);
    container.appendChild(modelSection);
    container.appendChild(parametersSection);
    container.appendChild(previewSection);
    container.appendChild(buttonSection);
    
    return container;
}

/**
 * Segmentation 전처리 UI 생성 (ADE20K, COCO)
 */
function createSegmentationUI(imageNode) {
    const container = document.createElement('div');
    container._imageNode = imageNode;
    
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; padding: 16px 20px 12px 20px;';
    header.innerHTML = `
        <h3 style="margin: 0 0 8px 0; color: #f39c12; font-size: 18px;">🎯 Segmentation</h3>
        <p style="color: #bbb; margin: 0; font-size: 13px;">의미론적 분할을 통한 객체 및 영역 구분</p>
    `;
    
    const modelSection = createModelSelectionSection('segment', [
        { 
            id: 'ade20k', 
            name: 'ADE20K', 
            description: '150개 클래스 실내외 장면 분할',
            capabilities: ['세밀한 분류', '실내외 범용'],
            requirements: 'GPU 필요',
            icon: '🏠'
        },
        { 
            id: 'coco_stuff', 
            name: 'COCO-Stuff', 
            description: 'COCO 데이터셋 기반 객체/배경 분할',
            capabilities: ['객체 중심', '80개 클래스'],
            requirements: 'GPU 권장',
            icon: '🐱'
        },
        { 
            id: 'cityscapes', 
            name: 'Cityscapes', 
            description: '도시 환경 특화 분할',
            capabilities: ['차량/도로 특화', '자율주행'],
            requirements: 'GPU 필요',
            icon: '🚗'
        },
        { 
            id: 'oneformer', 
            name: 'OneFormer', 
            description: '범용 세그멘테이션 모델',
            capabilities: ['다목적', '고성능'],
            requirements: 'GPU 필요',
            icon: '🎯'
        }
    ]);
    
    const parametersSection = createParametersSection('segment', {
        basic: [
            { id: 'mask_opacity', name: '마스크 투명도', type: 'range', min: 0.1, max: 1.0, value: 0.7, step: 0.05 },
            { id: 'outline_thickness', name: '외곽선 두께', type: 'range', min: 0, max: 5, value: 1, step: 1 }
        ],
        advanced: [
            { id: 'color_mode', name: '색상 모드', type: 'select', options: [
                { value: 'category', label: '카테고리별 색상' },
                { value: 'instance', label: '인스턴스별 색상' },
                { value: 'depth', label: '깊이별 색상' }
            ], value: 'category' },
            { id: 'show_labels', name: '레이블 표시', type: 'checkbox', value: true },
            { id: 'merge_small', name: '작은 영역 병합', type: 'checkbox', value: false }
        ]
    });
    
    const previewSection = createAdvancedPreviewSection();
    const buttonSection = createActionButtonsSection('segment', container);
    
    container.appendChild(header);
    container.appendChild(modelSection);
    container.appendChild(parametersSection);
    container.appendChild(previewSection);
    container.appendChild(buttonSection);
    
    return container;
}

/**
 * Advanced 전처리 UI 생성 (MLSD, Shuffle, Threshold 등)
 */
function createAdvancedUI(imageNode) {
    const container = document.createElement('div');
    container._imageNode = imageNode;
    
    const header = document.createElement('div');
    header.style.cssText = 'text-align: center; padding: 16px 20px 12px 20px;';
    header.innerHTML = `
        <h3 style="margin: 0 0 8px 0; color: #e74c3c; font-size: 18px;">⚡ Advanced</h3>
        <p style="color: #bbb; margin: 0; font-size: 13px;">특수 목적 전처리 및 실험적 기능</p>
    `;
    
    const modelSection = createModelSelectionSection('advanced', [
        { 
            id: 'mlsd', 
            name: 'M-LSD', 
            description: 'Mobile Line Segment Detection',
            capabilities: ['직선 검출', '모바일 최적화'],
            requirements: '낮음',
            icon: '📏'
        },
        { 
            id: 'shuffle', 
            name: 'Shuffle', 
            description: '이미지 셔플링 및 재배열',
            capabilities: ['텍스처 변형', '패턴 변화'],
            requirements: '낮음',
            icon: '🔀'
        },
        { 
            id: 'threshold', 
            name: 'Threshold', 
            description: '임계값 기반 이진화',
            capabilities: ['이진 변환', '윤곽 강조'],
            requirements: '낮음',
            icon: '⚫'
        },
        { 
            id: 'inpaint', 
            name: 'Inpainting Guide', 
            description: '인페인팅 가이드 생성',
            capabilities: ['마스크 생성', '영역 지정'],
            requirements: 'GPU 권장',
            icon: '🎨'
        },
        { 
            id: 'tile', 
            name: 'Tile Resample', 
            description: '타일 기반 리샘플링',
            capabilities: ['해상도 향상', '디테일 보존'],
            requirements: 'GPU 권장',
            icon: '🧩'
        }
    ]);
    
    const parametersSection = createParametersSection('advanced', {
        basic: [
            { id: 'intensity', name: '효과 강도', type: 'range', min: 0.1, max: 2.0, value: 1.0, step: 0.1 }
        ],
        advanced: [
            { id: 'experimental', name: '실험적 기능', type: 'checkbox', value: false },
            { id: 'custom_params', name: '사용자 정의 파라미터', type: 'text', placeholder: '{"param": "value"}' }
        ]
    });
    
    const previewSection = createAdvancedPreviewSection();
    const buttonSection = createActionButtonsSection('advanced', container);
    
    container.appendChild(header);
    container.appendChild(modelSection);
    container.appendChild(parametersSection);
    container.appendChild(previewSection);
    container.appendChild(buttonSection);
    
    return container;
}

// ============================================================================
// LEGACY FUNCTIONS (TO BE REMOVED)
// ============================================================================
// The old Canny UI function is no longer used but kept for reference
// Remove this section after confirming the new system works properly

/**
 * LEGACY: Canny 전처리 UI 생성 (구 버전 - 사용안함)
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
 * LEGACY: OpenPose 전처리 UI 생성 (구 버전 - 사용안함)
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

// ============================================================================
// PROFESSIONAL UI HELPER FUNCTIONS
// ============================================================================

/**
 * 프로페셔널 모델 선택 섹션 생성
 * @param {string} category - 카테고리 ('edge', 'depth', 'pose', etc.)
 * @param {Array} models - 모델 정보 배열
 * @returns {HTMLElement} 모델 선택 섹션
 */
function createModelSelectionSection(category, models) {
    const section = document.createElement('div');
    section.className = `model-selection-section ${category}-models`;
    section.style.cssText = `
        padding: 0 16px 20px 16px;
        background: rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        margin: 0 16px 20px 16px;
    `;
    
    // 섹션 헤더
    const header = document.createElement('div');
    header.style.cssText = 'padding: 16px 0 12px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.1); margin-bottom: 16px;';
    header.innerHTML = `
        <h4 style="margin: 0 0 8px 0; color: #fff; font-size: 14px; font-weight: 600;">모델 선택</h4>
        <p style="margin: 0; color: #bbb; font-size: 12px;">사용할 AI 모델을 선택하세요. 각 모델은 다른 특징과 요구사항을 가집니다.</p>
    `;
    
    // 모델 카드 그리드
    const grid = document.createElement('div');
    grid.className = 'model-cards-grid';
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin-top: 16px;
    `;
    
    let selectedModelId = models[0]?.id || '';
    
    models.forEach((model, index) => {
        const card = document.createElement('div');
        card.className = `model-card ${index === 0 ? 'selected' : ''}`;
        card.dataset.modelId = model.id;
        card.style.cssText = `
            background: ${index === 0 ? 'linear-gradient(135deg, rgba(52, 152, 219, 0.2), rgba(52, 152, 219, 0.1))' : 'rgba(255, 255, 255, 0.05)'};
            border: 1px solid ${index === 0 ? 'rgba(52, 152, 219, 0.5)' : 'rgba(255, 255, 255, 0.1)'};
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            min-height: 120px;
        `;
        
        // 요구사항 색상
        const reqColor = model.requirements === 'GPU 필요' ? '#e74c3c' : 
                        model.requirements === 'GPU 권장' ? '#f39c12' : '#27ae60';
        
        card.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 20px; margin-right: 8px;">${model.icon}</span>
                <div style="flex: 1;">
                    <h5 style="margin: 0 0 2px 0; color: #fff; font-size: 13px; font-weight: 600;">${model.name}</h5>
                    <span style="color: ${reqColor}; font-size: 10px; font-weight: 500;">${model.requirements}</span>
                </div>
            </div>
            <p style="margin: 0 0 8px 0; color: #bbb; font-size: 11px; line-height: 1.4;">${model.description}</p>
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                ${model.capabilities.map(cap => 
                    `<span style="background: rgba(255, 255, 255, 0.1); color: #ddd; font-size: 10px; padding: 2px 6px; border-radius: 3px;">${cap}</span>`
                ).join('')}
            </div>
        `;
        
        card.addEventListener('click', () => {
            // 다른 카드들 선택 해제
            grid.querySelectorAll('.model-card').forEach(c => {
                c.classList.remove('selected');
                c.style.background = 'rgba(255, 255, 255, 0.05)';
                c.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            });
            
            // 현재 카드 선택
            card.classList.add('selected');
            card.style.background = 'linear-gradient(135deg, rgba(52, 152, 219, 0.2), rgba(52, 152, 219, 0.1))';
            card.style.borderColor = 'rgba(52, 152, 219, 0.5)';
            
            selectedModelId = model.id;
            console.log(`Selected ${category} model:`, model.name);
        });
        
        // 호버 효과
        card.addEventListener('mouseenter', () => {
            if (!card.classList.contains('selected')) {
                card.style.background = 'rgba(255, 255, 255, 0.08)';
                card.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }
        });
        
        card.addEventListener('mouseleave', () => {
            if (!card.classList.contains('selected')) {
                card.style.background = 'rgba(255, 255, 255, 0.05)';
                card.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }
        });
        
        grid.appendChild(card);
    });
    
    section.appendChild(header);
    section.appendChild(grid);
    
    // 선택된 모델 ID를 섹션에 저장
    section._selectedModelId = selectedModelId;
    
    return section;
}

/**
 * 파라미터 섹션 생성 (Basic/Advanced 구분)
 * @param {string} category - 카테고리
 * @param {Object} parameterGroups - {basic: [], advanced: []}
 * @returns {HTMLElement} 파라미터 섹션
 */
function createParametersSection(category, parameterGroups) {
    const section = document.createElement('div');
    section.className = `parameters-section ${category}-parameters`;
    section.style.cssText = `
        background: rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        margin: 0 16px 20px 16px;
        overflow: hidden;
    `;
    
    // Basic Parameters (항상 표시)
    if (parameterGroups.basic && parameterGroups.basic.length > 0) {
        const basicSection = createParameterGroup('Basic', parameterGroups.basic, true);
        section.appendChild(basicSection);
    }
    
    // Advanced Parameters (접을 수 있음)
    if (parameterGroups.advanced && parameterGroups.advanced.length > 0) {
        const advancedSection = createParameterGroup('Advanced', parameterGroups.advanced, false);
        section.appendChild(advancedSection);
    }
    
    return section;
}

/**
 * 파라미터 그룹 생성
 * @param {string} groupName - 그룹 이름
 * @param {Array} parameters - 파라미터 배열
 * @param {boolean} expanded - 초기 확장 상태
 * @returns {HTMLElement} 파라미터 그룹
 */
function createParameterGroup(groupName, parameters, expanded = true) {
    const group = document.createElement('div');
    group.className = `parameter-group ${groupName.toLowerCase()}-group`;
    group.style.cssText = `border-bottom: 1px solid rgba(255, 255, 255, 0.1);`;
    
    // 헤더 (클릭해서 접기/펼치기)
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(255, 255, 255, 0.02);
        transition: background 0.2s;
    `;
    
    header.innerHTML = `
        <div>
            <h4 style="margin: 0 0 2px 0; color: #fff; font-size: 14px; font-weight: 600;">${groupName} Parameters</h4>
            <p style="margin: 0; color: #bbb; font-size: 11px;">${parameters.length}개 파라미터</p>
        </div>
        <span class="expand-icon" style="color: #bbb; font-size: 18px; transition: transform 0.3s;">${expanded ? '−' : '+'}</span>
    `;
    
    // 파라미터 컨테이너
    const container = document.createElement('div');
    container.className = 'parameters-container';
    container.style.cssText = `
        padding: ${expanded ? '16px' : '0'};
        max-height: ${expanded ? 'none' : '0'};
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        background: rgba(0, 0, 0, 0.1);
    `;
    
    // 파라미터 요소들 생성
    parameters.forEach(param => {
        const paramElement = createParameterControl(param);
        container.appendChild(paramElement);
    });
    
    // 헤더 클릭 이벤트 (접기/펼치기)
    header.addEventListener('click', () => {
        const isExpanded = container.style.maxHeight !== '0px';
        const icon = header.querySelector('.expand-icon');
        
        if (isExpanded) {
            container.style.maxHeight = '0px';
            container.style.padding = '0 16px';
            icon.textContent = '+';
            icon.style.transform = 'rotate(0deg)';
        } else {
            container.style.maxHeight = container.scrollHeight + 'px';
            container.style.padding = '16px';
            icon.textContent = '−';
            icon.style.transform = 'rotate(180deg)';
            
            // 애니메이션 완료 후 auto로 설정
            setTimeout(() => {
                container.style.maxHeight = 'none';
            }, 300);
        }
    });
    
    header.addEventListener('mouseenter', () => {
        header.style.background = 'rgba(255, 255, 255, 0.05)';
    });
    
    header.addEventListener('mouseleave', () => {
        header.style.background = 'rgba(255, 255, 255, 0.02)';
    });
    
    group.appendChild(header);
    group.appendChild(container);
    
    return group;
}

/**
 * 개별 파라미터 컨트롤 생성
 * @param {Object} param - 파라미터 설정
 * @returns {HTMLElement} 파라미터 컨트롤
 */
function createParameterControl(param) {
    const container = document.createElement('div');
    container.className = `param-control param-${param.id}`;
    container.style.cssText = `
        margin-bottom: 16px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    `;
    
    const label = document.createElement('label');
    label.style.cssText = `
        display: block;
        margin-bottom: 8px;
        color: #ddd;
        font-size: 13px;
        font-weight: 500;
    `;
    
    let control;
    
    switch (param.type) {
        case 'range':
            label.innerHTML = `${param.name}: <span class="param-value" style="color: #3498db; font-weight: 600;">${param.value}</span>`;
            
            control = document.createElement('input');
            control.type = 'range';
            control.id = param.id;
            control.min = param.min;
            control.max = param.max;
            control.value = param.value;
            control.step = param.step;
            control.style.cssText = `
                width: 100%;
                height: 6px;
                background: linear-gradient(to right, #3498db 0%, rgba(255, 255, 255, 0.2) 0%);
                border-radius: 3px;
                outline: none;
                -webkit-appearance: none;
            `;
            
            // 실시간 값 업데이트
            control.addEventListener('input', (e) => {
                const valueSpan = container.querySelector('.param-value');
                valueSpan.textContent = e.target.value;
                
                // 슬라이더 배경 그라디언트 업데이트
                const percent = ((e.target.value - e.target.min) / (e.target.max - e.target.min)) * 100;
                e.target.style.background = `linear-gradient(to right, #3498db ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%)`;
            });
            
            // 초기 슬라이더 배경 설정
            const initialPercent = ((param.value - param.min) / (param.max - param.min)) * 100;
            control.style.background = `linear-gradient(to right, #3498db ${initialPercent}%, rgba(255, 255, 255, 0.2) ${initialPercent}%)`;
            
            break;
            
        case 'checkbox':
            label.innerHTML = param.name;
            
            control = document.createElement('input');
            control.type = 'checkbox';
            control.id = param.id;
            control.checked = param.value;
            control.style.cssText = `
                margin-right: 8px;
                transform: scale(1.2);
                accent-color: #3498db;
            `;
            
            const checkboxLabel = document.createElement('label');
            checkboxLabel.style.cssText = `
                display: flex;
                align-items: center;
                cursor: pointer;
                color: #ddd;
                font-size: 13px;
            `;
            checkboxLabel.appendChild(control);
            checkboxLabel.appendChild(document.createTextNode(param.name));
            
            container.appendChild(checkboxLabel);
            return container;
            
        case 'select':
            label.innerHTML = param.name;
            
            control = document.createElement('select');
            control.id = param.id;
            control.style.cssText = `
                width: 100%;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                padding: 8px;
                font-size: 13px;
            `;
            
            param.options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                opt.selected = option.value === param.value;
                control.appendChild(opt);
            });
            
            break;
            
        case 'text':
            label.innerHTML = param.name;
            
            control = document.createElement('input');
            control.type = 'text';
            control.id = param.id;
            control.placeholder = param.placeholder || '';
            control.style.cssText = `
                width: 100%;
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                padding: 8px;
                font-size: 13px;
            `;
            
            break;
    }
    
    container.appendChild(label);
    if (control && param.type !== 'checkbox') {
        container.appendChild(control);
    }
    
    return container;
}

/**
 * 고급 미리보기 섹션 생성 (Multi-view)
 * @returns {HTMLElement} 미리보기 섹션
 */
function createAdvancedPreviewSection() {
    const section = document.createElement('div');
    section.className = 'preview-section';
    section.style.cssText = `
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        margin: 0 16px 20px 16px;
        overflow: hidden;
    `;
    
    // 미리보기 헤더 (뷰 모드 선택)
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.05);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    header.innerHTML = `
        <h4 style="margin: 0; color: #fff; font-size: 14px; font-weight: 600;">미리보기</h4>
        <div class="preview-view-modes" style="display: flex; gap: 4px;">
            <button class="view-mode-btn active" data-mode="original" style="padding: 4px 8px; background: #3498db; color: white; border: none; border-radius: 3px; font-size: 11px; cursor: pointer;">원본</button>
            <button class="view-mode-btn" data-mode="processed" style="padding: 4px 8px; background: rgba(255, 255, 255, 0.1); color: #ccc; border: none; border-radius: 3px; font-size: 11px; cursor: pointer;">처리됨</button>
            <button class="view-mode-btn" data-mode="overlay" style="padding: 4px 8px; background: rgba(255, 255, 255, 0.1); color: #ccc; border: none; border-radius: 3px; font-size: 11px; cursor: pointer;">오버레이</button>
            <button class="view-mode-btn" data-mode="split" style="padding: 4px 8px; background: rgba(255, 255, 255, 0.1); color: #ccc; border: none; border-radius: 3px; font-size: 11px; cursor: pointer;">분할</button>
        </div>
    `;
    
    // 미리보기 영역
    const previewArea = document.createElement('div');
    previewArea.className = 'preview-area';
    previewArea.style.cssText = `
        padding: 20px;
        min-height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.1);
    `;
    
    previewArea.innerHTML = `
        <div style="text-align: center; color: #999;">
            <div style="font-size: 48px; margin-bottom: 12px;">🖼️</div>
            <div style="font-size: 14px;">미리보기를 클릭하여 결과를 확인하세요</div>
        </div>
    `;
    
    // 뷰 모드 버튼 이벤트
    header.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-mode-btn')) {
            // 모든 버튼 비활성화
            header.querySelectorAll('.view-mode-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.style.background = 'rgba(255, 255, 255, 0.1)';
                btn.style.color = '#ccc';
            });
            
            // 클릭된 버튼 활성화
            e.target.classList.add('active');
            e.target.style.background = '#3498db';
            e.target.style.color = 'white';
            
            const mode = e.target.dataset.mode;
            console.log('Preview mode changed to:', mode);
            // TODO: 실제 뷰 모드 전환 로직 구현
        }
    });
    
    section.appendChild(header);
    section.appendChild(previewArea);
    
    return section;
}

/**
 * 액션 버튼 섹션 생성
 * @param {string} category - 카테고리
 * @param {HTMLElement} container - 컨테이너 참조
 * @returns {HTMLElement} 버튼 섹션
 */
function createActionButtonsSection(category, container) {
    const section = document.createElement('div');
    section.className = 'action-buttons-section';
    section.style.cssText = `
        padding: 16px;
        background: rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        margin: 0 16px 16px 16px;
    `;
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
    `;
    
    // 미리보기 버튼
    const previewBtn = document.createElement('button');
    previewBtn.className = 'preview-btn';
    previewBtn.innerHTML = '🔍 미리보기';
    previewBtn.style.cssText = `
        flex: 1;
        padding: 12px;
        background: linear-gradient(135deg, #3498db, #2980b9);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        box-shadow: 0 2px 4px rgba(52, 152, 219, 0.3);
    `;
    
    // 적용 버튼
    const applyBtn = document.createElement('button');
    applyBtn.className = 'apply-btn';
    applyBtn.innerHTML = '✅ 적용 & 저장';
    applyBtn.style.cssText = `
        flex: 1;
        padding: 12px;
        background: linear-gradient(135deg, #27ae60, #229954);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        box-shadow: 0 2px 4px rgba(39, 174, 96, 0.3);
    `;
    
    // 오버레이 제거 버튼
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-overlay-btn';
    removeBtn.innerHTML = '🗑️ 제거';
    removeBtn.style.cssText = `
        padding: 12px 16px;
        background: linear-gradient(135deg, #e74c3c, #c0392b);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s;
        box-shadow: 0 2px 4px rgba(231, 76, 60, 0.3);
    `;
    
    // 프리셋 버튼들
    const presetContainer = document.createElement('div');
    presetContainer.style.cssText = `
        display: flex;
        gap: 8px;
        justify-content: center;
        margin-bottom: 12px;
    `;
    
    const presets = getPresetsByCategory(category);
    presets.forEach(preset => {
        const presetBtn = document.createElement('button');
        presetBtn.innerHTML = `${preset.icon} ${preset.name}`;
        presetBtn.style.cssText = `
            padding: 6px 10px;
            background: rgba(255, 255, 255, 0.1);
            color: #ccc;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
        `;
        
        presetBtn.addEventListener('click', () => {
            applyPreset(category, preset, container);
            presetBtn.style.background = 'rgba(52, 152, 219, 0.2)';
            presetBtn.style.borderColor = 'rgba(52, 152, 219, 0.5)';
            presetBtn.style.color = '#3498db';
            
            setTimeout(() => {
                presetBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                presetBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                presetBtn.style.color = '#ccc';
            }, 1000);
        });
        
        presetContainer.appendChild(presetBtn);
    });
    
    // 버튼 호버 효과
    [previewBtn, applyBtn, removeBtn].forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = btn.style.boxShadow.replace('0 2px 4px', '0 4px 8px');
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = btn.style.boxShadow.replace('0 4px 8px', '0 2px 4px');
        });
        
        btn.addEventListener('click', () => {
            btn.style.transform = 'scale(0.98)';
            setTimeout(() => {
                btn.style.transform = 'translateY(-1px)';
            }, 100);
        });
    });
    
    // TODO: 실제 이벤트 핸들러 연결
    previewBtn.addEventListener('click', () => {
        console.log(`Preview ${category} processing...`);
        // handlePreview 함수 호출
    });
    
    applyBtn.addEventListener('click', () => {
        console.log(`Apply ${category} processing...`);
        // handleApply 함수 호출
    });
    
    removeBtn.addEventListener('click', () => {
        console.log(`Remove ${category} overlay...`);
        // handleRemoveOverlay 함수 호출
    });
    
    // 상태 메시지 영역
    const statusArea = document.createElement('div');
    statusArea.className = 'status-area';
    statusArea.style.cssText = `
        padding: 12px;
        background: rgba(52, 152, 219, 0.1);
        border: 1px solid rgba(52, 152, 219, 0.3);
        border-radius: 4px;
        color: #ccc;
        font-size: 13px;
        text-align: center;
        transition: all 0.3s;
    `;
    statusArea.textContent = `${category.toUpperCase()} 전처리기 준비됨 - 모델을 선택하고 미리보기를 실행하세요`;
    
    buttonsContainer.appendChild(previewBtn);
    buttonsContainer.appendChild(applyBtn);
    buttonsContainer.appendChild(removeBtn);
    
    section.appendChild(presetContainer);
    section.appendChild(buttonsContainer);
    section.appendChild(statusArea);
    
    return section;
}

/**
 * 카테고리별 프리셋 가져오기
 * @param {string} category - 카테고리
 * @returns {Array} 프리셋 배열
 */
function getPresetsByCategory(category) {
    const presets = {
        edge: [
            { name: '부드러운', icon: '🌸', params: { threshold_low: 50, threshold_high: 150, edge_strength: 0.8 } },
            { name: '표준', icon: '⚡', params: { threshold_low: 100, threshold_high: 200, edge_strength: 1.0 } },
            { name: '강력한', icon: '💪', params: { threshold_low: 150, threshold_high: 255, edge_strength: 1.5 } }
        ],
        depth: [
            { name: '실내', icon: '🏠', params: { depth_range: 'near', depth_strength: 1.2, contrast: 1.1 } },
            { name: '실외', icon: '🌄', params: { depth_range: 'far', depth_strength: 1.0, contrast: 1.3 } },
            { name: '균형', icon: '⚖️', params: { depth_range: 'auto', depth_strength: 1.0, contrast: 1.2 } }
        ],
        pose: [
            { name: '전신', icon: '🤸', params: { pose_model: 'BODY_25', multi_person: true, confidence_threshold: 0.4 } },
            { name: '상체', icon: '🙋', params: { pose_model: 'COCO', detect_face: true, confidence_threshold: 0.5 } },
            { name: '정밀', icon: '🎯', params: { pose_model: 'MPII', confidence_threshold: 0.7, keypoint_thickness: 2 } }
        ],
        segment: [
            { name: '객체', icon: '🐱', params: { color_mode: 'instance', mask_opacity: 0.6, show_labels: true } },
            { name: '장면', icon: '🏞️', params: { color_mode: 'category', mask_opacity: 0.8, show_labels: false } },
            { name: '깔끔', icon: '✨', params: { color_mode: 'depth', mask_opacity: 0.5, merge_small: true } }
        ],
        advanced: [
            { name: '가벼운', icon: '🪶', params: { intensity: 0.5 } },
            { name: '표준', icon: '⚡', params: { intensity: 1.0 } },
            { name: '강력한', icon: '💥', params: { intensity: 1.8 } }
        ]
    };
    
    return presets[category] || [];
}

/**
 * 프리셋 적용
 * @param {string} category - 카테고리
 * @param {Object} preset - 프리셋 정보
 * @param {HTMLElement} container - 컨테이너
 */
function applyPreset(category, preset, container) {
    console.log(`Applying ${preset.name} preset for ${category}:`, preset.params);
    
    // 파라미터 값들을 UI에 적용
    Object.entries(preset.params).forEach(([paramId, value]) => {
        const paramElement = container.querySelector(`#${paramId}`);
        if (paramElement) {
            if (paramElement.type === 'range') {
                paramElement.value = value;
                
                // 값 표시 업데이트
                const valueSpan = paramElement.parentElement.querySelector('.param-value');
                if (valueSpan) {
                    valueSpan.textContent = value;
                }
                
                // 슬라이더 배경 업데이트
                const percent = ((value - paramElement.min) / (paramElement.max - paramElement.min)) * 100;
                paramElement.style.background = `linear-gradient(to right, #3498db ${percent}%, rgba(255, 255, 255, 0.2) ${percent}%)`;
                
                // input 이벤트 트리거
                paramElement.dispatchEvent(new Event('input'));
            } else if (paramElement.type === 'checkbox') {
                paramElement.checked = value;
                paramElement.dispatchEvent(new Event('change'));
            } else if (paramElement.tagName === 'SELECT') {
                paramElement.value = value;
                paramElement.dispatchEvent(new Event('change'));
            }
        }
    });
}

