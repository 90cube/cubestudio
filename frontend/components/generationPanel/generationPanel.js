// components/generationPanel/generationPanel.js
// Version: 2.0 - CORS fix applied

/**
 * 하단 고정 통합 생성 패널 컴포넌트
 * Prompt, Parameters, Generate Controls 통합
 */

import stateManager from '../../core/stateManager.js';
import { getPanelInstance } from '../ui/floatingPanel/floatingPanel.js';
import pathConfig from '../../core/pathConfig.js';
import websocketService from '../../core/websocketService.js';

export class GenerationPanel {
    constructor() {
        this.containerElement = null;
        this.isInitialized = false;
        this.isCollapsed = false;
        
        // 상태 데이터
        this.state = {
            // 프롬프트 데이터
            prompts: {
                positive: '',
                negative: ''
            },

            // 생성 파라미터
            parameters: {
                batchCount: 1,      // 배치수 (1~8)
                repeatCount: 1,     // 반복수 (1~1000)
                denoise: 0.75       // 디노이즈 (0.00~1.00)
            },

            // 프리셋 시스템
            presets: {
                positive: {
                    current: 0,
                    list: []
                },
                negative: {
                    current: 0,
                    list: []
                }
            },

            // 생성 상태
            generation: {
                isGenerating: false,
                infinityMode: false
            },

            // 로드된 모델 정보
            loadedModel: null
        };
        
        // 프리셋 디렉토리 경로
        this.presetPaths = {
            positive: 'models/presets/posprpt',
            negative: 'models/presets/negprpt'
        };
        
        // 이벤트 핸들러들
        this.eventHandlers = new Map();
        
        // console.log('GenerationPanel initialized');
    }
    
    /**
     * 패널 초기화 - renewal 아키텍처 호환
     */
    init() {
        if (this.isInitialized || !this.containerElement) {
            return;
        }
        
        this.isInitialized = true;
        
        // 상태 복원
        this.restoreState();
        
        // 프리셋 로드
        this.loadPresets();
        
        // DOM이 마운트된 후에 이벤트 리스너 설정
        setTimeout(() => {
            this.setupEventListeners();
            this.updateUI();
            
            // 추가 지연을 두어 DOM이 완전히 렌더링되도록 함
            setTimeout(() => {
                this.setupDenoiseStateListener(); // 새 리스너 호출로 변경
            }, 10);
        }, 0);
    }

    /**
     * isImageSelected 상태를 구독하여 디노이즈 슬라이더를 제어합니다.
     */
    setupDenoiseStateListener(retryCount = 0) {
        // console.log(`🔧 setupDenoiseStateListener() called (attempt ${retryCount + 1})`);
        // console.log('🔧 containerElement:', this.containerElement);
        
        const denoiseSlider = this.containerElement?.querySelector('#param-denoise-slider');
        const denoiseInput = this.containerElement?.querySelector('#param-denoise');

        // console.log('🔧 Denoise elements found:');
        // console.log('🔧 - Slider:', denoiseSlider);
        // console.log('🔧 - Input:', denoiseInput);

        if (!denoiseSlider || !denoiseInput) {
            // console.error(`❌ Denoise elements not found - attempt ${retryCount + 1}`);
            // console.log('❌ Available elements in container:', 
            //     this.containerElement?.querySelectorAll('*[id]').length || 'container not found');
            
            // 최대 3번까지 재시도
            if (retryCount < 3) {
                // console.log(`⏳ Retrying in 50ms... (attempt ${retryCount + 2})`);
                setTimeout(() => {
                    this.setupDenoiseStateListener(retryCount + 1);
                }, 50);
                return;
            } else {
                // console.error('❌ Failed to find denoise elements after 4 attempts - giving up');
                return;
            }
        }

        // console.log('✅ Setting up isImageSelected subscription...');
        
        // isImageSelected 상태 구독
        const unsubscribe = stateManager.subscribe('isImageSelected', (isSelected, oldValue) => {
            // console.log('🎯 isImageSelected subscription callback triggered!');
            // console.log('🎯 - New value:', isSelected);
            // console.log('🎯 - Old value:', oldValue);
            // console.log('🎯 - Slider element:', denoiseSlider);
            // console.log('🎯 - Input element:', denoiseInput);
            
            denoiseSlider.disabled = !isSelected;
            denoiseInput.disabled = !isSelected;

            // 스타일 적용
            if (!isSelected) {
                denoiseSlider.style.opacity = '0.5';
                denoiseInput.style.opacity = '0.5';
                // console.log('🎯 Applied disabled styles (opacity: 0.5)');
            } else {
                denoiseSlider.style.opacity = '1';
                denoiseInput.style.opacity = '1';
                // console.log('🎯 Applied enabled styles (opacity: 1)');
            }
        });
        
        // 구독 해제 함수 저장 (컴포넌트 destroy 시 사용)
        this.denoiseStateUnsubscribe = unsubscribe;
        // console.log('✅ Subscription created, unsubscribe function stored');

        // 초기 상태 강제 설정 (페이지 로드 시)
        const initialState = stateManager.getState('isImageSelected') || false;
        // console.log('🔧 Initial isImageSelected state:', initialState);
        
        denoiseSlider.disabled = !initialState;
        denoiseInput.disabled = !initialState;
        if (!initialState) {
            denoiseSlider.style.opacity = '0.5';
            denoiseInput.style.opacity = '0.5';
            // console.log('🔧 Applied initial disabled styles');
        } else {
            denoiseSlider.style.opacity = '1';
            denoiseInput.style.opacity = '1';
            // console.log('🔧 Applied initial enabled styles');
        }
        
        // console.log('✅ setupDenoiseStateListener completed successfully');
    }
    
    /**
     * 렌더링 메서드
     */
    render() {
        const container = document.createElement('div');
        container.className = 'generation-panel';
        container.id = 'generation-panel';
        
        container.innerHTML = this.getHTML();
        
        // CSS 스타일 추가
        this.addStyles();
        
        // 컨테이너를 참조로 저장
        this.containerElement = container;
        
        return container;
    }
    
