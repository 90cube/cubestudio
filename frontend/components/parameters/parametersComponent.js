// components/parameters/parametersComponent.js

/**
 * 파라미터 컴포넌트 - 플로팅 패널에서 사용
 * Stable Diffusion 이미지 생성 파라미터 조절 인터페이스
 */

export class ParametersComponent {
    constructor() {
        this.containerElement = null;
        this.isInitialized = false;
        
        // 기본 파라미터 값들
        this.parameters = {
            width: 1024,
            height: 1024,
            steps: 25,
            sampler: 'Euler a',
            scheduler: 'normal',
            cfgScale: 7.5,
            seed: -1,
            addNoise: false,
            fixedSeed: false
        };

        // 현재 선택된 모델 정보
        this.currentBaseModel = 'sdxl';
        this.modelStatus = 'N/A';
        
        // 프리셋 네비게이션용
        this.currentPresetIndex = 0;
        this.lastClickTime = 0;
        this.doubleClickDelay = 300; // 300ms 내 두 번 클릭하면 비율 역전

        // 해상도 프리셋 정의
        this.resolutionPresets = {
            sd15: {
                '1:1': { width: 768, height: 768 },
                '4:3': { width: 768, height: 576 },
                '3:2': { width: 768, height: 512 },
                '16:9': { width: 912, height: 512 },
                '2:1': { width: 1024, height: 512 },
            },
            sdxl: {
                '1:1': { width: 1024, height: 1024 },
                '5:4': { width: 1088, height: 896 },
                '4:3': { width: 1152, height: 864 },
                '3:2': { width: 1152, height: 768 },
                '16:9': { width: 1344, height: 768 },
                '2:1': { width: 1448, height: 720 },
                '21:9': { width: 1536, height: 640 },
            }
        };
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
        
        // DOM이 마운트된 후에 이벤트 리스너 설정
        setTimeout(() => {
            this.setupEventListeners();
            this.updateUI();
            this.listenToModelChanges();
        }, 0);
    }
    
    render() {
        const container = document.createElement('div');
        container.className = 'parameters-component';
        container.style.cssText = `
            height: 100%;
            display: flex;
            flex-direction: column;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;
        
        container.innerHTML = `
            <div class="param-section">
                <div class="param-header">
                    <h3>파라미터</h3>
                    <div class="model-status">모델: <span id="model-status">[${this.modelStatus}]</span></div>
                </div>
            </div>
            
            <div class="param-section">
                <h4>해상도 프리셋</h4>
                <div class="preset-navigation">
                    <button id="preset-prev" class="preset-nav-btn">&lt;</button>
                    <button id="current-preset" class="preset-current">1:1</button>
                    <button id="preset-next" class="preset-nav-btn">&gt;</button>
                </div>
            </div>
            
            <div class="param-section">
                <h4>해상도</h4>
                <div class="resolution-inputs-inline">
                    <div class="input-group-inline">
                        <label>너비:</label>
                        <input type="number" id="param-width" step="8" min="64" max="2048" value="${this.parameters.width}">
                    </div>
                    <div class="input-separator">|</div>
                    <div class="input-group-inline">
                        <label>높이:</label>
                        <input type="number" id="param-height" step="8" min="64" max="2048" value="${this.parameters.height}">
                    </div>
                </div>
            </div>
            
            <div class="param-section">
                <h4>샘플러 & 스케줄러</h4>
                <div class="sampler-inputs">
                    <div class="input-group">
                        <label for="param-sampler">샘플러:</label>
                        <select id="param-sampler">
                            <option value="Euler a">Euler a</option>
                            <option value="Euler">Euler</option>
                            <option value="LMS">LMS</option>
                            <option value="Heun">Heun</option>
                            <option value="DPM2">DPM2</option>
                            <option value="DPM2 a">DPM2 a</option>
                            <option value="DPM++ 2S a">DPM++ 2S a</option>
                            <option value="DPM++ 2M">DPM++ 2M</option>
                            <option value="DPM++ SDE">DPM++ SDE</option>
                            <option value="DDIM">DDIM</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label for="param-scheduler">스케줄러:</label>
                        <select id="param-scheduler">
                            <option value="normal">Normal</option>
                            <option value="karras">Karras</option>
                            <option value="exponential">Exponential</option>
                            <option value="simple">Simple</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="param-section">
                <h4>생성 설정</h4>
                <div class="generation-inputs">
                    <div class="input-group">
                        <label for="param-steps">Steps:</label>
                        <input type="range" id="param-steps-range" min="1" max="50" value="${this.parameters.steps}">
                        <input type="number" id="param-steps" min="1" max="50" value="${this.parameters.steps}">
                    </div>
                    <div class="input-group">
                        <label for="param-cfg-scale">CFG Scale:</label>
                        <input type="range" id="param-cfg-range" min="1" max="20" step="0.1" value="${this.parameters.cfgScale}">
                        <input type="number" id="param-cfg-scale" min="1" max="20" step="0.1" value="${this.parameters.cfgScale}">
                    </div>
                </div>
            </div>
            
            <div class="param-section">
                <h4>시드 설정</h4>
                <div class="seed-inputs">
                    <div class="input-group">
                        <label for="param-seed">Seed:</label>
                        <input type="number" id="param-seed" value="${this.parameters.seed}">
                        <button id="random-seed-btn" type="button">🎲</button>
                    </div>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="param-fixed-seed" ${this.parameters.fixedSeed ? 'checked' : ''}>
                            고정 시드
                        </label>
                        <label>
                            <input type="checkbox" id="param-add-noise" ${this.parameters.addNoise ? 'checked' : ''}>
                            노이즈 추가
                        </label>
                    </div>
                </div>
            </div>
        `;
        
        // CSS 스타일 추가
        this.addStyles();
        
        // 컨테이너를 참조로 저장
        this.containerElement = container;
        
        return container;
    }
    
    addStyles() {
        if (document.getElementById('parameters-component-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'parameters-component-styles';
        style.textContent = `
            .parameters-component {
                color: #333;
                font-size: 13px;
            }
            
            .param-section {
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            }
            
            .param-section:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }
            
