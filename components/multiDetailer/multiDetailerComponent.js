// components/multiDetailer/multiDetailerComponent.js

/**
 * 멀티 디테일러 컴포넌트 - 플로팅 패널에서 사용
 * Stable Diffusion 이미지 디테일 향상을 위한 4개 디테일러 관리 인터페이스
 */

export class MultiDetailerComponent {
    constructor() {
        this.containerElement = null;
        this.isInitialized = false;
        this.apiUrl = 'http://localhost:9001/api';
        
        // 각 디테일러별 설정 저장
        this.detailers = {};
        for (let i = 1; i <= 4; i++) {
            this.detailers[i] = {
                active: false,
                detectionModel: '',
                confidence: 0.3,
                maskPadding: 32,
                maskBlur: 4,
                prompt: 'a beautiful detailed face, masterpiece',
                negativePrompt: 'blurry, ugly, deformed',
                denoisingStrength: 0.4,
                sampler: 'Euler a',
                steps: 25,
                cfgScale: 7.0
            };
        }
        
        this.currentTab = 1;
        this.detectionModels = []; // 로컬에서 불러온 모델 목록
        this.eventListeners = []; // 이벤트 리스너 추적을 위한 배열
        this.tabContentElements = {}; // 탭별 DOM 엘리먼트 캐시
        this.loadingState = { models: false, error: null }; // 로딩 상태 추적
    }
    
    /**
     * renewal 아키텍처 호환 init 메서드
     * DOM 마운트 후에 호출되어 초기화 수행
     */
    init() {
        if (this.isInitialized || !this.containerElement) {
            console.log('MultiDetailer init skipped - already initialized or no container');
            return;
        }
        
        console.log('MultiDetailer initializing for the first time...');
        this.isInitialized = true;
        
        // DOM이 마운트된 후에 이벤트 리스너 설정과 API 호출
        setTimeout(() => {
            this.setupEventListeners();
            this.loadDetectionModels();
            this.updateTabContent();
            console.log('MultiDetailer initialization complete');
        }, 0);
    }
    
