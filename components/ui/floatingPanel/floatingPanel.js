// components/ui/floatingPanel/floatingPanel.js

/**
 * 재사용 가능한 플로팅 패널 시스템
 * 드래그, 리사이즈, 마킹 탭, 컬러 피커 기능 포함
 */

// ============================================================================
// FLOATING PANEL SYSTEM - INSTANCE MANAGEMENT
// ============================================================================
// 이 시스템은 패널과 패널이 최소화된 점들을 관리합니다.
// 브러쉬나 drawing 도구와 충돌하지 않도록 명명 규칙을 따릅니다.

let panelInstances = new Map(); // 활성 패널 인스턴스 관리
let panelDotInstances = new Map(); // 최소화된 패널 점 인스턴스 관리  
let panelIdCounter = 0; // 고유 패널 ID 생성용 카운터

// ============================================================================
// GRID SNAP SYSTEM
// ============================================================================
// 패널과 점들을 10px 그리드에 정렬하는 시스템

const PANEL_GRID_SIZE = 10; // 그리드 간격 (10px)

/**
 * 값을 그리드에 스냅하는 유틸리티 함수
 * @param {number} value - 스냅할 값
 * @returns {number} 그리드에 정렬된 값
 */
function snapPanelToGrid(value) {
    return Math.round(value / PANEL_GRID_SIZE) * PANEL_GRID_SIZE;
}

// ============================================================================
// FLOATING PANEL DOT CLASS - MINIMIZED PANEL REPRESENTATION
// ============================================================================
// 패널이 최소화될 때 생성되는 점(dot) 클래스
// 브러쉬 시스템과 구분하기 위해 "Panel" 접두사 사용
// 
// 주요 기능:
// - 패널 최소화 시 색상 점으로 변환
// - 드래그 가능 (10px 그리드 스냅)
// - 클릭으로 원래 패널 복원
// - 다양한 모양 지원 (circle, square, diamond, pill, hexagon)

class FloatingPanelDot {
    constructor(panelData, options = {}) {
        this.panelData = panelData;
        this.id = panelData.id;
        this.x = panelData.x;
        this.y = panelData.y;
        this.color = panelData.markingColor;
        this.title = panelData.title;
        this.style = options.style || 'circle'; // circle, square, diamond, pill, hexagon
        this.size = options.size || 24;
        
        this.element = null;
        this.isDragging = false;
        
        this.createPanelDotElement();
        this.setupEventListeners();
        panelDotInstances.set(this.id, this);
        console.log('FloatingPanelDot created:', this.id, 'at position', this.x, this.y);
    }
    
    /**
     * 패널 점 DOM 요소 생성
     * CSS 클래스명에 "panel-dot"을 사용하여 브러쉬 시스템과 구분
     */
    createPanelDotElement() {
        this.element = document.createElement('div');
        this.element.className = 'floating-panel-dot'; // 브러쉬와 구분되는 클래스명
        this.element.id = `panel-dot-${this.id}`;
        
        // 기본 스타일 적용
        this.applyPanelDotBaseStyle();
        
        // 스타일별 특수 형태 적용
        this.applyPanelDotShapeStyle();
        
        this.element.title = `Click to restore panel: ${this.title}`;
        
        document.body.appendChild(this.element);
    }
    
    /**
     * 패널 점 기본 스타일 적용
     * 위치, 크기, 색상 등 공통 스타일 설정
     */
    applyPanelDotBaseStyle() {
        this.element.style.cssText = `
            position: fixed;
            left: ${this.x}px;
            top: ${this.y}px;
            width: ${this.size}px;
            height: ${this.size}px;
            background: ${this.color};
            cursor: pointer;
            z-index: 1002;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border: 3px solid rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
        `;
    }
    
    /**
     * 패널 점 모양별 특수 스타일 적용
     * circle, square, diamond, pill, hexagon 등 지원
     */
    applyPanelDotShapeStyle() {
        const styles = this.getPanelDotShapeStyles();
        Object.assign(this.element.style, styles.main);
        
        // 내부 아이콘 생성 (복원 힌트)
        if (styles.icon) {
            const icon = document.createElement('div');
            Object.assign(icon.style, styles.icon);
            this.element.appendChild(icon);
        }
    }
    
