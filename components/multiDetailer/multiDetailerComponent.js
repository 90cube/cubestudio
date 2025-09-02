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
        this.detectionModels = []; // API에서 불러온 모델 목록
    }
    
    /**
     * renewal 아키텍처 호환 init 메서드
     * DOM 마운트 후에 호출되어 초기화 수행
     */
    init() {
        if (this.isInitialized || !this.containerElement) {
            return;
        }
        
        this.isInitialized = true;
        
        // DOM이 마운트된 후에 이벤트 리스너 설정과 API 호출
        setTimeout(() => {
            this.setupEventListeners();
            this.loadDetectionModels();
            this.updateTabContent();
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
            margin-bottom: 12px;
            background: rgba(245, 246, 247, 0.8);
            border-radius: 6px 6px 0 0;
            padding: 4px;
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
            padding: 8px 0;
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
            padding: 8px 12px;
            border: none;
            background: ${active ? 'rgba(108, 182, 255, 0.15)' : 'transparent'};
            color: ${active ? '#1a73e8' : '#5f6368'};
            cursor: pointer;
            font-size: 12px;
            font-weight: ${active ? '600' : '400'};
            border-radius: 4px;
            transition: all 0.2s ease;
            margin: 0 2px;
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
                            <input type="range" 
                                   id="detailer-${index}-confidence" 
                                   min="0" max="1" step="0.01" 
                                   value="${detailer.confidence}">
                            <span class="slider-value" id="detailer-${index}-confidence-value">${detailer.confidence.toFixed(2)}</span>
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
                            <input type="range" 
                                   id="detailer-${index}-denoising-strength" 
                                   min="0" max="1" step="0.01" 
                                   value="${detailer.denoisingStrength}">
                            <span class="slider-value" id="detailer-${index}-denoising-strength-value">${detailer.denoisingStrength.toFixed(2)}</span>
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
            }
            
            .multi-detailer-component .tab-nav {
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            }
            
            .multi-detailer-component .detailer-tab-btn {
                position: relative;
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
                width: 20px;
                height: 2px;
                background: #1a73e8;
                border-radius: 1px;
            }
            
            .detailer-activation-section {
                background: rgba(76, 175, 80, 0.05);
                border: 1px solid rgba(76, 175, 80, 0.2);
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 16px;
            }
            
            .detailer-toggle-label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: #2e7d32;
                cursor: pointer;
            }
            
            .detailer-toggle-label input[type="checkbox"] {
                width: 16px;
                height: 16px;
                accent-color: #4caf50;
            }
            
            .toggle-text {
                user-select: none;
            }
            
            fieldset {
                border: 1px solid rgba(0, 0, 0, 0.1);
                border-radius: 8px;
                padding: 16px;
                margin: 0;
            }
            
            fieldset[disabled] {
                opacity: 0.6;
                background: rgba(0, 0, 0, 0.02);
            }
            
            .param-group {
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            }
            
            .param-group:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }
            
            .group-title {
                margin: 0 0 12px 0;
                color: #1565c0;
                font-size: 14px;
                font-weight: 600;
                padding: 4px 0;
                border-bottom: 2px solid rgba(21, 101, 192, 0.2);
            }
            
            .param-row {
                margin-bottom: 8px;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .param-row-split {
                display: flex;
                gap: 12px;
                margin-bottom: 8px;
            }
            
            .param-row-split .param-row {
                flex: 1;
                margin-bottom: 0;
            }
            
            .param-row label {
                font-size: 12px;
                font-weight: 500;
                color: #424242;
                margin-bottom: 2px;
            }
            
            .param-row input, .param-row select, .param-row textarea {
                padding: 6px 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
                transition: border-color 0.2s ease;
                background: white;
            }
            
            .param-row input:focus, .param-row select:focus, .param-row textarea:focus {
                outline: none;
                border-color: #1976d2;
                box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
            }
            
            .param-row textarea {
                resize: vertical;
                min-height: 60px;
                font-family: inherit;
            }
            
            .slider-row {
                flex-direction: row !important;
                align-items: center;
                gap: 8px;
            }
            
            .slider-row label {
                min-width: 120px;
                margin-bottom: 0;
            }
            
            .slider-row input[type="range"] {
                flex: 1;
                margin: 0 8px;
            }
            
            .slider-value {
                min-width: 40px;
                font-size: 12px;
                font-weight: 600;
                color: #1976d2;
                background: rgba(25, 118, 210, 0.1);
                padding: 2px 6px;
                border-radius: 3px;
                text-align: center;
            }
            
            .param-row input[type="number"] {
                max-width: 80px;
            }
            
            .param-row select {
                background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
                background-position: right 8px center;
                background-repeat: no-repeat;
                background-size: 16px;
                padding-right: 32px;
                appearance: none;
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
        
        // 탭 클릭 이벤트
        this.containerElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('detailer-tab-btn')) {
                const tabIndex = parseInt(e.target.dataset.tab);
                this.switchTab(tabIndex);
            }
        });
        
        // 현재 탭의 이벤트 리스너 설정
        this.setupCurrentTabEventListeners();
    }
    
    setupCurrentTabEventListeners() {
        const currentIndex = this.currentTab;
        
        // 활성화 토글
        const activeToggle = this.containerElement.querySelector(`#detailer-${currentIndex}-active`);
        if (activeToggle) {
            activeToggle.addEventListener('change', (e) => {
                this.detailers[currentIndex].active = e.target.checked;
                const fieldset = this.containerElement.querySelector(`#detailer-${currentIndex}-fieldset`);
                if (fieldset) {
                    fieldset.disabled = !e.target.checked;
                }
                this.notifyChange();
            });
        }
        
        // 슬라이더 값 표시 업데이트
        const confidenceSlider = this.containerElement.querySelector(`#detailer-${currentIndex}-confidence`);
        if (confidenceSlider) {
            confidenceSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.detailers[currentIndex].confidence = value;
                const valueDisplay = this.containerElement.querySelector(`#detailer-${currentIndex}-confidence-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = value.toFixed(2);
                }
                this.notifyChange();
            });
        }
        
        const denoisingSlider = this.containerElement.querySelector(`#detailer-${currentIndex}-denoising-strength`);
        if (denoisingSlider) {
            denoisingSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.detailers[currentIndex].denoisingStrength = value;
                const valueDisplay = this.containerElement.querySelector(`#detailer-${currentIndex}-denoising-strength-value`);
                if (valueDisplay) {
                    valueDisplay.textContent = value.toFixed(2);
                }
                this.notifyChange();
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
                element.addEventListener('change', (e) => {
                    this.updateDetailerValue(currentIndex, field, e.target.value);
                    this.notifyChange();
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
        if (tabIndex === this.currentTab) return;
        
        // 탭 버튼 활성 상태 업데이트
        this.containerElement.querySelectorAll('.detailer-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = '#5f6368';
            btn.style.fontWeight = '400';
        });
        
        const activeBtn = this.containerElement.querySelector(`[data-tab="${tabIndex}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = 'rgba(108, 182, 255, 0.15)';
            activeBtn.style.color = '#1a73e8';
            activeBtn.style.fontWeight = '600';
        }
        
        // 탭 컨텐트 업데이트
        this.currentTab = tabIndex;
        this.updateTabContent();
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
    
    async loadDetectionModels() {
        try {
            const response = await fetch(`${this.apiUrl}/models/detection`);
            if (!response.ok) throw new Error(`Detection models 로딩 실패: ${response.status}`);
            
            this.detectionModels = await response.json();
            
            // 현재 활성 탭의 모델 select 업데이트
            this.populateDetectionModels(this.currentTab);
            
        } catch (error) {
            console.error('Detection models 로딩 실패:', error);
            this.detectionModels = ['Default detection model']; // 기본값
            this.populateDetectionModels(this.currentTab);
        }
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
    
    destroy() {
        console.log('Multi-detailer component destroyed');
    }
}