// components/layerPanel/modules/layerItem.js

import { setLayerVisibility, setLayerOpacity, selectLayer, setLayerName } from './layerDataManager.js';

/**
 * 개별 레이어 아이템 UI 컴포넌트
 * 포토샵 스타일의 레이어 아이템을 생성하고 관리합니다.
 */

export class LayerItem {
    constructor(layerData, onUpdate) {
        this.layerData = layerData;
        this.onUpdate = onUpdate || (() => {});
        this.element = null;
        this.isNameEditing = false;
        
        this.createElement();
        this.setupEventListeners();
    }

    /**
     * 레이어 아이템 DOM 요소 생성
     */
    createElement() {
        this.element = document.createElement('div');
        this.element.className = 'layer-item';
        this.element.dataset.layerId = this.layerData.id;
        this.element.style.cssText = `
            display: flex;
            align-items: center;
            padding: 8px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            cursor: pointer;
            transition: all 0.2s ease;
            background: rgba(255, 255, 255, 0.02);
            min-height: 40px;
            user-select: none;
        `;

        // 가시성 토글 버튼
        this.visibilityBtn = document.createElement('button');
        this.visibilityBtn.className = 'visibility-toggle';
        this.visibilityBtn.innerHTML = this.layerData.visible ? '👁️' : '🚫';
        this.visibilityBtn.title = this.layerData.visible ? 'Hide layer' : 'Show layer';
        this.visibilityBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 16px;
            cursor: pointer;
            margin-right: 8px;
            padding: 2px 4px;
            border-radius: 3px;
            transition: background 0.2s ease;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // 타입 아이콘
        this.typeIcon = document.createElement('span');
        this.typeIcon.className = 'layer-type-icon';
        this.typeIcon.innerHTML = this.getTypeIcon();
        this.typeIcon.style.cssText = `
            font-size: 14px;
            margin-right: 8px;
            opacity: 0.8;
        `;

        // 레이어 이름
        this.nameElement = document.createElement('span');
        this.nameElement.className = 'layer-name';
        this.nameElement.textContent = this.layerData.name;
        this.nameElement.style.cssText = `
            flex: 1;
            color: rgba(255, 255, 255, 0.9);
            font-size: 12px;
            font-weight: 500;
            cursor: text;
            padding: 2px 4px;
            border-radius: 3px;
            min-width: 0;
            word-break: break-word;
        `;

        // 불투명도 표시 (클릭 가능)
        this.opacityDisplay = document.createElement('span');
        this.opacityDisplay.className = 'opacity-display';
        this.opacityDisplay.textContent = Math.round(this.layerData.opacity * 100) + '%';
        this.opacityDisplay.title = 'Click to adjust opacity';
        this.opacityDisplay.style.cssText = `
            color: rgba(255, 255, 255, 0.7);
            font-size: 10px;
            font-weight: 600;
            margin-left: 8px;
            min-width: 30px;
            text-align: right;
            cursor: pointer;
            padding: 2px 4px;
            border-radius: 3px;
            transition: background 0.2s ease;
        `;

        // 요소들 조립
        this.element.appendChild(this.visibilityBtn);
        this.element.appendChild(this.typeIcon);
        this.element.appendChild(this.nameElement);
        this.element.appendChild(this.opacityDisplay);

        // 선택 상태 업데이트
        this.updateSelection();
    }

