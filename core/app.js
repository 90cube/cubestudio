import { init as initCanvas, getStage, getLayer, getSelectedImage } from '../components/canvas/canvas.js';
import { init as initImageEditor } from '../components/imageEditor/imageEditor.js';
import { init as initKeyboardManager, registerShortcut } from '../components/keyboardManager/keyboardManager.js';
import { startTransformMode, isTransformModeActive, getTransformer } from '../components/imageEditor/tools/transformer.js';
import { FloatingPanel, getAllPanels } from '../components/ui/floatingPanel/floatingPanel.js';
import { ModelExplorerComponent } from '../components/modelExplorer/modelExplorerComponent.js';
import { ParametersComponent } from '../components/parameters/parametersComponent.js';
import { MultiDetailerComponent } from '../components/multiDetailer/multiDetailerComponent.js';
import { LoRASelectorComponent } from '../components/loraSelector/loraSelector.js';
import { GenerationPanel } from '../components/generationPanel/generationPanel.js';

// DOM이 완전히 로드된 후 애플리케이션 초기화
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Canvas Studio...');

    // 1. 키보드 매니저 초기화 (먼저 초기화하여 웹 단축키 비활성화)
    initKeyboardManager();

    // 2. 캔버스 모듈 초기화
    initCanvas('canvas-container');

    // 3. 이미지 에디터 초기화
    const stage = getStage();
    const layer = getLayer();
    if (stage && layer) {
        initImageEditor(stage, layer);
    }

    // 4. 애플리케이션 단축키 등록
    setupApplicationShortcuts();
    
    // 5. 글로벌 이미지 편집 단축키 등록
    setupImageEditingShortcuts();
    
    // 6. 모델 탐색기 패널 생성
    createModelExplorerPanel();
    
    // 7. 파라미터 패널 생성
    createParametersPanel();
    
    // 8. 멀티 디테일러 패널 생성
    createMultiDetailerPanel();
    
    // 9. LoRA 선택기 패널 생성
    createLoRAPanel();
    
    // 10. 통합 생성 패널 생성
    createGenerationPanel();

    console.log('Canvas Studio initialized successfully');
});

// 애플리케이션 단축키 설정
function setupApplicationShortcuts() {
    // ESC 키 - 모든 모드 종료 (낮은 우선순위로 설정)
    registerShortcut('Escape', (e) => {
        console.log('ESC pressed - General exit handler');
        // 다른 컴포넌트에서 처리되지 않은 경우만 여기서 처리
        // e.defaultPrevented가 true면 이미 다른 곳에서 처리됨
        if (!e.defaultPrevented) {
            console.log('No specific handler found, executing general ESC behavior');
        }
    }, {}, 'Exit all modes');

    // F11 키 - 전체화면 토글 (허용)
    registerShortcut('F11', (e) => {
        console.log('F11 pressed - Toggling fullscreen');
        // 브라우저의 기본 전체화면 기능 허용
        e.preventDefault = () => {}; // preventDefault 비활성화
    }, {}, 'Toggle fullscreen');

    console.log('Application shortcuts registered');
}

// 글로벌 이미지 편집 단축키 설정
function setupImageEditingShortcuts() {
    // T키 - 선택된 이미지를 트랜스폼 모드로 전환
    registerShortcut('t', (e) => {
        console.log('T key pressed - checking for selected image');
        
        const stage = getStage();
        if (!stage) {
            console.log('No stage available');
            return;
        }
        
        // 현재 선택된 이미지 찾기
        const selectedImage = findSelectedImage(stage);
        
        if (selectedImage) {
            console.log('Found selected image');
            
            // 이미 트랜스폼 모드가 활성화되어 있다면 토글
            if (isTransformModeActive()) {
                console.log('Transform mode active - toggling transformer');
                toggleTransformerVisibility();
            } else {
                console.log('Starting new transform mode');
                startTransformMode(selectedImage);
            }
            e.preventDefault();
        } else {
            console.log('No image selected for transform');
        }
    }, {}, 'Transform selected image');
    
    console.log('Image editing shortcuts registered');
}