            .param-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .param-header h3 {
                margin: 0;
                color: #2c3e50;
                font-size: 16px;
                font-weight: 600;
            }
            
            .model-status {
                font-size: 11px;
                color: #666;
                background: rgba(0, 0, 0, 0.05);
                padding: 2px 6px;
                border-radius: 3px;
            }
            
            .param-section h4 {
                margin: 0 0 8px 0;
                color: #34495e;
                font-size: 13px;
                font-weight: 600;
            }
            
            .preset-navigation {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                margin-bottom: 8px;
            }
            
            .preset-nav-btn {
                padding: 8px 12px;
                border: 1px solid #ddd;
                background: #f8f9fa;
                color: #495057;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                transition: all 0.2s ease;
                min-width: 40px;
            }
            
            .preset-nav-btn:hover {
                background: #e9ecef;
                border-color: #adb5bd;
            }
            
            .preset-current {
                padding: 8px 16px;
                border: 2px solid #e67e22;
                background: #fff;
                color: #e67e22;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s ease;
                min-width: 60px;
            }
            
            .preset-current:hover {
                background: #e67e22;
                color: white;
            }
            
            
            .resolution-inputs, .sampler-inputs, .generation-inputs, .seed-inputs {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .resolution-inputs-inline {
                display: flex;
                align-items: center;
                gap: 12px;
                justify-content: space-between;
            }
            
            .input-group-inline {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .input-group-inline label {
                font-size: 12px;
                color: #34495e;
                font-weight: 600;
                min-width: 30px;
            }
            
            .input-group-inline input {
                width: 70px;
                padding: 4px 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
            }
            
            .input-separator {
                color: #666;
                font-weight: 600;
                margin: 0 4px;
            }
            
            .input-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .input-group label {
                min-width: 60px;
                font-size: 12px;
                font-weight: 500;
                color: #555;
            }
            
            .input-group input[type="number"] {
                flex: 1;
                padding: 4px 8px;
                border: 1px solid #ddd;
                border-radius: 3px;
                font-size: 12px;
                max-width: 80px;
            }
            
            .input-group input[type="range"] {
                flex: 2;
                margin: 0 4px;
            }
            
            .input-group select {
                flex: 1;
                padding: 4px 8px;
                border: 1px solid #ddd;
                border-radius: 3px;
                font-size: 12px;
                background: white;
            }
            
            .checkbox-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-top: 4px;
            }
            
            .checkbox-group label {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                min-width: auto;
            }
            
            .checkbox-group input[type="checkbox"] {
                margin: 0;
            }
            
            #random-seed-btn {
                padding: 4px 8px;
                border: 1px solid #ddd;
                background: #f8f9fa;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s ease;
            }
            
