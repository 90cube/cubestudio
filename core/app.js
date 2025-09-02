import { init as initCanvas, getStage, getLayer, getSelectedImage } from '../components/canvas/canvas.js';
import { init as initImageEditor } from '../components/imageEditor/imageEditor.js';
import { init as initKeyboardManager, registerShortcut } from '../components/keyboardManager/keyboardManager.js';
import { startTransformMode, isTransformModeActive, getTransformer } from '../components/imageEditor/tools/transformer.js';
import { runFloatingPanelDemo } from '../components/ui/floatingPanel/panelDemo.js';

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
    
    // 6. 플로팅 패널 데모 실행
    setTimeout(() => {
        runFloatingPanelDemo();
    }, 100);

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
    // 캔버스에서 추적중인 선택된 이미지 사용
    const selectedImage = getSelectedImage();
    if (selectedImage) {
        console.log('Using canvas selected image:', selectedImage);
        return selectedImage;
    }
    
    // 선택된 이미지가 없으면 레이어의 첫 번째 이미지 사용 (fallback)
    const layer = getLayer();
    if (!layer) return null;
    
    const images = layer.find('Image');
    if (images.length > 0) {
        console.log('No selected image, using first image as fallback:', images[0]);
        return images[0];
    }
    
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