// 선택된 이미지 찾기 함수
function findSelectedImage(stage) {
    console.log('🔎 findSelectedImage() called');
    
    // 캔버스에서 추적중인 선택된 이미지만 사용
    const selectedImage = getSelectedImage();
    console.log('🔎 getSelectedImage() returned:', selectedImage);
    
    if (selectedImage) {
        console.log('✅ Using canvas selected image:', selectedImage);
        return selectedImage;
    }
    
    // FALLBACK: 하이라이트된 이미지 찾기 (만약 선택이 손실된 경우)
    console.log('🔎 Fallback: searching for highlighted image...');
    const layer = getLayer();
    if (layer) {
        const selectionHighlight = layer.findOne('.selection-highlight');
        if (selectionHighlight) {
            // 하이라이트에 저장된 이미지 참조 확인
            if (selectionHighlight._selectedImageRef) {
                console.log('📍 Found highlighted image reference as fallback:', selectionHighlight._selectedImageRef);
                return selectionHighlight._selectedImageRef;
            }
            
            // 하이라이트 근처의 이미지 찾기 (fallback의 fallback)
            const images = layer.find('Image');
            for (const image of images) {
                const imageBox = image.getClientRect();
                const highlightBox = selectionHighlight.getClientRect();
                
                // 하이라이트와 이미지 위치가 일치하는지 확인
                if (Math.abs(imageBox.x - highlightBox.x) < 5 && 
                    Math.abs(imageBox.y - highlightBox.y) < 5) {
                    console.log('📍 Found highlighted image by position as fallback:', image);
                    return image;
                }
            }
        }
    }
    
    console.log('❌ No image selected - please click on an image first');
    return null;
}

// 트랜스폼 핸들 가시성 토글
function toggleTransformerVisibility() {
    const transformer = getTransformer();
    if (!transformer) {
        console.log('No transformer available');
        return;
    }
    
    const isVisible = transformer.visible();
    transformer.visible(!isVisible);
    
    const layer = getLayer();
    if (layer) {
        layer.batchDraw();
    }
    
    console.log(isVisible ? 'Transformer hidden' : 'Transformer visible');
}

// ============================================================================
// SYMMETRIC PANEL POSITIONING SYSTEM
// ============================================================================
// 4개 패널을 중앙 기점으로 좌우 대칭 배치하고 화면 끝에 스냅

/**
 * 화면 크기와 패널 개수에 따라 대칭 위치 계산
 * @returns {Object} 각 패널의 초기 위치 좌표
 */
function calculateSymmetricPositions() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 패널 기본 크기
    const panelWidth = 320;
    const panelHeight = 420;
    
    // 화면 가장자리 여백
    const edgeMargin = 30;
    
    // 수직 중앙 위치 계산 (패널 2개가 세로로 배치)
    const centerY = (viewportHeight - (panelHeight * 2 + 20)) / 2; // 20px 간격
    
    // 좌측 패널들 (화면 왼쪽 끝)
    const leftX = edgeMargin;
    const leftTop = Math.max(50, centerY);
    const leftBottom = leftTop + panelHeight + 20;
    
    // 우측 패널들 (화면 오른쪽 끝)
    const rightX = viewportWidth - panelWidth - edgeMargin;
    const rightTop = Math.max(50, centerY);
    const rightBottom = rightTop + panelHeight + 20;
    
    return {
        modelExplorer: { x: leftX, y: leftTop },
        parameters: { x: leftX, y: leftBottom },
        loraSelector: { x: rightX, y: rightTop },
        multiDetailer: { x: rightX, y: rightBottom }
    };
}

/**
 * 창 크기 변경 시 패널 위치 재조정 (화면 끝 스냅 유지)
 */