    /**
     * 타입에 따른 아이콘 반환
     */
    getTypeIcon() {
        switch (this.layerData.imageType) {
            case 'preproc':
                return '⚙️';
            case 'normal':
            default:
                return '📷';
        }
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 가시성 토글
        this.visibilityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newVisibility = !this.layerData.visible;
            setLayerVisibility(this.layerData.imageNode, newVisibility);
            this.layerData.visible = newVisibility;
            this.updateVisibilityButton();
        });

        // 레이어 선택
        this.element.addEventListener('click', (e) => {
            if (e.target === this.nameElement && this.isNameEditing) {
                return; // 이름 편집 중일 때는 선택하지 않음
            }
            selectLayer(this.layerData.imageNode);
            this.onUpdate();
        });

        // 이름 편집 (더블클릭)
        this.nameElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.startNameEditing();
        });

        // 호버 효과
        this.element.addEventListener('mouseenter', () => {
            if (!this.element.classList.contains('selected')) {
                this.element.style.background = 'rgba(255, 255, 255, 0.05)';
            }
        });

        this.element.addEventListener('mouseleave', () => {
            if (!this.element.classList.contains('selected')) {
                this.element.style.background = 'rgba(255, 255, 255, 0.02)';
            }
        });

        // 가시성 버튼 호버
        this.visibilityBtn.addEventListener('mouseenter', () => {
            this.visibilityBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        });

        this.visibilityBtn.addEventListener('mouseleave', () => {
            this.visibilityBtn.style.background = 'none';
        });

        // 불투명도 클릭 이벤트
        this.opacityDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showOpacitySlider();
        });

        // 불투명도 호버
        this.opacityDisplay.addEventListener('mouseenter', () => {
            this.opacityDisplay.style.background = 'rgba(139, 92, 246, 0.2)';
        });

        this.opacityDisplay.addEventListener('mouseleave', () => {
            this.opacityDisplay.style.background = 'none';
        });
    }

    /**
     * 이름 편집 모드 시작
     */
    startNameEditing() {
        if (this.isNameEditing) return;

        this.isNameEditing = true;
        const currentName = this.nameElement.textContent;
        
        // 입력 필드 생성
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.style.cssText = `
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #6366f1;
            border-radius: 3px;
            color: #1f2937;
            font-size: 12px;
            font-weight: 500;
            padding: 2px 4px;
            width: 100%;
            outline: none;
        `;

        // 텍스트 대체
        this.nameElement.innerHTML = '';
        this.nameElement.appendChild(input);
        input.focus();
        input.select();

        const finishEditing = () => {
            if (!this.isNameEditing) return;

            this.isNameEditing = false;
            const newName = input.value.trim() || currentName;
            
            // 이름 업데이트
            setLayerName(this.layerData.imageNode, newName);
            this.layerData.name = newName;
            this.nameElement.textContent = newName;
            
            this.onUpdate();
        };

        // 이벤트 리스너
        input.addEventListener('blur', finishEditing);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishEditing();
            } else if (e.key === 'Escape') {
                this.isNameEditing = false;
                this.nameElement.textContent = currentName;
            }
        });
    }

    /**
     * 가시성 버튼 업데이트
     */
    updateVisibilityButton() {
        this.visibilityBtn.innerHTML = this.layerData.visible ? '👁️' : '🚫';
        this.visibilityBtn.title = this.layerData.visible ? 'Hide layer' : 'Show layer';
        
        // 비가시성 상태일 때 아이템 스타일 변경
        if (this.layerData.visible) {
            this.element.style.opacity = '1';
            this.typeIcon.style.opacity = '0.8';
            this.nameElement.style.opacity = '0.9';
        } else {
            this.element.style.opacity = '0.6';
            this.typeIcon.style.opacity = '0.4';
            this.nameElement.style.opacity = '0.5';
        }
    }

    /**
     * 불투명도 표시 업데이트
     */
    updateOpacityDisplay() {
        const opacityPercent = Math.round(this.layerData.opacity * 100);
        this.opacityDisplay.textContent = opacityPercent + '%';
        
        // 불투명도에 따른 시각적 피드백
        if (opacityPercent < 100) {
            this.opacityDisplay.style.color = 'rgba(255, 255, 255, 0.9)';
            this.opacityDisplay.style.fontWeight = '700';
        } else {
            this.opacityDisplay.style.color = 'rgba(255, 255, 255, 0.7)';
            this.opacityDisplay.style.fontWeight = '600';
        }
    }

    /**
     * 선택 상태 업데이트
     */
    updateSelection() {
        // 현재 선택된 이미지인지 확인 (동적 import 사용)
        import('../../canvas/canvas.js').then(canvasModule => {
            const selectedImage = canvasModule.getSelectedImage ? canvasModule.getSelectedImage() : null;
            const isSelected = selectedImage === this.layerData.imageNode;
            
            if (isSelected) {
                this.element.classList.add('selected');
                this.element.style.background = 'rgba(139, 92, 246, 0.3)'; // 보라색 하이라이트
                this.element.style.borderLeft = '3px solid #8b5cf6';
            } else {
                this.element.classList.remove('selected');
                this.element.style.background = 'rgba(255, 255, 255, 0.02)';
                this.element.style.borderLeft = 'none';
            }
        }).catch(() => {
            // canvas 모듈 로드 실패 시 기본 동작
            this.element.classList.remove('selected');
            this.element.style.background = 'rgba(255, 255, 255, 0.02)';
            this.element.style.borderLeft = 'none';
        });
    }

    /**
     * 레이어 데이터 업데이트
     */
    updateData(newLayerData) {
        this.layerData = { ...this.layerData, ...newLayerData };
        
        // UI 업데이트
        this.nameElement.textContent = this.layerData.name;
        this.typeIcon.innerHTML = this.getTypeIcon();
        this.updateVisibilityButton();
        this.updateOpacityDisplay();
        this.updateSelection();
    }

    /**
     * 불투명도 슬라이더 표시
     */
    showOpacitySlider() {
        // 이미 불투명도 슬라이더가 있다면 opacity 슬라이더를 사용
        import('../../imageEditor/opacitySlider.js').then(opacityModule => {
            opacityModule.showOpacitySlider(this.layerData.imageNode);
        }).catch(() => {
            // 대신 간단한 prompt로 설정
            const currentOpacity = Math.round(this.layerData.opacity * 100);
            const newOpacity = prompt(`Set opacity (0-100):`, currentOpacity);
            
            if (newOpacity !== null) {
                const opacity = Math.max(0, Math.min(100, parseInt(newOpacity) || 0)) / 100;
                setLayerOpacity(this.layerData.imageNode, opacity);
                this.layerData.opacity = opacity;
                this.updateOpacityDisplay();
            }
        });
    }

    /**
     * 컴포넌트 정리
     */
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

/**
 * 레이어 아이템 생성 헬퍼 함수
 */
export function createLayerItem(layerData, onUpdate) {
    return new LayerItem(layerData, onUpdate);
}