    /**
     * HTML 구조 생성
     */
    getHTML() {
        return `
            <!-- 접힌 상태에서 보여질 컨트롤 -->
            <div class="collapsed-controls" style="display: none;">
                <button class="btn-infinity collapsed" id="infinity-btn-collapsed">
                    <span class="infinity-symbol">∞</span>
                </button>
                <button class="btn-generate collapsed" id="generate-btn-collapsed">
                    Generate
                </button>
                <button class="expand-btn" id="expand-btn">
                    <span class="expand-arrow">⬆</span>
                </button>
            </div>
            
            <!-- 메인 패널 컨텐츠 -->
            <div class="panel-content" id="panel-main-content">
                <!-- 패널 헤더 -->
                <div class="panel-header">
                    <h2 class="panel-title">Image Generation</h2>
                    <div class="header-controls">
                        <button class="collapse-btn" id="collapse-btn" title="Collapse Panel">
                            <span class="collapse-arrow">⬇</span>
                        </button>
                    </div>
                </div>
                
                <!-- 패널 본문 -->
                <div class="panel-body">
                    <!-- 로드된 모델 표시 -->
                    <div class="loaded-model-display" id="loaded-model-display" style="display: none;">
                        <span class="model-label">Model:</span>
                        <strong class="model-name" id="loaded-model-name"></strong>
                    </div>

                    <!-- 프롬프트 섹션 -->
                    <div class="prompt-section">
                        <!-- Positive 프롬프트 -->
                        <div class="prompt-group positive">
                            <div class="prompt-header">
                                <label for="positive-prompt">Positive Prompt</label>
                            </div>
                            <textarea 
                                id="positive-prompt" 
                                placeholder="Enter positive prompt..."
                                rows="2"
                                data-type="positive"
                            ></textarea>
                            <!-- Positive 프리셋 버튼들 -->
                            <div class="preset-section" data-type="positive">
                                <div class="preset-buttons-wrapper">
                                    <div class="preset-buttons" id="positive-preset-buttons">
                                        <!-- 프리셋 버튼들이 동적으로 추가됨 -->
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Negative 프롬프트 -->
                        <div class="prompt-group negative">
                            <div class="prompt-header">
                                <label for="negative-prompt">Negative Prompt</label>
                            </div>
                            <textarea 
                                id="negative-prompt" 
                                placeholder="Enter negative prompt..."
                                rows="2"
                                data-type="negative"
                            ></textarea>
                            <!-- Negative 프리셋 버튼들 -->
                            <div class="preset-section" data-type="negative">
                                <div class="preset-buttons-wrapper">
                                    <div class="preset-buttons" id="negative-preset-buttons">
                                        <!-- 프리셋 버튼들이 동적으로 추가됨 -->
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 파라미터 섹션 -->
                    <div class="parameters-section">
                        <!-- 생성 파라미터 -->
                        <div class="param-group generation">
                            <h4>Generation Settings</h4>
                            <div class="param-row horizontal">
                                <div class="param-item">
                                    <label for="param-batch-count">배치수 (Batch Count)</label>
                                    <div class="slider-group">
                                        <input type="range" id="param-batch-count-slider" min="1" max="8" value="1" step="1">
                                        <input type="number" id="param-batch-count" min="1" max="8" value="1" class="slider-input">
                                    </div>
                                </div>
                                <div class="param-item">
                                    <label for="param-repeat-count">반복수 (Repeat Count)</label>
                                    <div class="slider-group">
                                        <input type="range" id="param-repeat-count-slider" min="1" max="1000" value="1" step="1">
                                        <input type="number" id="param-repeat-count" min="1" max="1000" value="1" class="slider-input">
                                    </div>
                                </div>
                            </div>
                            <div class="param-row single">
                                <div class="param-item">
                                    <label for="param-denoise">디노이즈 (Denoise Strength)</label>
                                    <div class="slider-group">
                                        <input type="range" id="param-denoise-slider" min="0" max="1" value="0.75" step="0.01" disabled>
                                        <input type="number" id="param-denoise" min="0" max="1" value="0.75" step="0.01" class="slider-input" disabled>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 생성 컨트롤 섹션 -->
                    <div class="generation-controls">
                        <button class="btn-infinity" id="infinity-btn">
                            <span class="infinity-symbol">∞</span>
                            <span class="infinity-text">Infinity Mode</span>
                        </button>
                        <button class="btn-generate" id="generate-btn">
                            <span class="generate-text">Generate</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * CSS 스타일 추가
     */
    addStyles() {
        if (document.getElementById('generation-panel-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'generation-panel-styles';
        style.textContent = `
            .generation-panel {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                width: 900px;
                max-width: calc(100vw - 40px);
                background: var(--bg-panel, rgba(42, 48, 56, 0.95));
                backdrop-filter: blur(20px);
                border: 1px solid rgba(134, 142, 150, 0.2);
                border-radius: 8px;
                box-shadow: 
                    0 6px 24px rgba(0, 0, 0, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.05),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
                z-index: 1000;
                color: var(--text-primary, #e8eaed);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            /* 접힌 상태 스타일 */
            .generation-panel.collapsed {
                height: 60px !important;
                overflow: hidden;
                border-radius: 30px;
            }
            
            .generation-panel.collapsed .panel-content {
                display: none;
            }
            
            .generation-panel.collapsed .collapsed-controls {
                display: flex !important;
                align-items: center;
                justify-content: center;
                gap: 12px;
                height: 100%;
                padding: 0 20px;
            }
            
            .generation-panel:not(.collapsed) .collapsed-controls {
                display: none !important;
            }
            
            /* 접힌 상태 버튼들 */
            .collapsed-controls .btn-infinity.collapsed,
            .collapsed-controls .btn-generate.collapsed {
                height: 40px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                border: none;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .collapsed-controls .btn-infinity.collapsed {
                background: rgba(108, 182, 255, 0.1);
                border: 1px solid rgba(108, 182, 255, 0.3);
                color: #6cb6ff;
                padding: 0 16px;
                min-width: 60px;
            }
            
            .collapsed-controls .btn-infinity.collapsed.active {
                background: linear-gradient(135deg, #6cb6ff 0%, #4a9eff 100%);
                border-color: #6cb6ff;
                color: white;
                box-shadow: 0 0 0 2px rgba(108, 182, 255, 0.3);
            }
            
            .collapsed-controls .btn-generate.collapsed {
                background: linear-gradient(135deg, #4285f4 0%, #34a853 50%, #ea4335 100%);
                color: white;
                padding: 0 24px;
                min-width: 100px;
            }
            
            .collapsed-controls .btn-generate.collapsed.generating {
                background: linear-gradient(135deg, #ff8c00 0%, #ff6b00 100%);
                animation: pulse 1.5s infinite;
            }
            
            .collapsed-controls .btn-infinity.collapsed.generating {
                background: linear-gradient(135deg, #ff8c00 0%, #ff6b00 100%);
                color: white;
                border-color: #ff8c00;
                animation: pulse 1.5s infinite;
            }
            
            .collapsed-controls .expand-btn {
                background: rgba(108, 182, 255, 0.2);
                border: 1px solid rgba(108, 182, 255, 0.4);
                color: #6cb6ff;
                padding: 8px 12px;
                border-radius: 20px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 16px;
            }
            
            .collapsed-controls .expand-btn:hover {
                background: rgba(108, 182, 255, 0.3);
                transform: translateY(-2px);
            }
            
            /* 패널 헤더 */
            .generation-panel .panel-header {
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 6px 16px 4px 16px;
                border-bottom: 1px solid rgba(134, 142, 150, 0.15);
            }
            
            .generation-panel .panel-title {
                display: none;
            }
            
            .generation-panel .panel-title {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--text-primary, #e8eaed);
            }
            
            .generation-panel .collapse-btn {
                background: rgba(108, 182, 255, 0.1);
                border: 1px solid rgba(108, 182, 255, 0.3);
                color: #6cb6ff;
                padding: 2px 0;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 12px;
                width: 100%;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .generation-panel .collapse-btn:hover {
                background: rgba(108, 182, 255, 0.2);
                transform: translateY(-1px);
            }
            
            /* 패널 본문 */
            .generation-panel .panel-body {
                padding: 12px 16px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            /* 로드된 모델 표시 */
            .loaded-model-display {
                background: linear-gradient(145deg, #2a3038 0%, #32383f 100%);
                border: 1px solid rgba(108, 182, 255, 0.3);
                border-radius: 6px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }

            .loaded-model-display .model-label {
                font-size: 12px;
                color: var(--text-secondary, #9aa0a6);
                font-weight: 500;
            }

            .loaded-model-display .model-name {
                font-size: 13px;
                color: #6cb6ff;
                font-weight: 700;
                flex: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            /* 프롬프트 섹션 */
            .prompt-section {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            
            .prompt-group .prompt-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 4px;
            }
            
            .prompt-group label {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-secondary, #9aa0a6);
            }
            
            /* 프리셋 섹션 스타일 */
            .preset-section {
                margin-top: 8px;
                padding: 8px 0;
                border-top: 1px solid rgba(134, 142, 150, 0.1);
            }
            
            .preset-navigation {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            
            .preset-nav-btn {
                background: rgba(108, 182, 255, 0.1);
                border: 1px solid rgba(108, 182, 255, 0.2);
                color: #6cb6ff;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s ease;
                width: 32px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .preset-nav-btn:hover:not(:disabled) {
                background: rgba(108, 182, 255, 0.2);
                transform: scale(1.05);
            }
            
            .preset-nav-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }
            
            .preset-page-indicator {
                font-size: 11px;
                color: var(--text-secondary, #9aa0a6);
                font-family: monospace;
                min-width: 40px;
                text-align: center;
            }
            
            /* 프리셋 버튼 컨테이너 */
            .preset-buttons-wrapper {
                position: relative;
                overflow: hidden;
            }
            
            .preset-buttons {
                display: flex;
                gap: 4px;
                overflow-x: auto;
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none; /* IE/Edge */
                padding: 2px 0;
            }
            
            .preset-buttons::-webkit-scrollbar {
                display: none; /* Chrome/Safari */
            }
            
            /* 우측 페이드 효과 */
            .preset-buttons-wrapper::after {
                content: '';
                position: absolute;
                top: 0;
                right: 0;
                width: 30px;
                height: 100%;
                background: linear-gradient(to left, #1e1e1e 0%, transparent 100%);
                pointer-events: none;
                z-index: 1;
            }
            
            .preset-btn {
                background: linear-gradient(145deg, #2a3038 0%, #32383f 100%);
                border: 1px solid rgba(134, 142, 150, 0.2);
                color: var(--text-primary, #e8eaed);
                padding: 3px 6px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
                font-weight: 500;
                transition: all 0.2s ease;
                white-space: nowrap;
                flex-shrink: 0;
                min-height: 20px;
                max-width: 100px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .preset-btn:hover {
                background: linear-gradient(145deg, #6cb6ff 0%, #4a9eff 100%);
                border-color: #6cb6ff;
                color: white;
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(108, 182, 255, 0.3);
            }
            
            
            .prompt-group textarea {
                width: 100%;
                background: linear-gradient(145deg, #2a3038 0%, #32383f 100%);
                border: 1px solid rgba(134, 142, 150, 0.2);
                border-radius: 8px;
                padding: 12px;
                color: var(--text-primary, #e8eaed);
                font-size: 13px;
                line-height: 1.4;
                resize: vertical;
                transition: all 0.2s ease;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
            }
            
            .prompt-group textarea:focus {
                outline: none;
                border-color: #6cb6ff;
                box-shadow: 
                    inset 0 1px 3px rgba(0, 0, 0, 0.2),
                    0 0 0 3px rgba(108, 182, 255, 0.2);
            }
            
            /* 파라미터 섹션 */
            .parameters-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            
            .param-group h4 {
                margin: 0 0 4px 0;
                font-size: 12px;
                font-weight: 600;
                color: var(--text-primary, #e8eaed);
                border-bottom: 1px solid rgba(134, 142, 150, 0.15);
                padding-bottom: 2px;
            }
            
            .param-row {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-bottom: 6px;
            }
            
            .param-row.horizontal {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            
            .param-row.single {
                display: flex;
                flex-direction: column;
            }
            
            .param-row.options {
                grid-template-columns: 1fr;
            }
            
            .param-item {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            
            .param-item label {
                font-size: 12px;
                font-weight: 500;
                color: var(--text-secondary, #9aa0a6);
            }
            
            .param-item input[type="number"],
            .param-item select {
                background: linear-gradient(145deg, #2a3038 0%, #32383f 100%);
                border: 1px solid rgba(134, 142, 150, 0.2);
                border-radius: 6px;
                padding: 8px 10px;
                color: var(--text-primary, #e8eaed);
                font-size: 12px;
                transition: all 0.2s ease;
            }
            
            .param-item input:focus,
            .param-item select:focus {
                outline: none;
                border-color: #6cb6ff;
                box-shadow: 0 0 0 2px rgba(108, 182, 255, 0.2);
            }
            
            /* 슬라이더 그룹 */
            .slider-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .slider-group input[type="range"] {
                flex: 1;
            }
            
            .slider-group .slider-input {
                width: 60px;
                min-width: 60px;
            }
            
            /* 시드 그룹 */
            .seed-group {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .seed-group input {
                flex: 1;
            }
            
            .seed-random-btn {
                background: rgba(108, 182, 255, 0.1);
                border: 1px solid rgba(108, 182, 255, 0.3);
                color: #6cb6ff;
                padding: 6px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s ease;
            }
            
            .seed-random-btn:hover {
                background: rgba(108, 182, 255, 0.2);
                transform: scale(1.05);
            }
            
            /* 체크박스 그룹 */
            .checkbox-group {
                display: flex;
                gap: 16px;
            }
            
            .checkbox-label {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                font-size: 12px;
                color: var(--text-secondary, #9aa0a6);
            }
            
            .checkbox-label input[type="checkbox"] {
                appearance: none;
                width: 16px;
                height: 16px;
                border: 2px solid rgba(134, 142, 150, 0.3);
                border-radius: 3px;
                background: linear-gradient(145deg, #2a3038 0%, #32383f 100%);
                cursor: pointer;
                position: relative;
                transition: all 0.2s ease;
            }
            
            .checkbox-label input[type="checkbox"]:checked {
                background: linear-gradient(135deg, #6cb6ff 0%, #4a9eff 100%);
                border-color: #6cb6ff;
            }
            
            .checkbox-label input[type="checkbox"]:checked::after {
                content: '✓';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: white;
                font-size: 11px;
                font-weight: bold;
            }
            
            /* 생성 컨트롤 */
            .generation-controls {
                display: flex;
                flex-direction: row;
                gap: 0;
                align-items: stretch;
                justify-content: center;
            }
            
            .btn-infinity,
            .btn-generate {
                border: none;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
            }
            
            .btn-infinity {
                flex: 1;
                height: 48px;
                background: rgba(108, 182, 255, 0.1);
                border: 1px solid rgba(108, 182, 255, 0.3);
                border-right: none;
                border-radius: 8px 0 0 8px;
                color: #6cb6ff;
                font-size: 11px;
                gap: 2px;
                max-width: 33.333%;
            }
            
            .btn-infinity.active {
                background: linear-gradient(135deg, #6cb6ff 0%, #4a9eff 100%);
                color: white;
                border-color: #6cb6ff;
                box-shadow: 0 0 0 2px rgba(108, 182, 255, 0.3);
            }
            
            .btn-infinity .infinity-symbol {
                font-size: 16px;
                font-weight: bold;
            }
            
            .btn-generate {
                flex: 2;
                height: 48px;
                background: linear-gradient(135deg, #4285f4 0%, #34a853 50%, #ea4335 100%);
                color: white;
                font-size: 14px;
                border-radius: 0 8px 8px 0;
                gap: 6px;
                box-shadow: 
                    0 4px 15px rgba(66, 133, 244, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.1);
            }
            
            .generation-controls:hover .btn-infinity,
            .generation-controls:hover .btn-generate {
                transform: translateY(-2px);
            }
            
            .generation-controls:hover .btn-generate {
                box-shadow: 
                    0 8px 25px rgba(66, 133, 244, 0.5),
                    0 0 0 1px rgba(255, 255, 255, 0.15);
            }
            
            .generation-controls:hover .btn-infinity {
                box-shadow: 
                    0 8px 25px rgba(108, 182, 255, 0.3),
                    0 0 0 1px rgba(255, 255, 255, 0.1);
            }
            
            .btn-generate.generating {
                background: linear-gradient(135deg, #ff8c00 0%, #ff6b00 100%);
                animation: pulse 1.5s infinite;
            }
            
            .btn-infinity.generating {
                background: linear-gradient(135deg, #ff8c00 0%, #ff6b00 100%);
                color: white;
                border-color: #ff8c00;
                animation: pulse 1.5s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.8; }
            }
            
            /* 반응형 디자인 */
            @media (max-width: 1000px) {
                .generation-panel {
                    width: 90%;
                }
                
                .prompt-section {
                    grid-template-columns: 1fr;
                    gap: 8px;
                }
            }
            
            @media (max-width: 768px) {
                .generation-panel .panel-body {
                    padding: 10px 12px;
                    gap: 8px;
                }
                
                .prompt-group .prompt-header {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 4px;
                    margin-bottom: 3px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        if (!this.containerElement) return;
        
        // 접기/펼치기 이벤트
        this.addEventHandler('collapse-btn', 'click', () => this.collapse());
        this.addEventHandler('expand-btn', 'click', () => this.expand());
        
        // 프롬프트 입력 이벤트
        this.addEventHandler('positive-prompt', 'input', (e) => this.updatePrompt('positive', e.target.value));
        this.addEventHandler('negative-prompt', 'input', (e) => this.updatePrompt('negative', e.target.value));
        
        // 프리셋 네비게이션 이벤트
        this.setupPresetEventListeners();
        
        // 파라미터 입력 이벤트
        this.setupParameterListeners();
        
        // 생성 버튼 이벤트
        this.addEventHandler('infinity-btn', 'click', () => this.toggleInfinityMode());
        this.addEventHandler('infinity-btn-collapsed', 'click', () => this.toggleInfinityMode());
        this.addEventHandler('generate-btn', 'click', () => this.generate());
        this.addEventHandler('generate-btn-collapsed', 'click', () => this.generate());
        
        // 시드 랜덤 버튼
        this.addEventHandler('seed-random-btn', 'click', () => this.generateRandomSeed());

        // 모델 로드 이벤트 리스너
        document.addEventListener('model:selected', (e) => {
            console.log('Model loaded event received:', e.detail);
            this.state.loadedModel = e.detail;
            this.updateModelDisplay();
            this.saveState();
        });

        // 모델 GPU 로드 완료 이벤트 리스너
        document.addEventListener('model:loaded', (e) => {
            console.log('Model loaded to GPU event received:', e.detail);
            this.state.loadedModel = e.detail;
            this.updateModelDisplay();
            this.saveState();
        });

        // console.log('Event listeners set up');
    }
    
    /**
     * 프리셋 이벤트 리스너 설정
     */
    setupPresetEventListeners() {
        // 동적으로 생성된 프리셋 버튼들은 이벤트 위임 사용
        this.containerElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('preset-btn')) {
                const type = e.target.dataset.type;
                const presetIndex = parseInt(e.target.dataset.presetIndex);
                this.selectPreset(type, presetIndex);
            }
        });
    }
    
    /**
     * 프리셋 페이지 변경
     */
    changePresetPage(type, direction) {
        const presetData = this.state.presets[type];
        const presetsPerPage = this.getPresetsPerPage();
        const totalPages = Math.ceil(presetData.list.length / presetsPerPage);
        
        let newPage = (presetData.page || 0) + direction;
        newPage = Math.max(0, Math.min(newPage, totalPages - 1));
        
        if (newPage !== presetData.page) {
            presetData.page = newPage;
            this.renderPresetButtons(type);
            this.updatePresetPageIndicator(type);
        }
    }
    
    /**
     * 페이지당 프리셋 개수 계산
     */
    getPresetsPerPage() {
        return 6; // 한 페이지에 최대 6개 프리셋 버튼
    }
    
    /**
     * 프리셋 선택
     */
    selectPreset(type, presetIndex) {
        const presetData = this.state.presets[type];
        const preset = presetData.list[presetIndex];
        
        if (preset) {
            // 기존 프롬프트에 새 프리셋을 추가
            this.appendPrompt(type, preset.prompt);
            this.state.presets[type].current = presetIndex;
            this.renderPresetButtons(type); // 활성 상태 업데이트를 위해 재렌더링
            this.saveState();
            
            console.log(`✅ Applied ${type} preset: "${preset.name}" - "${preset.prompt}"`);
        }
    }
    
    /**
     * 프리셋 버튼들 렌더링
     */
    renderPresetButtons(type) {
        const container = this.containerElement.querySelector(`#${type}-preset-buttons`);
        if (!container) {
            console.warn(`❌ Preset buttons container not found: #${type}-preset-buttons`);
            return;
        }
        
        const presetData = this.state.presets[type];
        container.innerHTML = '';
        
        presetData.list.forEach((preset, index) => {
            const button = document.createElement('button');
            button.className = 'preset-btn';
            button.dataset.type = type;
            button.dataset.presetIndex = index;
            button.textContent = preset.name;
            button.title = preset.prompt.substring(0, 100) + (preset.prompt.length > 100 ? '...' : '');
            
            container.appendChild(button);
        });
        
        // console.log(`🔄 Rendered ${presetData.list.length} ${type} preset buttons`);
    }
    
    /**
     * 프리셋 페이지 표시기 업데이트
     */
    updatePresetPageIndicator(type) {
        const indicator = this.containerElement.querySelector(`#${type}-page-indicator`);
        const presetData = this.state.presets[type];
        const presetsPerPage = this.getPresetsPerPage();
        const totalPages = Math.max(1, Math.ceil(presetData.list.length / presetsPerPage));
        const currentPage = (presetData.page || 0) + 1;
        
        if (indicator) {
            indicator.textContent = `${currentPage}/${totalPages}`;
        }
        
        // 네비게이션 버튼 활성화/비활성화
        const prevBtn = this.containerElement.querySelector(`[data-type="${type}"].preset-nav-btn.prev`);
        const nextBtn = this.containerElement.querySelector(`[data-type="${type}"].preset-nav-btn.next`);
        
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    }
    
    /**
     * 파라미터 이벤트 리스너 설정
     */
    setupParameterListeners() {
        const paramMap = {
            'param-batch-count': 'batchCount',
            'param-batch-count-slider': 'batchCount',
            'param-repeat-count': 'repeatCount',
            'param-repeat-count-slider': 'repeatCount',
            'param-denoise': 'denoise',
            'param-denoise-slider': 'denoise'
        };
        
        Object.entries(paramMap).forEach(([elementId, paramKey]) => {
            const element = this.containerElement.querySelector(`#${elementId}`);
            if (!element) return;
            
            const eventType = element.type === 'checkbox' ? 'change' : 'input';
            
            element.addEventListener(eventType, (e) => {
                let value;
                if (e.target.type === 'checkbox') {
                    value = e.target.checked;
                } else if (e.target.type === 'number' || e.target.type === 'range') {
                    value = parseFloat(e.target.value);
                } else {
                    value = e.target.value;
                }
                
                this.updateParameter(paramKey, value);
                
                // 슬라이더와 입력 필드 동기화
                if (elementId.includes('slider')) {
                    const inputId = elementId.replace('-slider', '');
                    const inputElement = this.containerElement.querySelector(`#${inputId}`);
                    if (inputElement) inputElement.value = value;
                } else {
                    const sliderId = elementId + '-slider';
                    const sliderElement = this.containerElement.querySelector(`#${sliderId}`);
                    if (sliderElement) sliderElement.value = value;
                }
            });
        });
    }
    
    /**
     * 이벤트 핸들러 등록 헬퍼
     */
    addEventHandler(elementId, event, handler) {
        const element = this.containerElement.querySelector(`#${elementId}`);
        if (element) {
            element.addEventListener(event, handler);
            
            // 정리를 위해 핸들러 저장
            if (!this.eventHandlers.has(elementId)) {
                this.eventHandlers.set(elementId, []);
            }
            this.eventHandlers.get(elementId).push({ event, handler });
        }
    }
    
    /**
     * 패널 접기
     */
    collapse() {
        this.isCollapsed = true;
        this.containerElement.classList.add('collapsed');
        
        // 접기 후 버튼 상태 동기화
        setTimeout(() => {
            this.updateInfinityButtons();
            this.updateGenerateButtons();
        }, 100);
        
        this.saveState();
        console.log('Generation panel collapsed');
    }
    
    /**
     * 패널 펼치기
     */
    expand() {
        this.isCollapsed = false;
        this.containerElement.classList.remove('collapsed');
        
        // 펼치기 후 버튼 상태 동기화
        setTimeout(() => {
            this.updateInfinityButtons();
            this.updateGenerateButtons();
        }, 100);
        
        this.saveState();
        console.log('Generation panel expanded');
    }
    
    /**
     * 프롬프트 업데이트
     */
    updatePrompt(type, value) {
        this.state.prompts[type] = value;
        this.saveState();
        this.notifyStateChange(`prompt_${type}`, value);
    }
    
    /**
     * 프롬프트 추가 (기존 프롬프트 뒤에 추가)
     */
    appendPrompt(type, newPrompt) {
        const currentPrompt = this.state.prompts[type] || '';
        let updatedPrompt;
        
        if (currentPrompt.trim()) {
            // 기존 프롬프트가 있으면 쉼표와 공백 추가 후 새 프롬프트 추가
            updatedPrompt = currentPrompt.trim() + ', ' + newPrompt.trim();
        } else {
            // 기존 프롬프트가 없으면 새 프롬프트만 사용
            updatedPrompt = newPrompt.trim();
        }
        
        this.state.prompts[type] = updatedPrompt;
        this.updatePromptUI(type, updatedPrompt);
        this.saveState();
        this.notifyStateChange(`prompt_${type}`, updatedPrompt);
    }
    
    /**
     * 파라미터 업데이트
     */
    updateParameter(key, value) {
        this.state.parameters[key] = value;
        this.saveState();
        this.notifyStateChange(`parameter_${key}`, value);
        console.log(`Parameter updated: ${key} = ${value}`);
    }
    
    /**
     * 프리셋 액션 처리
     */
    handlePresetAction(e) {
        const type = e.target.dataset.type;
        const action = e.target.classList.contains('prev') ? 'prev' :
                      e.target.classList.contains('next') ? 'next' :
                      e.target.classList.contains('save') ? 'save' : null;
        
        if (!type || !action) return;
        
        switch (action) {
            case 'prev':
                this.navigatePreset(type, -1);
                break;
            case 'next':
                this.navigatePreset(type, 1);
                break;
            case 'save':
                this.savePreset(type);
                break;
        }
    }
    
    /**
     * 프리셋 네비게이션
     */
    navigatePreset(type, direction) {
        const presetData = this.state.presets[type];
        if (presetData.list.length === 0) return;
        
        const newIndex = (presetData.current + direction + presetData.list.length) % presetData.list.length;
        presetData.current = newIndex;
        
        const preset = presetData.list[newIndex];
        if (preset) {
            this.updatePrompt(type, preset.content);
            this.updatePromptUI(type, preset.content);
            this.updatePresetIndicator(type);
        }
        
        this.saveState();
    }
    
    /**
     * 프리셋 저장
     */
    savePreset(type) {
        const content = this.state.prompts[type];
        if (!content.trim()) return;
        
        const filename = prompt(`Enter preset name for ${type} prompt:`, `${type}_preset_${Date.now()}`);
        if (!filename) return;
        
        const preset = {
            name: filename,
            content: content,
            created: Date.now()
        };
        
        this.state.presets[type].list.push(preset);
        this.state.presets[type].current = this.state.presets[type].list.length - 1;
        
        // 실제 파일 시스템에 저장 (시뮬레이션)
        this.savePresetToFile(type, preset);
        
        this.updatePresetIndicator(type);
        this.saveState();
        
        console.log(`Preset saved: ${filename} (${type})`);
    }
    
    /**
     * 무한 생성 모드 토글
     */
    toggleInfinityMode() {
        this.state.generation.infinityMode = !this.state.generation.infinityMode;
        
        // 즉시 UI 업데이트
        this.updateInfinityButtons();
        this.updateRepeatCountState();
        
        // 추가적으로 약간의 지연 후 한 번 더 동기화 (접힌 상태 고려)
        setTimeout(() => {
            this.updateInfinityButtons();
        }, 50);
        
        this.saveState();
        
        console.log(`Infinity mode: ${this.state.generation.infinityMode ? 'ON' : 'OFF'}`);
    }
    
    /**
     * 반복수 슬라이더 활성화/비활성화 업데이트
     */
    updateRepeatCountState() {
        const repeatSlider = this.containerElement?.querySelector('#param-repeat-count-slider');
        const repeatInput = this.containerElement?.querySelector('#param-repeat-count');
        
        if (repeatSlider && repeatInput) {
            const isDisabled = this.state.generation.infinityMode;
            repeatSlider.disabled = isDisabled;
            repeatInput.disabled = isDisabled;
            
            // 비활성화 시 스타일 적용
            if (isDisabled) {
                repeatSlider.style.opacity = '0.5';
                repeatInput.style.opacity = '0.5';
            } else {
                repeatSlider.style.opacity = '1';
                repeatInput.style.opacity = '1';
            }
        }
    }
    
    
    
    /**
     * 생성 버튼 클릭
     */
    /**
     * 이미지 생성 실행 (WebSocket)
     */
    async generate() {
        if (this.state.generation.isGenerating) {
            this.stopGeneration();
            return;
        }

        const generationData = this.collectGenerationData();

        // stateManager를 통해 생성 요청 전달
        stateManager.updateState('generation_request', generationData);

        this.state.generation.isGenerating = true;
        this.updateGenerateButtons();

        // 추가적으로 약간의 지연 후 한 번 더 동기화 (접힌 상태 고려)
        setTimeout(() => {
            this.updateGenerateButtons();
            this.updateInfinityButtons();
        }, 50);

        this.saveState();

        console.log('Starting generation via WebSocket:', generationData);

        try {
            // Check if image is selected for I2I
            let initImageBase64 = null;
            if (window.canvasInstance && window.canvasInstance.getSelectedImage) {
                const selectedImage = window.canvasInstance.getSelectedImage();
                if (selectedImage && selectedImage.image) {
                    // Convert Konva image to base64
                    const konvaImage = selectedImage.image;
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = konvaImage.width();
                    tempCanvas.height = konvaImage.height();
                    const ctx = tempCanvas.getContext('2d');
                    const img = konvaImage.image();
                    ctx.drawImage(img, 0, 0);
                    const dataURL = tempCanvas.toDataURL('image/png');
                    initImageBase64 = dataURL.split(',')[1]; // Remove data:image/png;base64, prefix
                    console.log('I2I mode: Using selected image from canvas');
                }
            }

            // Prepare generation request
            const requestData = {
                positive_prompt: generationData.prompts.positive || '',
                negative_prompt: generationData.prompts.negative || '',
                width: generationData.width || 512,
                height: generationData.height || 512,
                batch_count: generationData.batchCount || 1,
                repeat_count: generationData.repeatCount || 1,
                steps: generationData.steps || 20,
                cfg_scale: generationData.cfgScale || 7.5,
                sampler: generationData.sampler || 'dpm++_2m',
                use_karras: generationData.useKarras !== false,
                seed: generationData.seed || -1,
                base_model: this.state.loadedModel
                    ? (this.state.loadedModel.subfolder
                        ? `${this.state.loadedModel.subfolder}/${this.state.loadedModel.name}`
                        : this.state.loadedModel.name)
                    : null,
                vae: generationData.vae || null,
                clip_skip: generationData.clipSkip || 1,
                loras: generationData.loras || [],
                init_image: initImageBase64,
                denoise: generationData.denoise || 0.75,
                detailers: generationData.detailers || {}
            };

            console.log('Sending generation request via WebSocket:', requestData);

            // Connect to WebSocket
            await websocketService.connect('/ws/generate');

            // Register message handler for this generation session
            const handlerId = 'generation_panel';
            let generatedImageCount = 0;

            websocketService.on(handlerId, (message) => {
                console.log('📨 WebSocket message received:', message.type);

                switch (message.type) {
                    case 'status':
                        console.log(`Status: ${message.message} (stage: ${message.stage})`);
                        if (window.showNotification) {
                            window.showNotification('info', message.message);
                        }
                        break;

                    case 'progress':
                        console.log(`Progress: ${message.current}/${message.total} (${message.percent}%)`);
                        // TODO: Update progress bar UI
                        break;

                    case 'image':
                        console.log(`Image ${message.index} received`);
                        generatedImageCount++;

                        // Add image to canvas immediately
                        this.addImageToCanvas(message.data, message.index);
                        break;

                    case 'complete':
                        console.log('Generation complete!', message.metadata);
                        if (window.showNotification) {
                            window.showNotification('success', `Generated ${message.metadata.total_images} image(s) successfully!`);
                        }

                        // Clean up handler
                        websocketService.off(handlerId);

                        // Reset state
                        this.state.generation.isGenerating = false;
                        this.updateGenerateButtons();

                        // 생성 완료 후에도 버튼 상태 동기화
                        setTimeout(() => {
                            this.updateGenerateButtons();
                            this.updateInfinityButtons();
                        }, 50);

                        // 무한 모드라면 다시 시작
                        if (this.state.generation.infinityMode && this.isRandomSeed()) {
                            this.generateRandomSeed();
                            setTimeout(() => this.generate(), 1000);
                        }
                        break;

                    case 'error':
                        console.error('Generation error:', message.error);
                        if (window.showNotification) {
                            window.showNotification('error', `Generation failed: ${message.error}`);
                        }

                        // Clean up handler
                        websocketService.off(handlerId);

                        // Reset state
                        this.state.generation.isGenerating = false;
                        this.updateGenerateButtons();

                        setTimeout(() => {
                            this.updateGenerateButtons();
                            this.updateInfinityButtons();
                        }, 50);
                        break;
                }
            });

            // Send generation request
            await websocketService.send(requestData);
            console.log('Generation request sent via WebSocket');

        } catch (error) {
            console.error('Generation error:', error);

            // Show error notification
            const errorMsg = error.message || error.toString() || 'Unknown error occurred';
            if (window.showNotification) {
                window.showNotification('error', `Generation failed: ${errorMsg}`);
            } else {
                alert(`Generation failed: ${errorMsg}`);
            }

            // Reset generating state
            this.state.generation.isGenerating = false;
            this.updateGenerateButtons();

            setTimeout(() => {
                this.updateGenerateButtons();
                this.updateInfinityButtons();
            }, 50);
        }
    }

    /**
     * Add image to canvas from base64 data URI
     */
    addImageToCanvas(imageBase64, index) {
        console.log(`Adding image ${index} to canvas from data URI`);

        // Calculate viewport center
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;

        // Create image element
        const img = new Image();
        img.onload = () => {
            console.log(`Image ${index} loaded successfully, dimensions:`, img.width, 'x', img.height);

            // Add image to canvas at viewport center
            if (window.addImageToCanvasFromElementsMenu) {
                const offsetX = viewportCenterX + (index * 20);
                const offsetY = viewportCenterY + (index * 20);
                console.log(`Calling addImageToCanvasFromElementsMenu for image ${index} at position:`, offsetX, offsetY);
                window.addImageToCanvasFromElementsMenu(img, offsetX, offsetY);
                console.log(`Generated image ${index} added to canvas at viewport center`);
            } else {
                console.warn('addImageToCanvasFromElementsMenu function not available');
            }
        };
        img.onerror = (e) => {
            console.error(`Failed to load generated image ${index} from data URI`, e);
        };
        img.src = imageBase64;
    }

        /**
     * 생성 중단
     */
    stopGeneration() {
        this.state.generation.isGenerating = false;
        this.updateGenerateButtons();
        
        // 중단 후 버튼 상태 동기화
        setTimeout(() => {
            this.updateGenerateButtons();
            this.updateInfinityButtons();
        }, 50);
        
        stateManager.updateState('generation_stop', true);
        console.log('Generation stopped');
    }
    
    /**
     * 랜덤 시드 생성
     */
    generateRandomSeed() {
        const randomSeed = Math.floor(Math.random() * 2147483647);
        this.updateParameter('seed', randomSeed);
        
        const seedInput = this.containerElement.querySelector('#param-seed');
        if (seedInput) seedInput.value = randomSeed;
    }
    
    /**
     * 시드가 랜덤인지 확인
     */
    isRandomSeed() {
        return this.state.parameters.seed === -1;
    }
    
    /**
     * 생성 데이터 수집 (Parameters, LoRA, Detailers 포함)
     */
    collectGenerationData() {
        // FloatingPanel에서 컴포넌트들 가져오기
        let advancedParameters = {};
        let selectedLoRAs = [];
        let activeDetailers = {};

        try {
            // Parameters 패널에서 컴포넌트 가져오기
            const parametersPanel = getPanelInstance('parameters-panel');
            if (parametersPanel && parametersPanel.components) {
                // 패널의 첫 번째 컴포넌트가 ParametersComponent
                const component = Array.from(parametersPanel.components.values())[0];
                if (component && typeof component.getParameters === 'function') {
                    advancedParameters = component.getParameters();
                }
            }

            // LoRA Selector 패널에서 컴포넌트 가져오기
            const loraPanel = getPanelInstance('lora-selector-panel');
            if (loraPanel && loraPanel.components) {
                const component = Array.from(loraPanel.components.values())[0];
                if (component && typeof component.getSelectedLoRAs === 'function') {
                    selectedLoRAs = component.getSelectedLoRAs();
                }
            }

            // Multi Detailer 패널에서 컴포넌트 가져오기
            const detailerPanel = getPanelInstance('multi-detailer-panel');
            if (detailerPanel && detailerPanel.components) {
                const component = Array.from(detailerPanel.components.values())[0];
                if (component && typeof component.getActiveDetailers === 'function') {
                    activeDetailers = component.getActiveDetailers();
                }
            }
        } catch (error) {
            console.warn('Error collecting component data:', error);
        }

        return {
            // 프롬프트
            prompts: { ...this.state.prompts },

            // Generation Panel 파라미터
            batchCount: this.state.parameters.batchCount,
            repeatCount: this.state.parameters.repeatCount,
            denoise: this.state.parameters.denoise,

            // Parameters 컴포넌트 파라미터
            ...advancedParameters,

            // LoRA 정보
            loras: selectedLoRAs,

            // 디테일러 정보
            detailers: activeDetailers,

            // 메타 정보
            timestamp: Date.now(),
            infinityMode: this.state.generation.infinityMode
        };
    }
    
    /**
     * UI 업데이트 메서드들
     */
    updatePromptUI(type, value) {
        const textarea = this.containerElement.querySelector(`#${type}-prompt`);
        if (textarea) textarea.value = value;
    }
    
    updatePresetIndicator(type) {
        const indicator = this.containerElement.querySelector(`#${type}-preset-indicator`);
        const presetData = this.state.presets[type];
        
        if (indicator && presetData) {
            const current = presetData.current + 1;
            const total = Math.max(presetData.list.length, 1);
            indicator.textContent = `${current}/${total}`;
        }
    }
    
    updateInfinityButtons() {
        const buttons = [
            this.containerElement.querySelector('#infinity-btn'),
            this.containerElement.querySelector('#infinity-btn-collapsed')
        ];
        
        buttons.forEach(btn => {
            if (btn) {
                btn.classList.toggle('active', this.state.generation.infinityMode);
            }
        });
    }
    
    updateGenerateButtons() {
        const generateButtons = [
            this.containerElement.querySelector('#generate-btn'),
            this.containerElement.querySelector('#generate-btn-collapsed')
        ];

        const infinityButtons = [
            this.containerElement.querySelector('#infinity-btn'),
            this.containerElement.querySelector('#infinity-btn-collapsed')
        ];

        const text = this.state.generation.isGenerating ? 'Stop' : 'Generate';

        generateButtons.forEach(btn => {
            if (btn) {
                btn.classList.toggle('generating', this.state.generation.isGenerating);
                const textSpan = btn.querySelector('.generate-text');
                if (textSpan) textSpan.textContent = text;
                else if (btn.classList.contains('collapsed')) btn.textContent = text;
            }
        });

        // infinity 모드가 활성화된 상태에서 generating이면 infinity 버튼도 주황색으로
        const shouldInfinityGenerate = this.state.generation.isGenerating && this.state.generation.infinityMode;
        infinityButtons.forEach(btn => {
            if (btn) {
                btn.classList.toggle('generating', shouldInfinityGenerate);
            }
        });
    }

    /**
     * 로드된 모델 이름 표시 업데이트
     */
    updateModelDisplay() {
        const displayElement = this.containerElement?.querySelector('#loaded-model-display');
        const nameElement = this.containerElement?.querySelector('#loaded-model-name');

        if (!displayElement || !nameElement) return;

        if (this.state.loadedModel) {
            // Extract model name from path or use name property
            const modelName = this.state.loadedModel.name ||
                             this.state.loadedModel.path?.split(/[\/\\]/).pop() ||
                             'Unknown Model';

            nameElement.textContent = modelName;
            displayElement.style.display = 'flex';
            console.log('Model display updated:', modelName);
        } else {
            displayElement.style.display = 'none';
        }
    }
    
    /**
     * 전체 UI 업데이트
     */
    updateUI() {
        if (!this.containerElement) return;
        
        // 접기 상태 복원
        if (this.isCollapsed) {
            this.containerElement.classList.add('collapsed');
        }
        
        // 프롬프트 값 복원
        Object.entries(this.state.prompts).forEach(([type, value]) => {
            this.updatePromptUI(type, value);
        });
        
        // 파라미터 값 복원
        Object.entries(this.state.parameters).forEach(([key, value]) => {
            const elementIds = this.getElementIdsForParameter(key);
            elementIds.forEach(id => {
                const element = this.containerElement.querySelector(`#${id}`);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = value;
                    } else {
                        element.value = value;
                    }
                }
            });
        });
        
        // 프리셋 버튼들과 페이지 표시기 업데이트
        ['positive', 'negative'].forEach(type => {
            this.renderPresetButtons(type);
        });
        
        // 생성 컨트롤 상태 업데이트
        this.updateInfinityButtons();
        this.updateGenerateButtons();

        // 조건부 슬라이더 상태 업데이트
        this.updateRepeatCountState();

        // 모델 표시 업데이트
        this.updateModelDisplay();
        
        // 추가적으로 약간의 지연 후 한 번 더 상태 동기화
        setTimeout(() => {
            this.updateInfinityButtons();
        }, 50);
        
        // console.log('UI updated');
    }
    
    /**
     * 파라미터 키에 해당하는 엘리먼트 ID들 반환
     */
    getElementIdsForParameter(key) {
        const map = {
            width: ['param-width'],
            height: ['param-height'],
            steps: ['param-steps', 'param-steps-slider'],
            cfgScale: ['param-cfg', 'param-cfg-slider'],
            seed: ['param-seed'],
            sampler: ['param-sampler'],
            scheduler: ['param-scheduler'],
            fixedSeed: ['param-fixed-seed'],
            addNoise: ['param-add-noise']
        };
        
        return map[key] || [];
    }
    
    /**
     * 프리셋 로드 (파일 시스템에서)
     */
    async loadPresets() {
        try {
            // 긍정 프롬프트 프리셋 로드
            await this.loadPresetType('positive', 'posprpt');
            
            // 부정 프롬프트 프리셋 로드
            await this.loadPresetType('negative', 'negprpt');
            
            // 프리셋 로드 완료 후 UI 업데이트
            setTimeout(() => {
                ['positive', 'negative'].forEach(type => {
                    this.renderPresetButtons(type);
                });
            }, 100);
            
            // console.log('✅ Presets loaded from JSON files');
        } catch (error) {
            console.error('Failed to load presets:', error);
            // 실패 시 기본값 사용
            this.loadDefaultPresets();
        }
    }

    async loadPresetType(type, folder) {
        try {
            // Fetch API로 프리셋 파일 목록 가져오기는 불가능하므로
            // 알려진 파일들을 직접 로드
            const presetFiles = await this.getPresetFileList(folder);
            const presets = [];

            for (const filename of presetFiles) {
                try {
                    const response = await fetch(`./models/presets/${folder}/${filename}`);
                    if (response.ok) {
                        let prompt = '';
                        
                        if (filename.endsWith('.json')) {
                            const data = await response.json();
                            prompt = data.prompt || '';
                        } else if (filename.endsWith('.txt')) {
                            prompt = await response.text();
                            prompt = prompt.trim();
                        }
                        
                        const presetName = filename.replace(/\.(json|txt)$/, '').replace(/_/g, ' ');
                        const preset = {
                            name: this.capitalizeWords(presetName),
                            prompt: prompt
                        };
                        presets.push(preset);
                        // console.log(`📄 Loaded ${type} preset: "${preset.name}" - "${preset.prompt.substring(0, 50)}..."`);
                    }
                } catch (error) {
                    console.warn(`Failed to load preset ${filename}:`, error);
                }
            }

            this.state.presets[type].list = presets;
            this.state.presets[type].current = 0;
            this.state.presets[type].page = 0; // 페이징을 위한 현재 페이지

        } catch (error) {
            console.error(`Failed to load ${type} presets:`, error);
            this.state.presets[type].list = this.getDefaultPresets(type);
        }
    }

    async getPresetFileList(folder) {
        // 알려진 파일 목록 (실제 디렉터리 스캔 결과에 기반)
        const knownFiles = {
            'posprpt': ['anime_style.json', 'epic_style.json', 'high_quality.json', 'ultra_quality.json', 'default.txt', 'portrait.txt'],
            'negprpt': ['basic.json', 'painting.json', 'default.txt', 'strong.txt']
        };
        return knownFiles[folder] || [];
    }

    capitalizeWords(str) {
        return str.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }

    loadDefaultPresets() {
        ['positive', 'negative'].forEach(type => {
            this.state.presets[type].list = this.getDefaultPresets(type);
            this.state.presets[type].current = 0;
            this.state.presets[type].page = 0;
        });
    }
    
    /**
     * 기본 프리셋 반환
     */
    getDefaultPresets(type) {
        const defaultPresets = {
            positive: [
                { name: 'Default', content: 'masterpiece, best quality, highly detailed', created: Date.now() },
                { name: 'Portrait', content: 'portrait, beautiful face, detailed eyes, soft lighting', created: Date.now() }
            ],
            negative: [
                { name: 'Default', content: 'low quality, blurry, distorted', created: Date.now() },
                { name: 'Strong', content: 'low quality, worst quality, blurry, distorted, deformed, bad anatomy', created: Date.now() }
            ]
        };
        
        return defaultPresets[type] || [];
    }
    
    /**
     * 프리셋 파일 저장 (시뮬레이션)
     */
    savePresetToFile(type, preset) {
        // 실제 구현에서는 파일 시스템에 저장
        console.log(`Preset would be saved to: ${this.presetPaths[type]}/${preset.name}.txt`);
    }
    
    /**
     * 상태 저장
     */
    saveState() {
        stateManager.saveComponentState('generationPanel', {
            ...this.state,
            isCollapsed: this.isCollapsed
        });
    }
    
    /**
     * 상태 복원
     */
    restoreState() {
        const savedState = stateManager.getComponentState('generationPanel');
        if (savedState) {
            Object.assign(this.state, savedState);
            this.isCollapsed = savedState.isCollapsed || false;
            console.log('State restored:', savedState);
        }
    }
    
    /**
     * 상태 변경 알림
     */
    notifyStateChange(key, value) {
        stateManager.updateState(key, value);
        
        // 커스텀 이벤트 발생
        document.dispatchEvent(new CustomEvent('generationPanel:stateChange', {
            detail: { key, value, fullState: this.state }
        }));
    }
    
    /**
     * 외부 API 메서드들
     */
    getPrompts() {
        return { ...this.state.prompts };
    }
    
    getParameters() {
        return { ...this.state.parameters };
    }
    
    getState() {
        return { ...this.state };
    }
    
    setPrompt(type, value) {
        this.updatePrompt(type, value);
        this.updatePromptUI(type, value);
    }
    
    setParameter(key, value) {
        this.updateParameter(key, value);
        const elementIds = this.getElementIdsForParameter(key);
        elementIds.forEach(id => {
            const element = this.containerElement.querySelector(`#${id}`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            }
        });
    }
    
    /**
     * 컴포넌트 정리
     */
    destroy() {
        // console.log('🗑️ GenerationPanel destroy() called');
        
        // stateManager 구독 해제
        if (this.denoiseStateUnsubscribe) {
            // console.log('🗑️ Unsubscribing from isImageSelected state');
            this.denoiseStateUnsubscribe();
            this.denoiseStateUnsubscribe = null;
        }
        
        // 이벤트 리스너 정리
        this.eventHandlers.forEach((handlers, elementId) => {
            const element = this.containerElement?.querySelector(`#${elementId}`);
            if (element) {
                handlers.forEach(({ event, handler }) => {
                    element.removeEventListener(event, handler);
                });
            }
        });
        
        this.eventHandlers.clear();
        
        // console.log('🗑️ GenerationPanel destroyed');
    }
}