function adjustPanelsOnResize() {
    const positions = calculateSymmetricPositions();
    const panelInstances = getAllPanels();
    
    panelInstances.forEach(panel => {
        let newPosition = null;
        
        switch(panel.id) {
            case 'model-explorer-panel':
                newPosition = positions.modelExplorer;
                break;
            case 'parameters-panel':
                newPosition = positions.parameters;
                break;
            case 'lora-selector-panel':
                newPosition = positions.loraSelector;
                break;
            case 'multi-detailer-panel':
                newPosition = positions.multiDetailer;
                break;
        }
        
        if (newPosition) {
            panel.setPosition(newPosition.x, newPosition.y);
        }
    });
}

// 창 크기 변경 이벤트 리스너 등록
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(adjustPanelsOnResize, 250); // 디바운스
});

// 모델 탐색기 패널 생성
function createModelExplorerPanel() {
    const modelExplorer = new ModelExplorerComponent();
    const positions = calculateSymmetricPositions();
    
    const modelExplorerPanel = new FloatingPanel({
        id: 'model-explorer-panel',
        title: 'Model Explorer',
        x: positions.modelExplorer.x,
        y: positions.modelExplorer.y,
        width: 320,
        height: 420,
        markingColor: '#4a5568',
        resizable: true,
        draggable: true
    });
    
    // 컴포넌트를 패널에 추가 (올바른 생명주기 처리)
    modelExplorerPanel.addComponent('modelExplorer', modelExplorer);
    
    console.log('Model Explorer panel created');
}

// 파라미터 패널 생성
function createParametersPanel() {
    const parameters = new ParametersComponent();
    const positions = calculateSymmetricPositions();
    
    const parametersPanel = new FloatingPanel({
        id: 'parameters-panel',
        title: 'Parameters',
        x: positions.parameters.x,
        y: positions.parameters.y,
        width: 320,
        height: 420,
        markingColor: '#e67e22',
        resizable: true,
        draggable: true
    });
    
    // 컴포넌트를 패널에 추가 (올바른 생명주기 처리)
    parametersPanel.addComponent('parameters', parameters);
    
    console.log('Parameters panel created');
}

// 멀티 디테일러 패널 생성
function createMultiDetailerPanel() {
    const multiDetailer = new MultiDetailerComponent();
    const positions = calculateSymmetricPositions();
    
    const multiDetailerPanel = new FloatingPanel({
        id: 'multi-detailer-panel',
        title: 'Multi Detailer',
        x: positions.multiDetailer.x,
        y: positions.multiDetailer.y,
        width: 320,
        height: 420,
        markingColor: '#9c27b0', // 보라색 테마
        resizable: true,
        draggable: true
    });
    
    // 컴포넌트를 패널에 추가 (올바른 생명주기 처리)
    multiDetailerPanel.addComponent('multiDetailer', multiDetailer);
    
    console.log('Multi-detailer panel created');
}

// LoRA 선택기 패널 생성
function createLoRAPanel() {
    const loraSelector = new LoRASelectorComponent();
    const positions = calculateSymmetricPositions();
    
    const loraPanel = new FloatingPanel({
        id: 'lora-selector-panel',
        title: '🎨 LoRA Selector',
        x: positions.loraSelector.x,
        y: positions.loraSelector.y,
        width: 320,
        height: 420,
        markingColor: '#9b59b6', // 보라색 테마
        resizable: true,
        draggable: true
    });
    
    // 컴포넌트를 패널에 추가
    loraPanel.addComponent('loraSelector', loraSelector);
    
    console.log('LoRA Selector panel created');
}

// 통합 생성 패널 생성 (하단 고정)
function createGenerationPanel() {
    const generationPanel = new GenerationPanel();
    
    // 컨테이너 엘리먼트 가져오기
    const container = document.getElementById('generation-panel-container');
    if (!container) {
        console.error('Generation panel container not found');
        return;
    }
    
    // 패널 렌더링 및 컨테이너에 추가
    const panelElement = generationPanel.render();
    container.appendChild(panelElement);
    
    // 패널 초기화
    generationPanel.init();
    
    // 전역 참조 저장 (디버깅 및 외부 접근용)
    window.generationPanel = generationPanel;
    
    console.log('Generation panel created and initialized');
}
