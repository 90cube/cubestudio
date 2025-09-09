// components/layerPanel/layerPanel.js

import { createFloatingPanel } from '../ui/floatingPanel/floatingPanel.js';
import { getAllLayers, getLayerStats, onLayerUpdate, offLayerUpdate } from './modules/layerDataManager.js';
import { createLayerItem } from './modules/layerItem.js';

/**
 * 레이어 패널 메인 컴포넌트
 * 포토샵 스타일의 레이어 관리 패널을 제공합니다.
 */

export class LayerPanel {
    constructor(options = {}) {
        this.options = {
            title: '🎨 Layers',
            width: 300,
            height: 400,
            x: window.innerWidth - 320, // 우측에 배치
            y: 60,
            markingColor: '#8b5cf6', // 보라색 테마
            ...options
        };

        this.floatingPanel = null;
        this.containerElement = null;
        this.layerListElement = null;
        this.footerElement = null;
        this.isInitialized = false;
        
        this.layer = null; // Konva 레이어 참조
        this.layerItems = new Map(); // 레이어 아이템들 관리
        
        // 업데이트 콜백 바인딩
        this.onLayerUpdateBound = this.onLayerUpdate.bind(this);
    }

    /**
     * 레이어 패널 초기화
     */
    init() {
        if (this.isInitialized) {
            console.log('LayerPanel already initialized');
            return;
        }

        console.log('🎨 Initializing Layer Panel...');

        // 캔버스 레이어 참조 가져오기
        this.getCanvasLayer().then(layer => {
            if (layer) {
                this.layer = layer;
                this.createPanel();
                this.setupEventListeners();
                this.refreshLayers();
                this.isInitialized = true;
                console.log('✅ Layer Panel initialized successfully');
            } else {
                console.error('❌ Failed to get canvas layer');
            }
        });
    }

    /**
     * 캔버스 레이어 참조 가져오기
     */
    async getCanvasLayer() {
        try {
            const canvasModule = await import('../canvas/canvas.js');
            return canvasModule.getLayer ? canvasModule.getLayer() : null;
        } catch (error) {
            console.error('Failed to import canvas module:', error);
            return null;
        }
    }

    /**
     * 플로팅 패널 생성
     */
    createPanel() {
        this.floatingPanel = createFloatingPanel(this.options);
        this.containerElement = this.render();
        this.floatingPanel.addComponent('layerPanel', this);
    }

    /**
     * 레이어 패널 UI 렌더링
     */
    render() {
        const container = document.createElement('div');
        container.className = 'layer-panel-container';
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // 레이어 목록 영역
        this.layerListElement = document.createElement('div');
        this.layerListElement.className = 'layer-list';
        this.layerListElement.style.cssText = `
            flex: 1;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.1);
            border-radius: 6px;
            margin-bottom: 8px;
            min-height: 200px;
        `;

        // 빈 상태 메시지
        this.emptyStateElement = document.createElement('div');
        this.emptyStateElement.className = 'empty-state';
        this.emptyStateElement.innerHTML = `
            <div style="
                text-align: center;
                padding: 40px 20px;
                color: rgba(255, 255, 255, 0.6);
                font-size: 14px;
            ">
                <div style="font-size: 32px; margin-bottom: 12px;">📋</div>
                <div style="font-weight: 500; margin-bottom: 8px;">No Layers</div>
                <div style="font-size: 12px; line-height: 1.4;">
                    Drop images on canvas<br>or use preprocessing tools<br>to create layers
                </div>
            </div>
        `;

        // 푸터 (통계 정보)
        this.footerElement = document.createElement('div');
        this.footerElement.className = 'layer-panel-footer';
        this.footerElement.style.cssText = `
            padding: 8px 12px;
            background: rgba(139, 92, 246, 0.1);
            border-radius: 6px;
            font-size: 11px;
            color: rgba(255, 255, 255, 0.8);
            border: 1px solid rgba(139, 92, 246, 0.2);
            text-align: center;
        `;

        // 조립
        container.appendChild(this.layerListElement);
        container.appendChild(this.footerElement);

        return container;
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 레이어 업데이트 감지
        onLayerUpdate(this.onLayerUpdateBound);

        // 캔버스 이벤트 감지 (이미지 추가/삭제)
        document.addEventListener('canvasImageAdded', this.onLayerUpdateBound);
        document.addEventListener('canvasImageDeleted', this.onLayerUpdateBound);
        document.addEventListener('canvasImageSelected', this.onLayerUpdateBound);

        console.log('📡 Layer panel event listeners set up');
    }

