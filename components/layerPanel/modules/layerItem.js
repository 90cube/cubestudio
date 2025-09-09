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
        this.element.title = 'Double-click: Layer options';
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

        // 타입 아이콘 (우클릭 가능)
        this.typeIcon = document.createElement('span');
        this.typeIcon.className = 'layer-type-icon';
        this.typeIcon.innerHTML = this.getTypeIcon();
        this.typeIcon.title = 'Double-click to toggle image type';
        this.typeIcon.style.cssText = `
            font-size: 14px;
            margin-right: 8px;
            opacity: 0.8;
            cursor: context-menu;
            padding: 2px 4px;
            border-radius: 3px;
            transition: background 0.2s ease;
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

        // 전체 레이어 더블클릭은 제거 (톱니바퀴 아이콘에만 적용)

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

        // 타입 아이콘 더블클릭 - 타입 토글
        this.typeIcon.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleImageType();
        });

        // 우클릭은 브라우저 기본 기능 유지 (제거됨)

        // 타입 아이콘 호버
        this.typeIcon.addEventListener('mouseenter', () => {
            this.typeIcon.style.background = 'rgba(139, 92, 246, 0.2)';
        });

        this.typeIcon.addEventListener('mouseleave', () => {
            this.typeIcon.style.background = 'none';
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
        // 레이어 패널용 간단한 불투명도 조절 UI 생성
        this.showLayerOpacityControl();
    }

    /**
     * 이미지 타입 토글 (normal ↔ preproc)
     */
    toggleImageType() {
        const currentType = this.layerData.imageType;
        const newType = currentType === 'normal' ? 'preproc' : 'normal';
        
        // 이미지 노드의 타입 속성 변경
        this.layerData.imageNode.setAttr('imageType', newType);
        this.layerData.imageType = newType;
        
        // UI 업데이트
        this.typeIcon.innerHTML = this.getTypeIcon();
        
        // 이름도 타입에 맞게 업데이트
        const idString = String(this.layerData.id);
        const baseId = idString.replace(/^(image-|layer-)/, '');
        this.layerData.name = newType === 'preproc' ? `Preprocessed ${baseId}` : `Image ${baseId}`;
        this.nameElement.textContent = this.layerData.name;
        
        // 캔버스 레이어 강제 다시 그리기
        try {
            // 캔버스 모듈에서 레이어 가져와서 다시 그리기
            import('../../canvas/canvas.js').then(canvasModule => {
                if (canvasModule.getLayer) {
                    const layer = canvasModule.getLayer();
                    if (layer) {
                        layer.batchDraw(); // 즉시 다시 그리기
                    }
                }
                
                // 선택된 이미지인 경우 선택 상태 유지하면서 업데이트
                if (canvasModule.getSelectedImage && canvasModule.getSelectedImage() === this.layerData.imageNode) {
                    // 선택 상태를 유지하면서 강제 업데이트
                    canvasModule.updateHighlightPosition && canvasModule.updateHighlightPosition();
                }
            }).catch(() => {
                console.warn('Canvas module not available for immediate update');
            });
        } catch (error) {
            console.warn('Failed to update canvas immediately:', error);
        }

        // 변경사항 적용 후 이벤트 발생 (지연으로 변경사항 확실히 적용)
        setTimeout(() => {
            const typeChangedEvent = new CustomEvent('canvasImageTypeChanged', {
                detail: {
                    imageNode: this.layerData.imageNode,
                    oldType: currentType,
                    newType: newType
                }
            });
            document.dispatchEvent(typeChangedEvent);
        }, 10);
        
        console.log(`🔄 Layer: Image type toggled from ${currentType} to ${newType}`);
        
        // 부모 업데이트 콜백 호출
        if (this.onUpdate) {
            this.onUpdate();
        }
    }

    /**
     * 레이어 옵션 메뉴 표시 (더블클릭 시)
     */
    showLayerOptionsMenu(event) {
        // 기존 메뉴들 제거
        this.removeExistingContextMenu();
        this.removeExistingOpacityControl();
        
        // 옵션 메뉴 생성
        const optionsMenu = document.createElement('div');
        optionsMenu.className = 'layer-options-menu';
        optionsMenu.style.cssText = `
            position: fixed;
            z-index: 10000;
            background: rgba(30, 30, 30, 0.95);
            border: 1px solid rgba(139, 92, 246, 0.3);
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            padding: 4px 0;
            min-width: 180px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        // 메뉴 위치 설정
        const rect = this.element.getBoundingClientRect();
        optionsMenu.style.left = (rect.right + 10) + 'px';
        optionsMenu.style.top = rect.top + 'px';
        
        // 메뉴 아이템들 생성
        const menuItems = [
            {
                icon: '🎚️',
                label: 'Adjust Opacity',
                action: () => {
                    this.removeExistingOptionsMenu();
                    this.showLayerOpacityControl();
                }
            },
            {
                icon: '🔄',
                label: 'Change Type',
                action: () => {
                    this.removeExistingOptionsMenu();
                    this.showTypeContextMenu(event);
                }
            },
            {
                icon: '✏️',
                label: 'Rename Layer',
                action: () => {
                    this.removeExistingOptionsMenu();
                    this.startNameEditing();
                }
            },
            {
                icon: this.layerData.visible ? '👁️' : '🚫',
                label: this.layerData.visible ? 'Hide Layer' : 'Show Layer',
                action: () => {
                    this.removeExistingOptionsMenu();
                    const newVisibility = !this.layerData.visible;
                    setLayerVisibility(this.layerData.imageNode, newVisibility);
                    this.layerData.visible = newVisibility;
                    this.updateVisibilityButton();
                }
            }
        ];
        
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'options-menu-item';
            menuItem.innerHTML = `${item.icon} ${item.label}`;
            menuItem.style.cssText = `
                padding: 10px 16px;
                cursor: pointer;
                font-size: 13px;
                color: rgba(255, 255, 255, 0.9);
                display: flex;
                align-items: center;
                gap: 10px;
                transition: background 0.2s ease;
            `;
            
            // 호버 효과
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = 'rgba(139, 92, 246, 0.2)';
            });
            
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'none';
            });
            
            // 클릭 이벤트
            menuItem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                item.action();
            });
            
            optionsMenu.appendChild(menuItem);
        });
        
        // 문서에 추가
        document.body.appendChild(optionsMenu);
        
        // 외부 클릭 시 메뉴 닫기
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!optionsMenu.contains(e.target)) {
                    this.removeExistingOptionsMenu();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
        
        // 화면 경계 체크 및 위치 조정
        setTimeout(() => {
            const menuRect = optionsMenu.getBoundingClientRect();
            if (menuRect.right > window.innerWidth) {
                optionsMenu.style.left = (rect.left - menuRect.width - 10) + 'px';
            }
            if (menuRect.bottom > window.innerHeight) {
                optionsMenu.style.top = (window.innerHeight - menuRect.height - 10) + 'px';
            }
        }, 0);
    }

    /**
     * 기존 옵션 메뉴 제거
     */
    removeExistingOptionsMenu() {
        const existingMenu = document.querySelector('.layer-options-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }

    /**
     * 레이어 패널용 불투명도 조절 UI
     */
    showLayerOpacityControl() {
        // 기존 컨트롤 제거
        this.removeExistingOpacityControl();
        
        // 불투명도 컨트롤 컨테이너 생성
        const opacityControl = document.createElement('div');
        opacityControl.className = 'layer-opacity-control';
        opacityControl.style.cssText = `
            position: fixed;
            z-index: 10000;
            background: rgba(30, 30, 30, 0.95);
            border: 1px solid rgba(139, 92, 246, 0.3);
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            padding: 12px 16px;
            min-width: 200px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        // 레이어 아이템의 위치 기준으로 배치
        const rect = this.element.getBoundingClientRect();
        opacityControl.style.left = (rect.right + 10) + 'px';
        opacityControl.style.top = rect.top + 'px';
        
        // 제목
        const title = document.createElement('div');
        title.textContent = `Opacity: ${this.layerData.name}`;
        title.style.cssText = `
            color: rgba(255, 255, 255, 0.9);
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
        `;
        
        // 슬라이더
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = Math.round(this.layerData.opacity * 100);
        slider.style.cssText = `
            width: 100%;
            margin: 8px 0;
            accent-color: #8b5cf6;
        `;
        
        // 값 표시
        const valueDisplay = document.createElement('div');
        valueDisplay.textContent = Math.round(this.layerData.opacity * 100) + '%';
        valueDisplay.style.cssText = `
            color: rgba(255, 255, 255, 0.8);
            font-size: 11px;
            text-align: center;
            font-weight: 600;
        `;
        
        // 슬라이더 이벤트
        slider.addEventListener('input', (e) => {
            const opacity = parseInt(e.target.value) / 100;
            setLayerOpacity(this.layerData.imageNode, opacity);
            this.layerData.opacity = opacity;
            this.updateOpacityDisplay();
            valueDisplay.textContent = e.target.value + '%';
        });
        
        // 조립
        opacityControl.appendChild(title);
        opacityControl.appendChild(slider);
        opacityControl.appendChild(valueDisplay);
        
        // 문서에 추가
        document.body.appendChild(opacityControl);
        
        // 외부 클릭 시 닫기
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!opacityControl.contains(e.target)) {
                    this.removeExistingOpacityControl();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
        
        // 화면 경계 체크 및 위치 조정
        setTimeout(() => {
            const controlRect = opacityControl.getBoundingClientRect();
            if (controlRect.right > window.innerWidth) {
                opacityControl.style.left = (rect.left - controlRect.width - 10) + 'px';
            }
            if (controlRect.bottom > window.innerHeight) {
                opacityControl.style.top = (window.innerHeight - controlRect.height - 10) + 'px';
            }
        }, 0);
    }

    /**
     * 기존 불투명도 컨트롤 제거
     */
    removeExistingOpacityControl() {
        const existingControl = document.querySelector('.layer-opacity-control');
        if (existingControl) {
            existingControl.remove();
        }
    }

    /**
     * 타입 변경 컨텍스트 메뉴 표시
     */
    showTypeContextMenu(event) {
        // 기존 컨텍스트 메뉴 제거
        this.removeExistingContextMenu();
        
        // 컨텍스트 메뉴 생성
        const contextMenu = document.createElement('div');
        contextMenu.className = 'layer-type-context-menu';
        contextMenu.style.cssText = `
            position: fixed;
            z-index: 10000;
            background: rgba(30, 30, 30, 0.95);
            border: 1px solid rgba(139, 92, 246, 0.3);
            border-radius: 6px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            padding: 4px 0;
            min-width: 140px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        // 메뉴 위치 설정
        contextMenu.style.left = event.clientX + 'px';
        contextMenu.style.top = event.clientY + 'px';
        
        // 메뉴 아이템들 생성
        const menuItems = [
            { icon: '📷', type: 'normal', label: 'Normal Image' },
            { icon: '⚙️', type: 'preproc', label: 'Preprocessed Image' }
        ];
        
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.innerHTML = `${item.icon} ${item.label}`;
            menuItem.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                font-size: 12px;
                color: rgba(255, 255, 255, 0.9);
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background 0.2s ease;
                ${this.layerData.imageType === item.type ? 'background: rgba(139, 92, 246, 0.2);' : ''}
            `;
            
            // 호버 효과
            menuItem.addEventListener('mouseenter', () => {
                if (this.layerData.imageType !== item.type) {
                    menuItem.style.background = 'rgba(255, 255, 255, 0.1)';
                }
            });
            
            menuItem.addEventListener('mouseleave', () => {
                if (this.layerData.imageType !== item.type) {
                    menuItem.style.background = 'none';
                }
            });
            
            // 클릭 이벤트
            menuItem.addEventListener('click', () => {
                this.changeImageType(item.type);
                this.removeExistingContextMenu();
            });
            
            contextMenu.appendChild(menuItem);
        });
        
        // 문서에 추가
        document.body.appendChild(contextMenu);
        
        // 외부 클릭 시 메뉴 닫기
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!contextMenu.contains(e.target)) {
                    this.removeExistingContextMenu();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 0);
        
        // 화면 경계 체크 및 위치 조정
        setTimeout(() => {
            const rect = contextMenu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                contextMenu.style.left = (event.clientX - rect.width) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                contextMenu.style.top = (event.clientY - rect.height) + 'px';
            }
        }, 0);
    }
    
    /**
     * 기존 컨텍스트 메뉴 제거
     */
    removeExistingContextMenu() {
        const existingMenu = document.querySelector('.layer-type-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }
    
    /**
     * 이미지 타입 변경
     */
    changeImageType(newType) {
        if (this.layerData.imageType === newType) {
            return; // 같은 타입이면 무시
        }
        
        // 이미지 노드의 타입 속성 변경
        this.layerData.imageNode.setAttr('imageType', newType);
        this.layerData.imageType = newType;
        
        // UI 업데이트
        this.typeIcon.innerHTML = this.getTypeIcon();
        this.nameElement.textContent = this.getLayerName();
        
        // 캔버스 이벤트 발생 (레이어 패널 업데이트용)
        const typeChangedEvent = new CustomEvent('canvasImageTypeChanged', {
            detail: {
                imageNode: this.layerData.imageNode,
                oldType: this.layerData.imageType === 'normal' ? 'preproc' : 'normal',
                newType: newType
            }
        });
        document.dispatchEvent(typeChangedEvent);
        
        console.log(`🔄 Image type changed from ${this.layerData.imageType === 'normal' ? 'preproc' : 'normal'} to ${newType}`);
        
        // 부모 업데이트 콜백 호출
        if (this.onUpdate) {
            this.onUpdate();
        }
    }
    
    /**
     * 레이어 이름 생성 (타입에 따라)
     */
    getLayerName() {
        const baseId = this.layerData.id.replace(/^(image-|layer-)/, '');
        switch (this.layerData.imageType) {
            case 'preproc':
                return `Preprocessed ${baseId}`;
            case 'normal':
            default:
                return `Image ${baseId}`;
        }
    }

    /**
     * 컴포넌트 정리
     */
    destroy() {
        // 모든 열린 메뉴들 정리
        this.removeExistingContextMenu();
        this.removeExistingOpacityControl();
        this.removeExistingOptionsMenu();
        
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