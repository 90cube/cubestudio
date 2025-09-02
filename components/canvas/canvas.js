// components/canvas/canvas.js

let stage;
let layer;
let isPanning = false;
let lastPointerPosition;
let selectedImage = null; // 현재 선택된 이미지 추적

export function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with id #${containerId} not found.`);
        return;
    }

    // 1. Konva Stage 생성 (전체 화면)
    stage = new Konva.Stage({
        container: containerId,
        width: window.innerWidth,
        height: window.innerHeight,
        draggable: false, // 스테이지 자체 드래그 비활성화
    });

    layer = new Konva.Layer();
    stage.add(layer);

    // 무한 캔버스를 위한 배경 (매우 큰 사각형)
    const background = new Konva.Rect({
        x: -50000,
        y: -50000,
        width: 100000,
        height: 100000,
        fill: '#f0f0f0', // 연한 회색 배경
    });
    layer.add(background);
    layer.draw();

    // 창 크기 변경 시 스테이지 크기 조절
    window.addEventListener('resize', () => {
        stage.width(window.innerWidth);
        stage.height(window.innerHeight);
        layer.draw();
    });

    // 키보드 이벤트 (스페이스바 팬닝)
    setupKeyboardEvents(container);

    // 마우스 휠 줌
    setupWheelZoom();

    // 마우스 팬닝 (스페이스바 + 드래그)
    setupMousePanning();

    // 드래그 앤 드롭 이벤트 리스너 설정
    setupDragAndDrop();
    
    // 이미지 선택 추적 설정
    setupImageSelection();
}

// 키보드 이벤트 설정 (스페이스바 팬닝)
function setupKeyboardEvents(container) {
    let spacePressed = false;

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !spacePressed) {
            e.preventDefault();
            spacePressed = true;
            container.classList.add('panning');
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            spacePressed = false;
            isPanning = false;
            container.classList.remove('panning');
        }
    });
}

// 마우스 휠 줌 설정
function setupWheelZoom() {
    const scaleBy = 1.1;
    stage.on('wheel', (e) => {
        e.evt.preventDefault();

        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();

        const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
        };

        let direction = e.evt.deltaY > 0 ? -1 : 1;
        
        // 무한 줌을 위해 스케일 제한 제거
        const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

        stage.scale({ x: newScale, y: newScale });

        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };
        stage.position(newPos);
        layer.batchDraw();
    });
}

// 마우스 팬닝 설정
function setupMousePanning() {
    stage.on('mousedown touchstart', (e) => {
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            isPanning = true;
            lastPointerPosition = stage.getPointerPosition();
        }
    });

    stage.on('mousemove touchmove', (e) => {
        if (!isPanning) return;

        e.evt.preventDefault();
        const newPointerPosition = stage.getPointerPosition();
        
        const dx = newPointerPosition.x - lastPointerPosition.x;
        const dy = newPointerPosition.y - lastPointerPosition.y;

        stage.x(stage.x() + dx);
        stage.y(stage.y() + dy);
        layer.batchDraw();

        lastPointerPosition = newPointerPosition;
    });

    stage.on('mouseup touchend', () => {
        isPanning = false;
    });
}

// 드래그 앤 드롭 설정
function setupDragAndDrop() {
    const stageContainer = stage.container();
    
    stageContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    stageContainer.addEventListener('drop', (e) => {
        e.preventDefault();

        // 팬닝 모드에서는 드롭 비활성화
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            return;
        }

        // 마우스 포인터 위치 계산 (현재 뷰포트와 줌 레벨 고려)
        stage.setPointersPositions(e);
        const pos = stage.getPointerPosition();
        
        // 실제 캔버스 좌표로 변환
        const transform = stage.getAbsoluteTransform().copy();
        transform.invert();
        const realPos = transform.point(pos);

        // 드롭된 파일 처리
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = () => {
                    const img = new window.Image();
                    img.src = reader.result;
                    img.onload = () => {
                        addImageToCanvas(img, realPos.x, realPos.y);
                    };
                };
                reader.readAsDataURL(file);
            }
        }
    });
}

/**
 * 캔버스에 이미지를 추가하는 함수
 * @param {Image} imageObject - JavaScript Image 객체
 * @param {number} x - 이미지가 추가될 x 좌표
 * @param {number} y - 이미지가 추가될 y 좌표
 */
function addImageToCanvas(imageObject, x, y) {
    const konvaImage = new Konva.Image({
        image: imageObject,
        x: x,
        y: y,
        draggable: true, // 드래그 가능하도록 설정
    });

    // 이미지의 중심이 마우스 포인터 위치에 오도록 좌표 보정
    konvaImage.offsetX(konvaImage.width() / 2);
    konvaImage.offsetY(konvaImage.height() / 2);

    layer.add(konvaImage);
    layer.batchDraw();
}

// 외부에서 stage와 layer에 접근할 수 있도록 export
export function getStage() {
    return stage;
}

export function getLayer() {
    return layer;
}

// 이미지 선택 추적 설정
function setupImageSelection() {
    stage.on('click tap', (e) => {
        // 팬닝 모드에서는 선택 비활성화
        if (document.querySelector('#canvas-container').classList.contains('panning')) {
            return;
        }
        
        const clickedNode = e.target;
        
        // 이미지가 클릭되었으면 선택 상태로 설정
        if (clickedNode.className === 'Image') {
            selectedImage = clickedNode;
            console.log('Image selected:', selectedImage);
        } else if (clickedNode.className === 'Rect') {
            // 배경을 클릭했을 때만 선택 해제 (다른 요소는 무시)
            selectedImage = null;
            console.log('Image selection cleared');
        }
    });
}

// 현재 선택된 이미지 반환
export function getSelectedImage() {
    return selectedImage;
}

// 선택된 이미지 설정
export function setSelectedImage(image) {
    selectedImage = image;
}