    /**
     * 레이어 업데이트 핸들러
     */
    onLayerUpdate() {
        if (this.isInitialized) {
            this.refreshLayers();
        }
    }

    /**
     * 레이어 목록 새로고침
     */
    refreshLayers() {
        if (!this.layer || !this.layerListElement) {
            return;
        }

        console.log('🔄 Refreshing layers...');

        const layers = getAllLayers(this.layer);
        
        // 기존 레이어 아이템들 정리
        this.layerItems.clear();
        this.layerListElement.innerHTML = '';

        if (layers.length === 0) {
            // 빈 상태 표시
            this.layerListElement.appendChild(this.emptyStateElement);
        } else {
            // 레이어 아이템들 생성
            layers.forEach(layerData => {
                const layerItem = createLayerItem(layerData, () => {
                    this.onLayerItemUpdate();
                });
                
                this.layerItems.set(layerData.id, layerItem);
                this.layerListElement.appendChild(layerItem.element);
            });
        }

        // 푸터 통계 업데이트
        this.updateFooter(layers);

        console.log(`✅ Refreshed ${layers.length} layers`);
    }

    /**
     * 레이어 아이템 업데이트 핸들러
     */
    onLayerItemUpdate() {
        // 선택 상태 업데이트
        this.layerItems.forEach(layerItem => {
            layerItem.updateSelection();
        });
    }

    /**
     * 푸터 통계 정보 업데이트
     */
    updateFooter(layers) {
        if (!this.footerElement) return;

        const stats = getLayerStats(layers);
        
        if (stats.total === 0) {
            this.footerElement.innerHTML = 'No layers';
        } else {
            const parts = [];
            
            if (stats.normal > 0) {
                parts.push(`📷 ${stats.normal} Normal`);
            }
            if (stats.preproc > 0) {
                parts.push(`⚙️ ${stats.preproc} Preproc`);
            }
            
            const summary = parts.join(', ');
            const visibility = stats.hidden > 0 ? ` (${stats.hidden} hidden)` : '';
            
            this.footerElement.innerHTML = `${summary}${visibility}`;
        }
    }

    /**
     * 특정 레이어 선택
     */
    selectLayer(layerId) {
        const layerItem = this.layerItems.get(layerId);
        if (layerItem) {
            layerItem.layerData.imageNode.fire('click');
        }
    }

    /**
     * 패널 표시/숨김
     */
    toggle() {
        if (this.floatingPanel) {
            // 패널이 점으로 최소화되어 있는지 확인하고 복원
            const panelElement = document.getElementById(this.floatingPanel.id);
            if (!panelElement) {
                // 최소화된 상태에서 복원 (구현 필요)
                console.log('Panel is minimized, restore needed');
            }
        }
    }

    /**
     * 컴포넌트 정리
     */
    destroy() {
        // 이벤트 리스너 제거
        offLayerUpdate(this.onLayerUpdateBound);
        document.removeEventListener('canvasImageAdded', this.onLayerUpdateBound);
        document.removeEventListener('canvasImageDeleted', this.onLayerUpdateBound);
        document.removeEventListener('canvasImageSelected', this.onLayerUpdateBound);

        // 레이어 아이템들 정리
        this.layerItems.forEach(layerItem => {
            layerItem.destroy();
        });
        this.layerItems.clear();

        // 플로팅 패널 정리
        if (this.floatingPanel) {
            this.floatingPanel.destroy();
        }

        this.isInitialized = false;
        console.log('🗑️ Layer Panel destroyed');
    }
}

/**
 * 레이어 패널 인스턴스 관리
 */
let layerPanelInstance = null;

/**
 * 레이어 패널 생성/표시
 */
export function showLayerPanel(options = {}) {
    if (!layerPanelInstance) {
        layerPanelInstance = new LayerPanel(options);
        layerPanelInstance.init();
        console.log('🎨 Layer Panel created and shown');
    } else {
        layerPanelInstance.toggle();
        console.log('🎨 Layer Panel toggled');
    }
    return layerPanelInstance;
}

/**
 * 레이어 패널 숨김
 */
export function hideLayerPanel() {
    if (layerPanelInstance) {
        layerPanelInstance.destroy();
        layerPanelInstance = null;
        console.log('🎨 Layer Panel hidden');
    }
}

/**
 * 레이어 패널 인스턴스 가져오기
 */
export function getLayerPanel() {
    return layerPanelInstance;
}

// 컴포넌트 기본 내보내기
export default LayerPanel;