// components/elementsMenu/elementsMenu.js

let elementsMenuContainer = null;
let isDragging = false;
let isMinimized = false;

export function init(containerId) {
    // 컨테이너는 실제로 사용하지 않지만 API 일관성을 위해 유지
}

/**
 * 엘리먼츠 컨텍스트 메뉴를 표시합니다
 * @param {number} x - 메뉴가 표시될 x 좌표
 * @param {number} y - 메뉴가 표시될 y 좌표
 */
export function showElementsMenu(x = 100, y = 100) {
    // 기존 메뉴가 있다면 제거
    hideElementsMenu();
    
    // 메뉴 컨테이너 생성
    elementsMenuContainer = document.createElement('div');
    elementsMenuContainer.id = 'elements-menu';
    elementsMenuContainer.className = 'elements-menu-container';
    
    // 초기 위치 설정
    elementsMenuContainer.style.left = `${x}px`;
    elementsMenuContainer.style.top = `${y}px`;
    
    // 메뉴 HTML 구조 생성
    elementsMenuContainer.innerHTML = `
        <div class="elements-menu-window">
            <div class="elements-menu-header">
                <div class="elements-menu-title">
                    <span class="menu-icon">●</span>
                    <span>Elements</span>
                </div>
                <div class="elements-menu-controls">
                    <button class="control-btn refresh-btn" title="새로고침">
                        <span class="control-icon">↻</span>
                    </button>
                    <button class="control-btn minimize-btn" title="접기">
                        <span class="control-icon">−</span>
                    </button>
                    <button class="control-btn close-btn" title="닫기">
                        <span class="control-icon">×</span>
                    </button>
                </div>
            </div>
            <div class="elements-menu-content">
                <div class="elements-grid-container panel-scrollbar">
                    <div class="elements-grid" id="elements-grid">
                        <div class="loading-message">로딩 중...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // 문서에 추가
    document.body.appendChild(elementsMenuContainer);
    
    // 이벤트 리스너 설정
    setupElementsMenuEvents();
    
    // 엘리먼츠 이미지 로드
    loadElementsImages();
    
    console.log('📦 Elements menu opened at:', { x, y });
}

/**
 * 엘리먼츠 컨텍스트 메뉴를 숨깁니다
 */
export function hideElementsMenu() {
    if (elementsMenuContainer) {
        elementsMenuContainer.remove();
        elementsMenuContainer = null;
        isMinimized = false;
        console.log('📦 Elements menu closed');
    }
}

/**
 * 메뉴 이벤트 리스너 설정
 */
function setupElementsMenuEvents() {
    if (!elementsMenuContainer) return;
    
    const header = elementsMenuContainer.querySelector('.elements-menu-header');
    const refreshBtn = elementsMenuContainer.querySelector('.refresh-btn');
    const minimizeBtn = elementsMenuContainer.querySelector('.minimize-btn');
    const closeBtn = elementsMenuContainer.querySelector('.close-btn');
    const content = elementsMenuContainer.querySelector('.elements-menu-content');
    
    // 드래그 이벤트 설정
    setupDragEvents(header);
    
    // 컨트롤 버튼 이벤트
    refreshBtn.addEventListener('click', () => {
        console.log('🔄 Refreshing elements...');
        loadElementsImages();
    });
    
    minimizeBtn.addEventListener('click', () => {
        isMinimized = !isMinimized;
        content.style.display = isMinimized ? 'none' : 'block';
        minimizeBtn.title = isMinimized ? '펼치기' : '접기';
        minimizeBtn.querySelector('.control-icon').textContent = isMinimized ? '+' : '−';
        console.log('📦 Elements menu', isMinimized ? 'minimized' : 'restored');
    });
    
    closeBtn.addEventListener('click', () => {
        hideElementsMenu();
    });
    
    // ESC 키로 메뉴 닫기
    const escapeHandler = (e) => {
        if (e.key === 'Escape' && elementsMenuContainer) {
            hideElementsMenu();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

/**
 * 창 드래그 이벤트 설정
 */
function setupDragEvents(header) {
    let startX, startY, initialX, initialY;
    
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.elements-menu-controls')) return; // 컨트롤 버튼은 드래그 제외
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = elementsMenuContainer.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        
        header.classList.add('dragging');
        
        // 마우스 이동 및 해제 이벤트를 document에 등록
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', handleDragEnd);
        
        e.preventDefault();
    });
    
    function handleDrag(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        const newX = Math.max(0, Math.min(window.innerWidth - 900, initialX + deltaX));
        const newY = Math.max(0, Math.min(window.innerHeight - 100, initialY + deltaY));
        
        elementsMenuContainer.style.left = `${newX}px`;
        elementsMenuContainer.style.top = `${newY}px`;
    }
    
    function handleDragEnd() {
        isDragging = false;
        header.classList.remove('dragging');
        
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);
    }
}

/**
 * 엘리먼츠 이미지들을 로드하여 그리드에 표시
 */
async function loadElementsImages() {
    const grid = document.getElementById('elements-grid');
    if (!grid) return;
    
    try {
        // 로딩 메시지 표시
        grid.innerHTML = '<div class="loading-message">엘리먼츠를 로딩 중...</div>';
        
        // 엘리먼츠 이미지 경로 정의
        const elementsPath = './models/presets/elements/';
        
        // 알려진 엘리먼츠 파일명들 (실제 파일 목록)
        const elementFiles = [
            '얇은집중선.png', '중간집중선.png', '굵은집중선.png',
            '생각풍선.png', '스크린톤.png', '샤방샤방.png',
            '충격배경.png', '고뇌배경.png', '작은스크린톤.png',
            '그라데이션스크린톤.png', '중독배경.png', '현혹배경.png', '폭발배경.png',
            '1.png', '2.png', '3.png', '4.png', '5.png',
            '6.png', '7.png', '9.png', '10.png'
        ];
        
        // 그리드 초기화
        grid.innerHTML = '';
        
        // 각 엘리먼츠 이미지에 대한 카드 생성
        for (const fileName of elementFiles) {
            const elementCard = createElementCard(fileName, elementsPath + fileName);
            grid.appendChild(elementCard);
        }
        
        console.log('📦 Loaded', elementFiles.length, 'element images');
        
    } catch (error) {
        console.error('❌ Error loading elements:', error);
        grid.innerHTML = '<div class="error-message">엘리먼츠를 로드할 수 없습니다.</div>';
    }
}

/**
 * 개별 엘리먼츠 카드 생성
 */
function createElementCard(fileName, filePath) {
    const card = document.createElement('div');
    card.className = 'element-card';
    card.draggable = true;
    
    // 파일명에서 확장자 제거하여 이름 생성
    const displayName = fileName.replace('.png', '');
    
    card.innerHTML = `
        <div class="element-preview">
            <img src="${filePath}" alt="${displayName}" loading="lazy" draggable="false">
            <div class="element-overlay">
                <span class="drag-hint">드래그하여 추가</span>
            </div>
        </div>
        <div class="element-name">${displayName}</div>
    `;
    
    // 드래그 이벤트 설정
    setupElementDragEvents(card, filePath, displayName);
    
    return card;
}

/**
 * 엘리먼츠 카드의 드래그 이벤트 설정
 */
function setupElementDragEvents(card, filePath, displayName) {
    card.addEventListener('dragstart', (e) => {
        // 드래그 데이터 설정
        e.dataTransfer.setData('text/plain', filePath);
        e.dataTransfer.setData('application/element-data', JSON.stringify({
            path: filePath,
            name: displayName,
            type: 'element'
        }));
        
        // 드래그 중 시각적 피드백
        card.classList.add('dragging');
        
        console.log('🎯 Started dragging element:', displayName);
    });
    
    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        console.log('🎯 Finished dragging element');
    });
    
    // 더블클릭으로 바로 중앙에 추가
    card.addEventListener('dblclick', () => {
        addElementToCanvasCenter(filePath, displayName);
    });
}

/**
 * 엘리먼츠를 캔버스 중앙에 추가
 */
function addElementToCanvasCenter(filePath, displayName) {
    const img = new Image();
    img.onload = () => {
        // 캔버스 중앙 좌표 계산
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        // 기존의 addImageToCanvas 함수 import 필요
        // 임시로 여기서 직접 구현
        if (window.addImageToCanvasFromElementsMenu) {
            window.addImageToCanvasFromElementsMenu(img, centerX, centerY);
            console.log('📦 Added element to canvas center:', displayName);
        } else {
            console.error('❌ Canvas function not available');
        }
    };
    img.onerror = () => {
        console.error('❌ Failed to load element image:', filePath);
    };
    img.src = filePath;
}

/**
 * 엘리먼츠 메뉴가 열려있는지 확인
 */
export function isElementsMenuOpen() {
    return elementsMenuContainer !== null;
}