            #random-seed-btn:hover {
                background: #e9ecef;
            }
            
            .input-group input:focus, .input-group select:focus {
                outline: none;
                border-color: #3498db;
                box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
            }
        `;
        
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        if (!this.containerElement) return;
        
        // 프리셋 네비게이션 버튼들
        const prevBtn = this.containerElement.querySelector('#preset-prev');
        const nextBtn = this.containerElement.querySelector('#preset-next');
        const currentBtn = this.containerElement.querySelector('#current-preset');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.navigatePreset(-1));
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.navigatePreset(1));
        }
        
        if (currentBtn) {
            currentBtn.addEventListener('click', (e) => this.handlePresetApply(e));
        }
        
        // 해상도 입력 필드들
        const widthInput = this.containerElement.querySelector('#param-width');
        const heightInput = this.containerElement.querySelector('#param-height');
        
        widthInput.addEventListener('change', (e) => {
            this.parameters.width = parseInt(e.target.value);
            this.notifyParameterChange();
        });
        
        heightInput.addEventListener('change', (e) => {
            this.parameters.height = parseInt(e.target.value);
            this.notifyParameterChange();
        });
        
        // 샘플러 & 스케줄러
        const samplerSelect = this.containerElement.querySelector('#param-sampler');
        const schedulerSelect = this.containerElement.querySelector('#param-scheduler');
        
        if (samplerSelect) {
            samplerSelect.value = this.parameters.sampler;
            samplerSelect.addEventListener('change', (e) => {
                this.parameters.sampler = e.target.value;
                this.notifyParameterChange();
            });
        }
        
        if (schedulerSelect) {
            schedulerSelect.value = this.parameters.scheduler;
            schedulerSelect.addEventListener('change', (e) => {
                this.parameters.scheduler = e.target.value;
                this.notifyParameterChange();
            });
        }
        
        // Steps 슬라이더와 입력 필드 동기화
        const stepsRange = this.containerElement.querySelector('#param-steps-range');
        const stepsInput = this.containerElement.querySelector('#param-steps');
        
        if (stepsRange && stepsInput) {
            stepsRange.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                stepsInput.value = value;
                this.parameters.steps = value;
                this.notifyParameterChange();
            });
            
            stepsInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value);
                stepsRange.value = value;
                this.parameters.steps = value;
                this.notifyParameterChange();
            });
        }
        
        // CFG Scale 슬라이더와 입력 필드 동기화
        const cfgRange = this.containerElement.querySelector('#param-cfg-range');
        const cfgInput = this.containerElement.querySelector('#param-cfg-scale');
        
        if (cfgRange && cfgInput) {
            cfgRange.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                cfgInput.value = value;
                this.parameters.cfgScale = value;
                this.notifyParameterChange();
            });
            
            cfgInput.addEventListener('change', (e) => {
                const value = parseFloat(e.target.value);
                cfgRange.value = value;
                this.parameters.cfgScale = value;
                this.notifyParameterChange();
            });
        }
        
        // 시드 관련
        const seedInput = this.containerElement.querySelector('#param-seed');
        const randomSeedBtn = this.containerElement.querySelector('#random-seed-btn');
        const fixedSeedCheck = this.containerElement.querySelector('#param-fixed-seed');
        const addNoiseCheck = this.containerElement.querySelector('#param-add-noise');
        
        if (seedInput) {
            seedInput.addEventListener('change', (e) => {
                this.parameters.seed = parseInt(e.target.value);
                this.notifyParameterChange();
            });
        }
        
        if (randomSeedBtn && seedInput) {
            randomSeedBtn.addEventListener('click', () => {
                const randomSeed = Math.floor(Math.random() * 2147483647);
                seedInput.value = randomSeed;
                this.parameters.seed = randomSeed;
                this.notifyParameterChange();
            });
        }
        
        if (fixedSeedCheck && seedInput) {
            fixedSeedCheck.addEventListener('change', (e) => {
                this.parameters.fixedSeed = e.target.checked;
                seedInput.disabled = !e.target.checked;
                this.notifyParameterChange();
            });
        }
        
        if (addNoiseCheck) {
            addNoiseCheck.addEventListener('change', (e) => {
                this.parameters.addNoise = e.target.checked;
                this.notifyParameterChange();
            });
        }
    }
    
    navigatePreset(direction) {
        const presets = this.resolutionPresets[this.currentBaseModel] || {};
        const presetKeys = Object.keys(presets);
        
        if (presetKeys.length === 0) return;
        
        this.currentPresetIndex = (this.currentPresetIndex + direction + presetKeys.length) % presetKeys.length;
        this.updatePresetDisplay();
    }
    
    handlePresetApply(event) {
        const currentTime = Date.now();
        const isDoubleClick = currentTime - this.lastClickTime < this.doubleClickDelay;
        this.lastClickTime = currentTime;
        
        const presets = this.resolutionPresets[this.currentBaseModel] || {};
        const presetKeys = Object.keys(presets);
        const currentRatio = presetKeys[this.currentPresetIndex];
        const preset = presets[currentRatio];
        
        if (!preset) return;
        
        if (isDoubleClick && currentRatio !== '1:1') {
            // 두 번 클릭: 비율 역전
            this.updateResolutionFields(preset.height, preset.width);
        } else {
            // 한 번 클릭: 일반 적용
            this.updateResolutionFields(preset.width, preset.height);
        }
    }
    
    updateResolutionFields(width, height) {
        const widthInput = this.containerElement.querySelector('#param-width');
        const heightInput = this.containerElement.querySelector('#param-height');
        
        widthInput.value = width;
        heightInput.value = height;
        this.parameters.width = width;
        this.parameters.height = height;
        
        this.notifyParameterChange();
    }
    
    updatePresetDisplay() {
        const currentBtn = this.containerElement?.querySelector('#current-preset');
        
        if (!currentBtn) return;
        
        const presets = this.resolutionPresets[this.currentBaseModel] || {};
        const presetKeys = Object.keys(presets);
        
        if (presetKeys.length === 0) return;
        
        const currentRatio = presetKeys[this.currentPresetIndex];
        
        if (currentRatio) {
            currentBtn.textContent = currentRatio;
        }
    }
    
    updateUI() {
        if (!this.containerElement) return;
        
        // 모델 상태 업데이트
        const modelStatus = this.containerElement.querySelector('#model-status');
        if (modelStatus) {
            modelStatus.textContent = `[${this.modelStatus.toUpperCase()}]`;
        }
        
        // 프리셋 디스플레이 업데이트
        this.updatePresetDisplay();
        
        // 시드 입력 필드 상태 업데이트
        const seedInput = this.containerElement.querySelector('#param-seed');
        const fixedSeedCheck = this.containerElement.querySelector('#param-fixed-seed');
        
        if (seedInput && fixedSeedCheck) {
            seedInput.disabled = !this.parameters.fixedSeed;
            fixedSeedCheck.checked = this.parameters.fixedSeed;
        }
    }
    
    listenToModelChanges() {
        // 모델 선택 이벤트 리스닝
        document.addEventListener('model:selected', (e) => {
            const modelData = e.detail;
            this.handleModelChange(modelData);
        });
    }
    
    handleModelChange(modelData) {
        // 폴더 경로를 우선으로 모델 타입 감지 (LoRA 컴포넌트와 동일한 방식)
        let detectedModelType = null;
        
        // 1. folderPath 또는 subfolder를 사용한 폴더 기반 감지 (가장 정확)
        if (modelData.folderPath) {
            const folderName = modelData.folderPath.toLowerCase();
            if (folderName.includes('sdxl') || folderName === 'sdxl') {
                detectedModelType = 'sdxl';
            } else if (folderName.includes('sd15') || folderName === 'sd15') {
                detectedModelType = 'sd15';
            }
        } else if (modelData.subfolder) {
            // subfolder에서 첫 번째 폴더 추출
            const subfolderParts = modelData.subfolder.split(/[\/\\]/).filter(p => p);
            if (subfolderParts.length > 0) {
                const firstFolder = subfolderParts[0].toLowerCase();
                if (firstFolder.includes('sdxl') || firstFolder === 'sdxl') {
                    detectedModelType = 'sdxl';
                } else if (firstFolder.includes('sd15') || firstFolder === 'sd15') {
                    detectedModelType = 'sd15';
                }
            }
        }
        
        // 2. 폴더 기반 감지가 실패한 경우에만 모델명 기반 감지 사용 (개선된 로직)
        if (!detectedModelType) {
            const modelName = modelData.name.toLowerCase();
            
            // SDXL 키워드 우선 검사 (더 구체적)
            if (modelName.includes('sdxl') || modelName.includes('xl')) {
                detectedModelType = 'sdxl';
            } else if (modelName.includes('sd15') || modelName.includes('sd1.5') || 
                      (modelName.includes('v1') && !modelName.includes('v10') && !modelName.includes('v11') && !modelName.includes('v12'))) {
                // v1은 포함하되, v10, v11, v12 등은 제외
                detectedModelType = 'sd15';
            }
        }
        
        // 3. 감지되지 않은 경우 기본값 사용
        if (!detectedModelType) {
            detectedModelType = 'sdxl'; // 기본값으로 SDXL 사용
        }
        
        this.currentBaseModel = detectedModelType;
        this.modelStatus = this.currentBaseModel;
        
        console.log('Model changed to:', modelData.name);
        console.log('Folder path:', modelData.folderPath || modelData.subfolder || 'N/A');
        console.log('Detected base model:', this.currentBaseModel);
        
        // 프리셋 인덱스 초기화 (새 모델 타입의 첫 번째 프리셋으로)
        this.currentPresetIndex = 0;
        
        this.updateUI();
    }
    
    notifyParameterChange() {
        // 커스텀 이벤트로 파라미터 변경 알림
        document.dispatchEvent(new CustomEvent('parameters:changed', {
            detail: { ...this.parameters }
        }));
        
        console.log('Parameters updated:', this.parameters);
    }
    
    getParameters() {
        return { ...this.parameters };
    }
    
    setParameters(newParams) {
        Object.assign(this.parameters, newParams);
        this.updateUI();
    }
    
    destroy() {
        console.log('Parameters component destroyed');
    }
}