    /**
     * 패널 점 모양별 스타일 정의
     * @returns {Object} 메인 스타일과 아이콘 스타일을 포함한 객체
     */
    getPanelDotShapeStyles() {
        const iconBase = {
            background: 'rgba(255, 255, 255, 0.9)',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
        };
        
        switch (this.style) {
            case 'circle':
                return {
                    main: {
                        borderRadius: '50%',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                    },
                    icon: {
                        ...iconBase,
                        width: '8px',
                        height: '8px',
                        borderRadius: '2px'
                    }
                };
                
            case 'square':
                return {
                    main: {
                        borderRadius: '4px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                    },
                    icon: {
                        ...iconBase,
                        width: '6px',
                        height: '6px',
                        borderRadius: '1px'
                    }
                };
                
            case 'diamond':
                return {
                    main: {
                        borderRadius: '2px',
                        transform: 'rotate(45deg)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                    },
                    icon: {
                        ...iconBase,
                        width: '8px',
                        height: '8px',
                        borderRadius: '1px',
                        transform: 'translate(-50%, -50%) rotate(-45deg)'
                    }
                };
                
            case 'pill':
                return {
                    main: {
                        borderRadius: `${this.size / 2}px`,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                    },
                    icon: {
                        ...iconBase,
                        width: '10px',
                        height: '4px',
                        borderRadius: '2px'
                    }
                };
                
            case 'hexagon':
                return {
                    main: {
                        clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                    },
                    icon: {
                        ...iconBase,
                        width: '6px',
                        height: '6px',
                        clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'
                    }
                };
                
            default:
                return this.getPanelDotShapeStyles.call({...this, style: 'circle'});
        }
    }
    
    setupEventListeners() {
        // 호버 효과
        this.element.addEventListener('mouseenter', () => {
            this.element.style.transform = 'scale(1.2)';
            this.element.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
        });
        
        this.element.addEventListener('mouseleave', () => {
            if (!this.isDragging) {
                this.element.style.transform = 'scale(1)';
                this.element.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
            }
        });
        
        // 클릭으로 패널 복원
        this.element.addEventListener('click', (e) => {
            console.log('Dot clicked! isDragging:', this.isDragging);
            if (!this.isDragging) {
                console.log('Restoring panel...');
                this.restorePanel();
            } else {
                console.log('Ignoring click due to dragging');
            }
        });
        
        // 드래그 기능
        this.setupDragFunctionality();
    }
    
    setupDragFunctionality() {
        let startX, startY, initialX, initialY;
        let hasMoved = false;
        
        this.element.addEventListener('mousedown', (e) => {
            console.log('Dot mousedown');
            this.isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            initialX = this.x;
            initialY = this.y;
            
            this.element.style.zIndex = '1003';
            this.element.style.transform = 'scale(1.3)';
            document.body.style.userSelect = 'none';
            
            const handleMouseMove = (e) => {
                if (!this.isDragging) return;
                
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                // 움직임 감지
                if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                    hasMoved = true;
                }
                
                this.x = snapPanelToGrid(initialX + deltaX);
                this.y = snapPanelToGrid(initialY + deltaY);
                
                this.element.style.left = this.x + 'px';
                this.element.style.top = this.y + 'px';
                
                // 패널 데이터도 업데이트
                this.panelData.x = this.x;
                this.panelData.y = this.y;
            };
            
            const handleMouseUp = () => {
                this.element.style.zIndex = '1002';
                this.element.style.transform = 'scale(1)';
                document.body.style.userSelect = '';
                
                console.log('Mouse up, was dragging?', hasMoved);
                
                // 움직임이 없었으면 즉시 드래그 상태 해제
                if (!hasMoved) {
                    this.isDragging = false;
                } else {
                    // 움직임이 있었으면 잠깐 기다린 후 해제
                    setTimeout(() => {
                        this.isDragging = false;
                    }, 50);
                }
                
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }
    
    restorePanel() {
        // 패널 복원 (컴포넌트 제외한 기본 옵션만)
        const options = {
            id: this.panelData.id,
            title: this.panelData.title,
            width: this.panelData.width,
            height: this.panelData.height,
            x: this.panelData.x,
            y: this.panelData.y,
            markingColor: this.panelData.markingColor,
            resizable: this.panelData.resizable,
            draggable: this.panelData.draggable,
            dotStyle: this.panelData.dotStyle,
            dotSize: this.panelData.dotSize
        };
        
        const restoredPanel = new FloatingPanel(options);
        
        // 저장된 컴포넌트들 복원
        if (this.panelData.components && this.panelData.components.size > 0) {
            this.panelData.components.forEach((component, componentId) => {
                // 컴포넌트를 새로 추가 (render 메서드 다시 호출됨)
                restoredPanel.addComponent(componentId, component);
            });
        }
        
        
        // 복원 애니메이션
        restoredPanel.element.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        restoredPanel.element.style.transform = 'scale(0.8)';
        restoredPanel.element.style.opacity = '0.8';
        
        setTimeout(() => {
            restoredPanel.element.style.transform = 'scale(1)';
            restoredPanel.element.style.opacity = '1';
            
            setTimeout(() => {
                restoredPanel.element.style.transition = '';
            }, 400);
        }, 50);
        
        // 점 제거
        this.destroy();
        
        // 이벤트 발생
        document.dispatchEvent(new CustomEvent('floatingPanel:restored', {
            detail: { panelId: this.id, panel: restoredPanel }
        }));
        
        return restoredPanel;
    }
    
    destroy() {
        if (this.element && this.element.parentNode) {
            // 페이드 아웃 효과
            this.element.style.opacity = '0';
            this.element.style.transform = 'scale(0.5)';
            
            setTimeout(() => {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
            }, 300);
        }
        
        panelDotInstances.delete(this.id);
    }
    
    updateColor(color) {
        this.color = color;
        this.panelData.markingColor = color;
        this.element.style.background = color;
    }
}

export class FloatingPanel {
    constructor(options = {}) {
        this.id = options.id || `floating-panel-${++panelIdCounter}`;
        this.title = options.title || 'Panel';
        this.width = options.width || 300;
        this.height = options.height || 400;
        this.x = options.x || 100;
        this.y = options.y || 100;
        this.markingColor = options.markingColor || '#3498db';
        this.resizable = options.resizable !== false;
        this.draggable = options.draggable !== false;
        this.dotStyle = options.dotStyle || 'circle'; // 점으로 변환 시 스타일
        this.dotSize = options.dotSize || 24; // 점으로 변환 시 크기
        this.components = new Map(); // 패널 내 컴포넌트들
        
        this.element = null;
        this.isDragging = false;
        this.isResizing = false;
        
        this.init();
        panelInstances.set(this.id, this);
    }
    
    init() {
        this.createElement();
        this.setupPanelEventListeners();
        this.updateMarkingColor();
    }
    
    createElement() {
        // 메인 패널 컨테이너
        this.element = document.createElement('div');
        this.element.className = 'floating-panel';
        this.element.id = this.id;
        this.element.style.cssText = `
            position: fixed;
            left: ${this.x}px;
            top: ${this.y}px;
            width: ${this.width}px;
            height: ${this.height}px;
            background: rgba(255, 255, 255, 0.95);
            border: 1px solid #e1e8ed;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
            backdrop-filter: blur(8px);
            z-index: 1000;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            overflow: hidden;
            transition: all 0.3s ease;
            min-width: 250px;
            min-height: 200px;
        `;
        
        // 헤더 (마킹 탭 포함)
        this.headerElement = document.createElement('div');
        this.headerElement.className = 'panel-header';
        this.headerElement.style.cssText = `
            height: 44px;
            background: linear-gradient(135deg, ${this.markingColor}, ${this.adjustColorBrightness(this.markingColor, -20)});
            border-radius: 11px 11px 0 0;
            display: flex;
            align-items: center;
            padding: 0 16px;
            cursor: ${this.draggable ? 'move' : 'default'};
            position: relative;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        `;
        
        // 마킹 탭 (컬러 피커 트리거)
        this.markingTab = document.createElement('div');
        this.markingTab.className = 'marking-tab';
        this.markingTab.style.cssText = `
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.9);
            cursor: pointer;
            margin-right: 12px;
            transition: all 0.2s ease;
            border: 2px solid rgba(255, 255, 255, 0.7);
        `;
        this.markingTab.title = 'Click to change panel color';
        
        // 제목
        this.titleElement = document.createElement('span');
        this.titleElement.textContent = this.title;
        this.titleElement.style.cssText = `
            color: white;
            font-weight: 600;
            font-size: 14px;
            flex: 1;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        `;
        
        // 컨트롤 버튼들
        this.controlsElement = document.createElement('div');
        this.controlsElement.className = 'panel-controls';
        this.controlsElement.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
        `;
        
        // 점으로 최소화 버튼 (항상 표시)
        this.minimizeBtn = document.createElement('button');
        this.minimizeBtn.innerHTML = '●';
        this.minimizeBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        this.minimizeBtn.title = 'Minimize to dot';
        this.controlsElement.appendChild(this.minimizeBtn);
        
        // 닫기 버튼 (완전 삭제)
        this.closeBtn = document.createElement('button');
        this.closeBtn.innerHTML = '×';
        this.closeBtn.style.cssText = `
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 18px;
            font-weight: bold;
            transition: all 0.2s ease;
        `;
        this.closeBtn.title = 'Close permanently';
        
        // 헤더 조립
        this.headerElement.appendChild(this.markingTab);
        this.headerElement.appendChild(this.titleElement);
        this.headerElement.appendChild(this.controlsElement);
        
        // 본문 영역
        this.bodyElement = document.createElement('div');
        this.bodyElement.className = 'panel-body';
        this.bodyElement.style.cssText = `
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: rgba(255, 255, 255, 0.9);
        `;
        
        // 리사이즈 핸들
        if (this.resizable) {
            this.resizeHandle = document.createElement('div');
            this.resizeHandle.className = 'resize-handle';
            this.resizeHandle.style.cssText = `
                position: absolute;
                right: 0;
                bottom: 0;
                width: 20px;
                height: 20px;
                cursor: nw-resize;
                background: linear-gradient(-45deg, transparent 0%, transparent 30%, ${this.markingColor} 30%, ${this.markingColor} 40%, transparent 40%, transparent 60%, ${this.markingColor} 60%, ${this.markingColor} 70%, transparent 70%);
                border-radius: 0 0 12px 0;
            `;
        }
        
        // 컬러 피커 (숨겨진 상태로 생성)
        this.colorPicker = document.createElement('input');
        this.colorPicker.type = 'color';
        this.colorPicker.value = this.markingColor;
        this.colorPicker.style.cssText = `
            position: absolute;
            opacity: 0;
            pointer-events: none;
        `;
        
        // 요소들 조립
        this.element.appendChild(this.headerElement);
        this.element.appendChild(this.bodyElement);
        if (this.resizable) {
            this.element.appendChild(this.resizeHandle);
        }
        this.element.appendChild(this.colorPicker);
        
        // DOM에 추가
        document.body.appendChild(this.element);
    }
    
    /**
     * 플로팅 패널 이벤트 리스너 설정
     * 색상 변경, 드래그, 리사이즈, 버튼 동작 등 설정
     */
    setupPanelEventListeners() {
        // 마킹 탭 클릭 - 컬러 피커 열기
        this.markingTab.addEventListener('click', (e) => {
            e.stopPropagation();
            this.colorPicker.click();
        });
        
        // 컬러 피커 변경
        this.colorPicker.addEventListener('change', (e) => {
            this.setMarkingColor(e.target.value);
        });
        
        // 마킹 탭 호버 효과
        this.markingTab.addEventListener('mouseenter', () => {
            this.markingTab.style.transform = 'scale(1.1)';
            this.markingTab.style.boxShadow = '0 0 12px rgba(255, 255, 255, 0.6)';
        });
        
        this.markingTab.addEventListener('mouseleave', () => {
            this.markingTab.style.transform = 'scale(1)';
            this.markingTab.style.boxShadow = 'none';
        });
        
        // 드래그 기능
        if (this.draggable) {
            this.setupPanelDragFunctionality();
        }
        
        // 리사이즈 기능
        if (this.resizable) {
            this.setupPanelResizeFunctionality();
        }
        
        // 점으로 최소화 기능
        this.minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.minimizeToPanelDot();
        });
        
        // 완전 삭제 기능
        this.closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.destroy();
        });
        
        // 버튼 호버 효과
        [this.minimizeBtn, this.closeBtn].filter(Boolean).forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(255, 255, 255, 0.3)';
                if (btn === this.minimizeBtn) {
                    btn.style.transform = 'scale(1.1)';
                }
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(255, 255, 255, 0.2)';
                if (btn === this.minimizeBtn) {
                    btn.style.transform = 'scale(1)';
                }
            });
        });
    }
    
    /**
     * 플로팅 패널 드래그 기능 설정
     * 헤더 영역을 드래그하여 패널 위치 변경 가능
     * 10px 단위 그리드 스냅 적용
     */
    setupPanelDragFunctionality() {
        let startX, startY, initialX, initialY;
        
        this.headerElement.addEventListener('mousedown', (e) => {
            if (e.target === this.markingTab || e.target === this.collapseBtn || e.target === this.closeBtn) {
                return;
            }
            
            this.isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialX = this.x;
            initialY = this.y;
            
            this.element.style.zIndex = '1001';
            document.body.style.userSelect = 'none';
            
            const handleMouseMove = (e) => {
                if (!this.isDragging) return;
                
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                this.x = snapPanelToGrid(initialX + deltaX);
                this.y = snapPanelToGrid(initialY + deltaY);
                
                this.element.style.left = this.x + 'px';
                this.element.style.top = this.y + 'px';
            };
            
            const handleMouseUp = () => {
                this.isDragging = false;
                this.element.style.zIndex = '1000';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }
    
    /**
     * 플로팅 패널 리사이즈 기능 설정
     * 우하단 코너의 리사이즈 핸들을 드래그하여 크기 조절 가능
     * 10px 단위 그리드 스냅 적용
     */
    setupPanelResizeFunctionality() {
        let startX, startY, initialWidth, initialHeight;
        
        this.resizeHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            initialWidth = this.width;
            initialHeight = this.height;
            
            document.body.style.userSelect = 'none';
            
            const handleMouseMove = (e) => {
                if (!this.isResizing) return;
                
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                this.width = Math.max(250, snapPanelToGrid(initialWidth + deltaX));
                this.height = Math.max(200, snapPanelToGrid(initialHeight + deltaY));
                
                this.element.style.width = this.width + 'px';
                this.element.style.height = this.height + 'px';
            };
            
            const handleMouseUp = () => {
                this.isResizing = false;
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }
    
    // 마킹 컬러 변경
    setMarkingColor(color) {
        this.markingColor = color;
        this.updateMarkingColor();
        this.colorPicker.value = color;
        
        // 커스텀 이벤트 발생
        this.dispatchEvent('colorChanged', { color });
    }
    
    updateMarkingColor() {
        const darkerColor = this.adjustColorBrightness(this.markingColor, -20);
        this.headerElement.style.background = `linear-gradient(135deg, ${this.markingColor}, ${darkerColor})`;
        
        if (this.resizeHandle) {
            this.resizeHandle.style.background = `linear-gradient(-45deg, transparent 0%, transparent 30%, ${this.markingColor} 30%, ${this.markingColor} 40%, transparent 40%, transparent 60%, ${this.markingColor} 60%, ${this.markingColor} 70%, transparent 70%)`;
        }
    }
    
    // 색상 밝기 조절 유틸리티
    adjustColorBrightness(color, amount) {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * amount);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000
            + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100
            + (B < 255 ? B < 1 ? 0 : B : 255))
            .toString(16).slice(1);
    }
    
    
    // 컴포넌트 추가
    addComponent(componentId, component) {
        this.components.set(componentId, component);
        
        if (typeof component.render === 'function') {
            const componentElement = component.render();
            componentElement.dataset.componentId = componentId; // ID 저장
            this.bodyElement.appendChild(componentElement);
        } else if (component instanceof HTMLElement) {
            component.dataset.componentId = componentId; // ID 저장
            this.bodyElement.appendChild(component);
        }
        
        this.dispatchEvent('componentAdded', { componentId, component });
    }
    
    // 컴포넌트 제거
    removeComponent(componentId) {
        const component = this.components.get(componentId);
        if (component) {
            if (typeof component.destroy === 'function') {
                component.destroy();
            }
            this.components.delete(componentId);
            this.dispatchEvent('componentRemoved', { componentId });
        }
    }
    
    /**
     * 패널을 점으로 최소화
     * 패널 데이터를 보존하고 FloatingPanelDot 인스턴스 생성
     */
    minimizeToPanelDot() {
        // 패널 데이터 수집 (복원용)
        const panelData = {
            id: this.id,
            title: this.title,
            width: this.width,
            height: this.height,
            x: this.x,
            y: this.y,
            markingColor: this.markingColor,
            resizable: this.resizable,
            draggable: this.draggable,
            dotStyle: this.dotStyle,
            dotSize: this.dotSize,
            components: this.components // 컴포넌트 맵 직접 참조
        };
        
        // 닫기 애니메이션
        this.element.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        this.element.style.transform = 'scale(0.1)';
        this.element.style.opacity = '0';
        
        setTimeout(() => {
            // DOM에서 제거
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
            
            // 인스턴스 맵에서 제거
            panelInstances.delete(this.id);
            
            // 점으로 변환 (패널의 점 스타일 설정 사용)
            new FloatingPanelDot(panelData, { 
                style: this.dotStyle,
                size: this.dotSize 
            });
            
            this.dispatchEvent('minimizedToDot', { panelId: this.id, panelData });
        }, 400);
    }
    
    // 패널 완전 삭제 (복원 불가능)
    destroy() {
        // 컴포넌트들 정리
        this.components.forEach((component, componentId) => {
            this.removeComponent(componentId);
        });
        
        // 삭제 애니메이션
        this.element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        this.element.style.transform = 'scale(0.8)';
        this.element.style.opacity = '0';
        
        setTimeout(() => {
            // DOM에서 제거
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
            
            // 인스턴스 맵에서 제거
            panelInstances.delete(this.id);
            
            this.dispatchEvent('destroyed', { panelId: this.id });
        }, 300);
    }
    
    // 커스텀 이벤트 발생
    dispatchEvent(eventName, detail = {}) {
        const event = new CustomEvent(`floatingPanel:${eventName}`, {
            detail: { panelId: this.id, ...detail }
        });
        document.dispatchEvent(event);
    }
    
    // 제목 변경
    setTitle(title) {
        this.title = title;
        this.titleElement.textContent = title;
    }
    
    // 위치 설정
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
    }
    
    // 크기 설정
    setSize(width, height) {
        this.width = width;
        this.height = height;
        this.element.style.width = width + 'px';
        this.element.style.height = height + 'px';
    }
}

// 유틸리티 함수들
export function createFloatingPanel(options = {}) {
    return new FloatingPanel(options);
}

export function getPanelInstance(panelId) {
    return panelInstances.get(panelId);
}

export function getAllPanels() {
    return Array.from(panelInstances.values());
}

export function closePanelById(panelId) {
    const panel = panelInstances.get(panelId);
    if (panel) {
        panel.close();
    }
}

export function closeAllPanels() {
    panelInstances.forEach(panel => panel.close());
}

/**
 * 패널 점(Panel Dot) 관련 유틸리티 함수들
 * 미래 브러쉬/그리기 도구와의 충돌 방지를 위해 'panel' 접두사 사용
 */
export function getPanelDotInstance(dotId) {
    return panelDotInstances.get(dotId);
}

export function getAllPanelDots() {
    return Array.from(panelDotInstances.values());
}

export function restorePanelDotById(dotId) {
    const dot = panelDotInstances.get(dotId);
    if (dot) {
        return dot.restorePanel();
    }
    return null;
}

export function closeAllPanelDots() {
    panelDotInstances.forEach(dot => dot.destroy());
}

/**
 * 전체 플로팅 패널 시스템 정리
 * 모든 패널과 패널 점들을 제거
 */
export function clearAllPanelsAndDots() {
    closeAllPanels();
    closeAllPanelDots();
}