    render() {
        const container = document.createElement('div');
        container.className = 'multi-detailer-component';
        container.style.cssText = `
            height: 100%;
            display: flex;
            flex-direction: column;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;
        
        // 탭 네비게이션
        const tabNav = document.createElement('div');
        tabNav.className = 'tab-nav';
        tabNav.style.cssText = `
            display: flex;
            border-bottom: 1px solid rgba(134, 142, 150, 0.2);
            margin-bottom: 10px;
            background: rgba(245, 246, 247, 0.8);
            border-radius: 6px 6px 0 0;
            padding: 3px;
            gap: 1px;
        `;
        
        // 탭 버튼들 생성
        for (let i = 1; i <= 4; i++) {
            const tabBtn = this.createTabButton(i, i === 1);
            tabNav.appendChild(tabBtn);
        }
        
        // 탭 컨텐트 컨테이너
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.style.cssText = `
            flex: 1;
            overflow-y: auto;
            min-height: 0;
            padding: 6px 0;
        `;
        
        // 현재 활성 탭 컨텐트
        const activeTabContent = document.createElement('div');
        activeTabContent.id = 'active-tab-content';
        activeTabContent.innerHTML = this.generateTabContentHtml(1);
        
        tabContent.appendChild(activeTabContent);
        
        // 컨테이너 조립
        container.appendChild(tabNav);
        container.appendChild(tabContent);
        
        // CSS 스타일 추가
        this.addStyles();
        
        // 컨테이너를 참조로 저장
        this.containerElement = container;
        
        return container;
    }
    
    createTabButton(index, active = false) {
        const button = document.createElement('button');
        button.className = `detailer-tab-btn ${active ? 'active' : ''}`;
        button.dataset.tab = index;
        button.textContent = `Detailer ${index}`;
        button.style.cssText = `
            flex: 1;
            padding: 6px 4px;
            border: none;
            background: ${active ? 'rgba(108, 182, 255, 0.15)' : 'transparent'};
            color: ${active ? '#1a73e8' : '#5f6368'};
            cursor: pointer;
            font-size: 11px;
            font-weight: ${active ? '600' : '400'};
            border-radius: 4px;
            transition: all 0.2s ease;
            margin: 0 1px;
            min-width: 0;
            text-overflow: ellipsis;
            overflow: hidden;
            white-space: nowrap;
        `;
        
        return button;
    }
    
    generateTabContentHtml(index) {
        const detailer = this.detailers[index];
        
        return `
            <div class="detailer-tab-pane" data-tab="${index}">
                <!-- 활성화 토글 -->
                <div class="detailer-activation-section">
                    <label class="detailer-toggle-label">
                        <input type="checkbox" 
                               id="detailer-${index}-active" 
                               class="detailer-active-toggle" 
                               ${detailer.active ? 'checked' : ''}>
                        <span class="toggle-text">디테일러 ${index} 활성</span>
                    </label>
                </div>

                <!-- 파라미터 필드셋 -->
                <fieldset id="detailer-${index}-fieldset" ${detailer.active ? '' : 'disabled'}>
                    
                    <!-- 탐지 설정 -->
                    <div class="param-group">
                        <h4 class="group-title">탐지 (Detection)</h4>
                        
                        <div class="param-row">
                            <label for="detailer-${index}-detection-model">Detection Model</label>
                            <select id="detailer-${index}-detection-model">
                                <option>Loading models...</option>
                            </select>
                        </div>
                        
                        <div class="param-row slider-row">
                            <label for="detailer-${index}-confidence">Confidence</label>
                            <div class="slider-container">
                                <input type="range" 
                                       id="detailer-${index}-confidence" 
                                       min="0" max="1" step="0.01" 
                                       value="${detailer.confidence}">
                                <span class="slider-value" id="detailer-${index}-confidence-value">${detailer.confidence.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 마스크 처리 설정 -->
                    <div class="param-group">
                        <h4 class="group-title">마스크 처리 (Mask Preprocessing)</h4>
                        
                        <div class="param-row-split">
                            <div class="param-row">
                                <label for="detailer-${index}-mask-padding">Mask Padding</label>
                                <input type="number" 
                                       id="detailer-${index}-mask-padding" 
                                       value="${detailer.maskPadding}" 
                                       min="0" max="256" step="4">
                            </div>
                            <div class="param-row">
                                <label for="detailer-${index}-mask-blur">Mask Blur</label>
                                <input type="number" 
                                       id="detailer-${index}-mask-blur" 
                                       value="${detailer.maskBlur}" 
                                       min="0" max="64" step="1">
                            </div>
                        </div>
                    </div>

                    <!-- 인페인팅 설정 -->
                    <div class="param-group">
                        <h4 class="group-title">인페인팅 (Inpainting)</h4>
                        
                        <div class="param-row">
                            <label for="detailer-${index}-prompt">Prompt</label>
                            <textarea id="detailer-${index}-prompt" 
                                      rows="2" 
                                      placeholder="a beautiful detailed face, masterpiece">${detailer.prompt}</textarea>
                        </div>
                        
                        <div class="param-row">
                            <label for="detailer-${index}-negative-prompt">Negative Prompt</label>
                            <textarea id="detailer-${index}-negative-prompt" 
                                      rows="2" 
                                      placeholder="blurry, ugly, deformed">${detailer.negativePrompt}</textarea>
                        </div>
                        
                        <div class="param-row slider-row">
                            <label for="detailer-${index}-denoising-strength">Denoising Strength</label>
                            <div class="slider-container">
                                <input type="range" 
                                       id="detailer-${index}-denoising-strength" 
                                       min="0" max="1" step="0.01" 
                                       value="${detailer.denoisingStrength}">
                                <span class="slider-value" id="detailer-${index}-denoising-strength-value">${detailer.denoisingStrength.toFixed(2)}</span>
                            </div>
                        </div>
                        
                        <div class="param-row">
                            <label for="detailer-${index}-sampler">Sampler</label>
                            <input type="text" 
                                   id="detailer-${index}-sampler" 
                                   value="${detailer.sampler}">
                        </div>
                        
                        <div class="param-row-split">
                            <div class="param-row">
                                <label for="detailer-${index}-steps">Steps</label>
                                <input type="number" 
                                       id="detailer-${index}-steps" 
                                       value="${detailer.steps}" 
                                       min="1" max="100" step="1">
                            </div>
                            <div class="param-row">
                                <label for="detailer-${index}-cfg-scale">CFG Scale</label>
                                <input type="number" 
                                       id="detailer-${index}-cfg-scale" 
                                       value="${detailer.cfgScale}" 
                                       min="1" max="30" step="0.1">
                            </div>
                        </div>
                    </div>
                    
                </fieldset>
            </div>
        `;
    }
    
    addStyles() {
        if (document.getElementById('multi-detailer-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'multi-detailer-styles';
        style.textContent = `
            .multi-detailer-component {
                color: #333;
                font-size: 13px;
                width: 100%;
            }
            
            .multi-detailer-component .tab-nav {
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                gap: 1px;
            }
            
            .multi-detailer-component .detailer-tab-btn {
                position: relative;
                font-size: 11px;
                padding: 6px 4px;
                min-width: 0;
                text-overflow: ellipsis;
                overflow: hidden;
                white-space: nowrap;
            }
            
            .multi-detailer-component .detailer-tab-btn:hover {
                background: rgba(108, 182, 255, 0.1);
                color: #1a73e8;
            }
            
            .multi-detailer-component .detailer-tab-btn.active {
                position: relative;
            }
            
            .multi-detailer-component .detailer-tab-btn.active::after {
                content: '';
                position: absolute;
                bottom: -4px;
                left: 50%;
                transform: translateX(-50%);
                width: 16px;
                height: 2px;
                background: #1a73e8;
                border-radius: 1px;
            }
            
            .detailer-activation-section {
                background: rgba(76, 175, 80, 0.05);
                border: 1px solid rgba(76, 175, 80, 0.2);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 12px;
            }
            
            .detailer-toggle-label {
                display: flex;
                align-items: center;
                gap: 6px;
                font-weight: 600;
                color: #2e7d32;
                cursor: pointer;
                font-size: 12px;
            }
            
            .detailer-toggle-label input[type="checkbox"] {
                width: 14px;
                height: 14px;
                accent-color: #4caf50;
                margin: 0;
            }
            
            .toggle-text {
                user-select: none;
            }
            
            fieldset {
                border: 1px solid rgba(0, 0, 0, 0.1);
                border-radius: 6px;
                padding: 12px;
                margin: 0;
            }
            
            fieldset[disabled] {
                opacity: 0.6;
                background: rgba(0, 0, 0, 0.02);
            }
            
            .param-group {
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            }
            
            .param-group:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }
            
            .group-title {
                margin: 0 0 10px 0;
                color: #1565c0;
                font-size: 13px;
                font-weight: 600;
                padding: 3px 0;
                border-bottom: 2px solid rgba(21, 101, 192, 0.2);
            }
            
            .param-row {
                margin-bottom: 6px;
                display: flex;
                flex-direction: column;
                gap: 3px;
            }
            
            .param-row-split {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-bottom: 6px;
            }
            
            .param-row-split .param-row {
                flex: none;
                margin-bottom: 0;
            }
            
            .param-row label {
                font-size: 11px;
                font-weight: 500;
                color: #424242;
                margin-bottom: 2px;
                line-height: 1.2;
            }
            
            .param-row input, .param-row select, .param-row textarea {
                padding: 5px 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 11px;
                transition: border-color 0.2s ease;
                background: white;
                width: 100%;
                box-sizing: border-box;
            }
            
            .param-row input:focus, .param-row select:focus, .param-row textarea:focus {
                outline: none;
                border-color: #1976d2;
                box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
            }
            
            .param-row textarea {
                resize: vertical;
                min-height: 50px;
                font-family: inherit;
            }
            
            .slider-row {
                flex-direction: column !important;
                align-items: stretch;
                gap: 4px;
            }
            
            .slider-row label {
                min-width: auto;
                margin-bottom: 2px;
                font-size: 11px;
            }
            
            .slider-container {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .slider-row input[type="range"] {
                flex: 1;
                margin: 0;
                height: 18px;
            }
            
            .slider-value {
                min-width: 36px;
                font-size: 10px;
                font-weight: 600;
                color: #1976d2;
                background: rgba(25, 118, 210, 0.1);
                padding: 2px 4px;
                border-radius: 3px;
                text-align: center;
                flex-shrink: 0;
            }
            
            .param-row input[type="number"] {
                max-width: none;
            }
            
            .param-row select {
                background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
                background-position: right 6px center;
                background-repeat: no-repeat;
                background-size: 14px;
                padding-right: 24px;
                appearance: none;
            }
            
            /* 320px 너비에서 2열 배치 최적화 */
            @media (min-width: 320px) {
                .param-row-split {
                    display: flex;
                    flex-direction: row;
                    gap: 8px;
                }
                
                .param-row-split .param-row {
                    flex: 1;
                }
            }
            
            /* 더 큰 너비에서 여백 및 레이아웃 개선 */
            @media (min-width: 480px) {
                .param-row-split {
                    gap: 12px;
                }
                
                .param-group {
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                }
            }
            
            /* 비활성 상태 스타일 개선 */
            fieldset[disabled] .param-row input,
            fieldset[disabled] .param-row select,
            fieldset[disabled] .param-row textarea {
                background: rgba(0, 0, 0, 0.05);
                color: rgba(0, 0, 0, 0.5);
                cursor: not-allowed;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        if (!this.containerElement) return;
        
        // 기존 이벤트 리스너 정리
        this.cleanupEventListeners();
        
        // 탭 클릭 이벤트 (이벤트 위임 사용)
        const tabClickHandler = (e) => {
            if (e.target.classList.contains('detailer-tab-btn')) {
                const tabIndex = parseInt(e.target.dataset.tab);
                this.switchTab(tabIndex);
            }
        };
        
        this.containerElement.addEventListener('click', tabClickHandler);
        this.eventListeners.push({
            element: this.containerElement,
            event: 'click',
            handler: tabClickHandler
        });
        
        // 현재 탭의 이벤트 리스너 설정
        this.setupCurrentTabEventListeners();
    }
    
    setupCurrentTabEventListeners() {
        const currentIndex = this.currentTab;
        
        // 기존 탭별 이벤트 리스너 정리
        this.cleanupTabEventListeners();
        
        // 활성화 토글
        const activeToggle = this.containerElement.querySelector(`#detailer-${currentIndex}-active`);
        if (activeToggle) {
            const toggleHandler = (e) => {
                this.detailers[currentIndex].active = e.target.checked;
                const fieldset = this.containerElement.querySelector(`#detailer-${currentIndex}-fieldset`);
                if (fieldset) {
                    fieldset.disabled = !e.target.checked;
                }
                this.syncStateWithUI(currentIndex);
                this.notifyChange();
            };
            
            activeToggle.addEventListener('change', toggleHandler);
            this.eventListeners.push({
                element: activeToggle,
                event: 'change',
                handler: toggleHandler,
                tabIndex: currentIndex
            });
        }
        
        // 슬라이더 값 표시 업데이트
        const confidenceSlider = this.containerElement.querySelector(`#detailer-${currentIndex}-confidence`);
        if (confidenceSlider) {
            const confidenceHandler = (e) => {
                const value = parseFloat(e.target.value);
                this.detailers[currentIndex].confidence = value;
                const valueDisplay = this.containerElement.querySelector(`#detailer-${currentIndex}-confidence-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = value.toFixed(2);
                }
                this.syncStateWithUI(currentIndex);
                this.notifyChange();
            };
            
            confidenceSlider.addEventListener('input', confidenceHandler);
            this.eventListeners.push({
                element: confidenceSlider,
                event: 'input',
                handler: confidenceHandler,
                tabIndex: currentIndex
            });
        }
        
        const denoisingSlider = this.containerElement.querySelector(`#detailer-${currentIndex}-denoising-strength`);
        if (denoisingSlider) {
            const denoisingHandler = (e) => {
                const value = parseFloat(e.target.value);
                this.detailers[currentIndex].denoisingStrength = value;
                const valueDisplay = this.containerElement.querySelector(`#detailer-${currentIndex}-denoising-strength-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = value.toFixed(2);
                }
                this.syncStateWithUI(currentIndex);
                this.notifyChange();
            };
            
            denoisingSlider.addEventListener('input', denoisingHandler);
            this.eventListeners.push({
                element: denoisingSlider,
                event: 'input',
                handler: denoisingHandler,
                tabIndex: currentIndex
            });
        }
        
        // 기타 입력 필드들
        const fields = [
            'detection-model', 'mask-padding', 'mask-blur', 'prompt', 
            'negative-prompt', 'sampler', 'steps', 'cfg-scale'
        ];
        
        fields.forEach(field => {
            const element = this.containerElement.querySelector(`#detailer-${currentIndex}-${field}`);
            if (element) {
                const fieldHandler = (e) => {
                    this.updateDetailerValue(currentIndex, field, e.target.value);
                    this.syncStateWithUI(currentIndex);
                    this.notifyChange();
                };
                
                element.addEventListener('change', fieldHandler);
                this.eventListeners.push({
                    element: element,
                    event: 'change',
                    handler: fieldHandler,
                    tabIndex: currentIndex
                });
            }
        });
    }
    
    updateDetailerValue(index, field, value) {
        const fieldMap = {
            'detection-model': 'detectionModel',
            'mask-padding': 'maskPadding',
            'mask-blur': 'maskBlur',
            'prompt': 'prompt',
            'negative-prompt': 'negativePrompt',
            'sampler': 'sampler',
            'steps': 'steps',
            'cfg-scale': 'cfgScale'
        };
        
        const mappedField = fieldMap[field];
        if (mappedField && this.detailers[index]) {
            // 숫자 필드는 적절히 변환
            if (['maskPadding', 'maskBlur', 'steps'].includes(mappedField)) {
                this.detailers[index][mappedField] = parseInt(value);
            } else if (mappedField === 'cfgScale') {
                this.detailers[index][mappedField] = parseFloat(value);
            } else {
                this.detailers[index][mappedField] = value;
            }
        }
    }
    
    switchTab(tabIndex) {
        if (tabIndex === this.currentTab || tabIndex < 1 || tabIndex > 4) return;
        
        // 현재 탭의 상태를 저장 (성능 최적화를 위해 DOM에서 직접 읽어오기)
        this.saveCurrentTabState();
        
        // 탭 버튼 활성 상태 업데이트 (최적화된 방식)
        this.updateTabButtonStates(tabIndex);
        
        // 탭 컨텐트 업데이트 (캐싱 및 재사용)
        this.currentTab = tabIndex;
        this.updateTabContentOptimized();
    }
    
    updateTabContent() {
        const contentContainer = this.containerElement?.querySelector('#active-tab-content');
        if (!contentContainer) return;
        
        contentContainer.innerHTML = this.generateTabContentHtml(this.currentTab);
        
        // 새 탭의 이벤트 리스너 설정
        setTimeout(() => {
            this.setupCurrentTabEventListeners();
            this.populateDetectionModels(this.currentTab);
        }, 0);
    }
    
    /**
     * 성능 최적화된 탭 콘텐트 업데이트
     */
    updateTabContentOptimized() {
        const contentContainer = this.containerElement?.querySelector('#active-tab-content');
        if (!contentContainer) return;
        
        // 기존 캐시된 탭 컨텐트가 있는지 확인
        if (this.tabContentElements[this.currentTab]) {
            // 캐시된 엘리먼트 재사용
            contentContainer.innerHTML = '';
            contentContainer.appendChild(this.tabContentElements[this.currentTab]);
        } else {
            // 새로운 탭 컨텐트 생성 및 캐시
            const tabElement = document.createElement('div');
            tabElement.innerHTML = this.generateTabContentHtml(this.currentTab);
            this.tabContentElements[this.currentTab] = tabElement.cloneNode(true);
            contentContainer.innerHTML = tabElement.innerHTML;
        }
        
        // 이벤트 리스너와 모델 목록 설정
        setTimeout(() => {
            this.setupCurrentTabEventListeners();
            this.populateDetectionModels(this.currentTab);
            this.loadTabStateFromData();
        }, 0);
    }
    
    /**
     * 현재 탭의 상태를 데이터 객체에 저장
     */
    saveCurrentTabState() {
        if (!this.containerElement) return;
        
        const currentIndex = this.currentTab;
        
        // DOM에서 현재 값들을 읽어서 데이터 객체에 저장
        const fields = {
            'active': { selector: `#detailer-${currentIndex}-active`, type: 'checkbox' },
            'detectionModel': { selector: `#detailer-${currentIndex}-detection-model`, type: 'value' },
            'confidence': { selector: `#detailer-${currentIndex}-confidence`, type: 'number' },
            'maskPadding': { selector: `#detailer-${currentIndex}-mask-padding`, type: 'number' },
            'maskBlur': { selector: `#detailer-${currentIndex}-mask-blur`, type: 'number' },
            'prompt': { selector: `#detailer-${currentIndex}-prompt`, type: 'value' },
            'negativePrompt': { selector: `#detailer-${currentIndex}-negative-prompt`, type: 'value' },
            'denoisingStrength': { selector: `#detailer-${currentIndex}-denoising-strength`, type: 'number' },
            'sampler': { selector: `#detailer-${currentIndex}-sampler`, type: 'value' },
            'steps': { selector: `#detailer-${currentIndex}-steps`, type: 'number' },
            'cfgScale': { selector: `#detailer-${currentIndex}-cfg-scale`, type: 'number' }
        };
        
        Object.keys(fields).forEach(key => {
            const field = fields[key];
            const element = this.containerElement.querySelector(field.selector);
            if (element) {
                switch (field.type) {
                    case 'checkbox':
                        this.detailers[currentIndex][key] = element.checked;
                        break;
                    case 'number':
                        this.detailers[currentIndex][key] = parseFloat(element.value) || 0;
                        break;
                    default:
                        this.detailers[currentIndex][key] = element.value;
                }
            }
        });
    }
    
    /**
     * 데이터 객체에서 현재 탭으로 상태 로드
     */
    loadTabStateFromData() {
        if (!this.containerElement) return;
        
        const currentIndex = this.currentTab;
        const detailer = this.detailers[currentIndex];
        
        // 데이터 객체의 값을 DOM에 적용
        const activeToggle = this.containerElement.querySelector(`#detailer-${currentIndex}-active`);
        if (activeToggle) {
            activeToggle.checked = detailer.active;
        }
        
        const fieldset = this.containerElement.querySelector(`#detailer-${currentIndex}-fieldset`);
        if (fieldset) {
            fieldset.disabled = !detailer.active;
        }
        
        // 다른 필드들도 동기화
        const fields = [
            { key: 'detectionModel', selector: `#detailer-${currentIndex}-detection-model` },
            { key: 'confidence', selector: `#detailer-${currentIndex}-confidence` },
            { key: 'maskPadding', selector: `#detailer-${currentIndex}-mask-padding` },
            { key: 'maskBlur', selector: `#detailer-${currentIndex}-mask-blur` },
            { key: 'prompt', selector: `#detailer-${currentIndex}-prompt` },
            { key: 'negativePrompt', selector: `#detailer-${currentIndex}-negative-prompt` },
            { key: 'denoisingStrength', selector: `#detailer-${currentIndex}-denoising-strength` },
            { key: 'sampler', selector: `#detailer-${currentIndex}-sampler` },
            { key: 'steps', selector: `#detailer-${currentIndex}-steps` },
            { key: 'cfgScale', selector: `#detailer-${currentIndex}-cfg-scale` }
        ];
        
        fields.forEach(field => {
            const element = this.containerElement.querySelector(field.selector);
            if (element && detailer[field.key] !== undefined) {
                element.value = detailer[field.key];
            }
        });
        
        // 슬라이더 값 표시 업데이트
        const confidenceValue = this.containerElement.querySelector(`#detailer-${currentIndex}-confidence-value`);
        if (confidenceValue) {
            confidenceValue.textContent = detailer.confidence.toFixed(2);
        }
        
        const denoisingValue = this.containerElement.querySelector(`#detailer-${currentIndex}-denoising-strength-value`);
        if (denoisingValue) {
            denoisingValue.textContent = detailer.denoisingStrength.toFixed(2);
        }
    }
    
    /**
     * 탭 버튼 상태 업데이트 (최적화됨)
     */
    updateTabButtonStates(activeTabIndex) {
        const tabButtons = this.containerElement.querySelectorAll('.detailer-tab-btn');
        
        tabButtons.forEach(btn => {
            const tabIndex = parseInt(btn.dataset.tab);
            const isActive = tabIndex === activeTabIndex;
            
            btn.classList.toggle('active', isActive);
            btn.style.background = isActive ? 'rgba(108, 182, 255, 0.15)' : 'transparent';
            btn.style.color = isActive ? '#1a73e8' : '#5f6368';
            btn.style.fontWeight = isActive ? '600' : '400';
            btn.style.fontSize = '11px';
            btn.style.padding = '6px 4px';
        });
    }
    
    /**
     * 상태와 UI 동기화
     */
    syncStateWithUI(tabIndex) {
        // 데이터 무결성 검증
        const detailer = this.detailers[tabIndex];
        if (!detailer) return;
        
        // 범위 검증
        detailer.confidence = Math.max(0, Math.min(1, detailer.confidence));
        detailer.denoisingStrength = Math.max(0, Math.min(1, detailer.denoisingStrength));
        detailer.maskPadding = Math.max(0, Math.min(256, detailer.maskPadding));
        detailer.maskBlur = Math.max(0, Math.min(64, detailer.maskBlur));
        detailer.steps = Math.max(1, Math.min(100, detailer.steps));
        detailer.cfgScale = Math.max(1, Math.min(30, detailer.cfgScale));
        
        // 현재 활성 탭인 경우에만 UI 업데이트
        if (tabIndex === this.currentTab) {
            this.loadTabStateFromData();
        }
    }
    
    /**
     * 이벤트 리스너 정리
     */
    cleanupEventListeners() {
        this.eventListeners.forEach(listener => {
            if (listener.element && listener.handler) {
                listener.element.removeEventListener(listener.event, listener.handler);
            }
        });
        this.eventListeners = [];
    }
    
    /**
     * 특정 탭의 이벤트 리스너만 정리
     */
    cleanupTabEventListeners() {
        const tabListeners = this.eventListeners.filter(listener => listener.tabIndex !== undefined);
        tabListeners.forEach(listener => {
            if (listener.element && listener.handler) {
                listener.element.removeEventListener(listener.event, listener.handler);
            }
        });
        
        // 탭별 리스너만 제거
        this.eventListeners = this.eventListeners.filter(listener => listener.tabIndex === undefined);
    }
    
    async loadDetectionModels() {
        try {
            this.loadingState.models = true;
            this.loadingState.error = null;
            this.showModelLoadingUI();
            
            // 로컬 파일 시스템에서 모델 목록을 가져오기
            this.detectionModels = this.getLocalDetectionModels();
            
            // 현재 활성 탭의 모델 select 업데이트
            this.populateDetectionModels(this.currentTab);
            this.loadingState.models = false;
            
        } catch (error) {
            console.error('Detection models 로딩 실패:', error);
            this.loadingState.error = error.message;
            this.showModelErrorUI(error.message);
            
            // 기본값으로 폴백
            this.detectionModels = this.getFallbackModels();
            this.populateDetectionModels(this.currentTab);
            this.loadingState.models = false;
        }
    }
    
    /**
     * 로컬 파일 시스템의 ultralytics 모델 목록 반환
     */
    getLocalDetectionModels() {
        // bbox (bounding box) 모델들
        const bboxModels = [
            'bbox/anime_score_cls_v1.pt',
            'bbox/breast_size_det_cls_v8_640.pt',
            'bbox/drones_det_v3_1024.pt',
            'bbox/Eyes.pt',
            'bbox/face_yolov11.pt',
            'bbox/face_yolov8m.pt',
            'bbox/hand_yolov8s.pt',
            'bbox/manface_det_v2_1024.pt',
            'bbox/womanface_det_v5_1024.pt'
        ];
        
        // segm (segmentation) 모델들
        const segmModels = [
            'segm/Anzhcs-text-seg-v6-y11m.pt',
            'segm/breasts_seg_v1_1024m.pt',
            'segm/breasts_seg_v1_1024n.pt',
            'segm/breasts_seg_v1_1024s.pt',
            'segm/eye_seg_v11_640_v3.pt',
            'segm/face_seg_v2_1024.pt',
            'segm/face_seg_v2_640.pt',
            'segm/face_seg_v2_768.pt',
            'segm/face_seg_v2_768ms.pt',
            'segm/face_seg_v3_640.pt',
            'segm/face_yolov9c.pt',
            'segm/hand_yolov9c.pt',
            'segm/person_yolov8m-seg.pt'
        ];
        
        return [...bboxModels, ...segmModels];
    }
    
    /**
     * 폴백 모델 목록
     */
    getFallbackModels() {
        return [
            'bbox/face_yolov8m.pt',
            'segm/face_seg_v2_640.pt',
            'bbox/hand_yolov8s.pt',
            'segm/hand_yolov9c.pt'
        ];
    }
    
    /**
     * 모델 로딩 UI 표시
     */
    showModelLoadingUI() {
        const selectElements = this.containerElement?.querySelectorAll('select[id*="detection-model"]');
        selectElements?.forEach(select => {
            select.innerHTML = '<option>모델 로딩 중...</option>';
            select.disabled = true;
        });
    }
    
    /**
     * 모델 로딩 에러 UI 표시
     */
    showModelErrorUI(errorMessage) {
        const selectElements = this.containerElement?.querySelectorAll('select[id*="detection-model"]');
        selectElements?.forEach(select => {
            select.innerHTML = `<option>⚠️ 모델 로딩 실패: ${errorMessage}</option>`;
            select.disabled = false;
        });
        
        // 에러 알림 표시
        this.showNotification('모델 로딩에 실패했습니다. 기본 모델을 사용합니다.', 'error');
    }
    
    /**
     * 알림 표시 (UI 피드백)
     */
    showNotification(message, type = 'info') {
        // 간단한 알림 구현 (실제 프로젝트의 알림 시스템과 연동 가능)
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // DOM에 알림 표시
        const notification = document.createElement('div');
        notification.className = `multidetailer-notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : '#2196f3'};
            color: white;
            padding: 12px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(notification);
        
        // 3초 후 자동 제거
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    populateDetectionModels(tabIndex) {
        const selectElement = this.containerElement?.querySelector(`#detailer-${tabIndex}-detection-model`);
        if (!selectElement) return;
        
        selectElement.innerHTML = '';
        
        if (this.detectionModels.length === 0) {
            selectElement.innerHTML = '<option value="">No models found</option>';
            return;
        }
        
        this.detectionModels.forEach(modelName => {
            const option = document.createElement('option');
            option.value = modelName;
            option.textContent = modelName;
            
            // 저장된 값이 있으면 선택
            if (this.detailers[tabIndex].detectionModel === modelName) {
                option.selected = true;
            }
            
            selectElement.appendChild(option);
        });
        
        // 첫 번째 모델을 기본값으로 설정 (저장된 값이 없을 때)
        if (!this.detailers[tabIndex].detectionModel && this.detectionModels.length > 0) {
            this.detailers[tabIndex].detectionModel = this.detectionModels[0];
            selectElement.value = this.detectionModels[0];
        }
    }
    
    notifyChange() {
        // 커스텀 이벤트로 설정 변경 알림
        document.dispatchEvent(new CustomEvent('multiDetailer:changed', {
            detail: {
                detailers: { ...this.detailers },
                currentTab: this.currentTab
            }
        }));
        
        console.log('Multi-detailer settings updated:', this.detailers);
    }
    
    // 외부에서 호출 가능한 API 메서드들
    getDetailers() {
        return { ...this.detailers };
    }
    
    getActiveDetailers() {
        const activeDetailers = {};
        Object.keys(this.detailers).forEach(key => {
            if (this.detailers[key].active) {
                activeDetailers[key] = { ...this.detailers[key] };
            }
        });
        return activeDetailers;
    }
    
    setDetailer(index, settings) {
        if (this.detailers[index]) {
            Object.assign(this.detailers[index], settings);
            
            // 현재 탭이면 UI 업데이트
            if (index === this.currentTab) {
                this.updateTabContent();
            }
            
            this.notifyChange();
        }
    }
    
    resetDetailer(index) {
        if (this.detailers[index]) {
            this.detailers[index] = {
                active: false,
                detectionModel: this.detectionModels.length > 0 ? this.detectionModels[0] : '',
                confidence: 0.3,
                maskPadding: 32,
                maskBlur: 4,
                prompt: 'a beautiful detailed face, masterpiece',
                negativePrompt: 'blurry, ugly, deformed',
                denoisingStrength: 0.4,
                sampler: 'Euler a',
                steps: 25,
                cfgScale: 7.0
            };
            
            // 현재 탭이면 UI 업데이트
            if (index === this.currentTab) {
                this.updateTabContent();
            }
            
            this.notifyChange();
        }
    }
    
    /**
     * 상태 보존을 위한 refreshData 메서드
     * FloatingPanel 복원 시 호출되어 상태를 보존하면서 데이터 재로드
     */
    refreshData() {
        if (!this.containerElement) return;
        
        console.log('MultiDetailer: Refreshing data after DOM restore');
        
        // 현재 상태 백업
        const previousCurrentTab = this.currentTab;
        const previousDetailers = JSON.parse(JSON.stringify(this.detailers));
        
        console.log('Preserving MultiDetailer state:', {
            currentTab: previousCurrentTab,
            detailers: previousDetailers
        });
        
        // DOM 재생성
        this.renderContent();
        
        // 데이터 재로드 후 상태 복원
        this.loadDetectionModels().then(() => {
            this.restoreMultiDetailerState(previousCurrentTab, previousDetailers);
        }).catch(() => {
            // 에러가 발생해도 상태는 복원
            this.restoreMultiDetailerState(previousCurrentTab, previousDetailers);
        });
    }
    
    /**
     * DOM 컨텐츠 재렌더링 (refreshData에서 사용)
     */
    renderContent() {
        if (!this.containerElement) return;
        
        // 기존 이벤트 리스너 정리
        this.cleanupEventListeners();
        
        // 탭 콘텐트 캐시 정리 (새로고침을 위해)
        this.tabContentElements = {};
        
        // DOM 내용 재생성
        this.containerElement.innerHTML = '';
        
        // 탭 네비게이션 재생성
        const tabNav = document.createElement('div');
        tabNav.className = 'tab-nav';
        tabNav.style.cssText = `
            display: flex;
            border-bottom: 1px solid rgba(134, 142, 150, 0.2);
            margin-bottom: 10px;
            background: rgba(245, 246, 247, 0.8);
            border-radius: 6px 6px 0 0;
            padding: 3px;
            gap: 1px;
        `;
        
        // 탭 버튼들 재생성
        for (let i = 1; i <= 4; i++) {
            const tabBtn = this.createTabButton(i, i === this.currentTab);
            tabNav.appendChild(tabBtn);
        }
        
        // 탭 컨텐트 컨테이너 재생성
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.style.cssText = `
            flex: 1;
            overflow-y: auto;
            min-height: 0;
            padding: 6px 0;
        `;
        
        // 현재 활성 탭 컨텐트 재생성
        const activeTabContent = document.createElement('div');
        activeTabContent.id = 'active-tab-content';
        activeTabContent.innerHTML = this.generateTabContentHtml(this.currentTab);
        
        tabContent.appendChild(activeTabContent);
        
        // 컨테이너 조립
        this.containerElement.appendChild(tabNav);
        this.containerElement.appendChild(tabContent);
        
        // 이벤트 리스너 재설정
        this.setupEventListeners();
    }
    
    /**
     * MultiDetailer 상태 복원
     */
    restoreMultiDetailerState(previousCurrentTab, previousDetailers) {
        console.log('Restoring MultiDetailer state...');
        
        // 상태 복원
        this.currentTab = previousCurrentTab;
        this.detailers = previousDetailers;
        
        // 탭 상태 복원
        if (previousCurrentTab !== 1) {
            this.switchTab(previousCurrentTab);
        }
        
        // 각 디테일러의 필드 값들 복원
        for (let i = 1; i <= 4; i++) {
            this.restoreDetailerFields(i, previousDetailers[i]);
        }
        
        console.log('MultiDetailer state restored successfully');
    }
    
    /**
     * 개별 디테일러의 필드 값들 복원
     */
    restoreDetailerFields(index, config) {
        if (!config || index !== this.currentTab) {
            // 현재 활성 탭이 아니면 나중에 탭 전환시 복원됨
            return;
        }
        
        // 활성화 상태 복원
        const checkbox = this.containerElement.querySelector(`#detailer-${index}-active`);
        if (checkbox) {
            checkbox.checked = config.active;
            
            // 필드셋 활성화/비활성화
            const fieldset = this.containerElement.querySelector(`#detailer-${index}-fieldset`);
            if (fieldset) {
                fieldset.disabled = !config.active;
            }
        }
        
        // 필드 값들 복원
        const fieldMappings = [
            { id: `detailer-${index}-detection-model`, value: config.detectionModel },
            { id: `detailer-${index}-confidence`, value: config.confidence },
            { id: `detailer-${index}-mask-padding`, value: config.maskPadding },
            { id: `detailer-${index}-mask-blur`, value: config.maskBlur },
            { id: `detailer-${index}-prompt`, value: config.prompt },
            { id: `detailer-${index}-negative-prompt`, value: config.negativePrompt },
            { id: `detailer-${index}-denoising-strength`, value: config.denoisingStrength },
            { id: `detailer-${index}-sampler`, value: config.sampler },
            { id: `detailer-${index}-steps`, value: config.steps },
            { id: `detailer-${index}-cfg-scale`, value: config.cfgScale }
        ];
        
        fieldMappings.forEach(({ id, value }) => {
            const element = this.containerElement.querySelector(`#${id}`);
            if (element && value !== undefined) {
                element.value = value;
                
                // 슬라이더 값 표시 업데이트
                if (id.includes('confidence')) {
                    const valueDisplay = this.containerElement.querySelector(`#detailer-${index}-confidence-value`);
                    if (valueDisplay) {
                        valueDisplay.textContent = parseFloat(value).toFixed(2);
                    }
                } else if (id.includes('denoising-strength')) {
                    const valueDisplay = this.containerElement.querySelector(`#detailer-${index}-denoising-strength-value`);
                    if (valueDisplay) {
                        valueDisplay.textContent = parseFloat(value).toFixed(2);
                    }
                }
            }
        });
        
        console.log(`Detailer ${index} fields restored:`, config);
    }

    /**
     * 컴포넌트 완전 정리 메서드 (메모리 리크 방지)
     */
    destroy() {
        // 모든 이벤트 리스너 정리
        this.cleanupEventListeners();
        
        // 탭 콘텐트 캐시 정리
        this.tabContentElements = {};
        
        // DOM 레퍼런스 정리
        this.containerElement = null;
        
        // 데이터 객체 초기화 (메모리 해제)
        this.detailers = {};
        this.detectionModels = [];
        
        // 상태 초기화
        this.isInitialized = false;
        this.currentTab = 1;
        this.loadingState = { models: false, error: null };
        
        // 알림 DOM 정리 (있을 경우)
        const notifications = document.querySelectorAll('.multidetailer-notification');
        notifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
        
        console.log('Multi-detailer component destroyed and cleaned up');
    }
}