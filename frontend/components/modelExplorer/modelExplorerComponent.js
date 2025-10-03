// components/modelExplorer/modelExplorerComponent.js

import { Tooltip } from '../ui/tooltip/tooltip.js';

/**
 * 모델 탐색기 컴포넌트 - 플로팅 패널에서 사용
 * FastAPI 백엔드(포트 9003)와 통신하여 모델 목록을 표시
 */

export class ModelExplorerComponent {
    constructor() {
        this.checkpointList = [];
        this.vaeList = [];
        this.selectedModel = null;
        this.selectedFolderPath = null; // 선택된 모델의 폴더 경로 추적
        this.apiUrl = 'http://localhost:8080/api';
        this.tooltip = new Tooltip();
        this.containerElement = null;
        this.isInitialized = false;
        this.loadedModels = new Set(); // 로딩된 모델 추적
        this.loadingModels = new Set(); // 로딩 중인 모델 추적
    }
    
    /**
     * renewal 아키텍처 호환 init 메서드
     * DOM 마운트 후에 호출되어 API 데이터를 로드
     */
    init() {
        if (this.isInitialized || !this.containerElement) {
            return;
        }
        
        this.isInitialized = true;
        
        // DOM이 마운트된 후에 API 호출
        setTimeout(() => {
            this.loadModels();
        }, 0);
    }
    
    render() {
        const container = document.createElement('div');
        container.className = 'model-explorer-component';
        container.style.cssText = `
            height: 100%;
            display: flex;
            flex-direction: column;
        `;
        
        // 탭 네비게이션
        const tabNav = document.createElement('div');
        tabNav.className = 'tab-nav';
        tabNav.style.cssText = `
            display: flex;
            border-bottom: 1px solid rgba(134, 142, 150, 0.2);
            margin-bottom: 12px;
        `;
        
        const checkpointTab = this.createTabButton('checkpoints', 'Checkpoints', true);
        const vaeTab = this.createTabButton('vaes', 'VAE', false);
        
        tabNav.appendChild(checkpointTab);
        tabNav.appendChild(vaeTab);
        
        // 탭 컨텐트
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content model-explorer-scrollbar';
        tabContent.style.cssText = `
            flex: 1;
            overflow-y: auto;
            min-height: 0;
            max-height: 100%;
        `;
        
        // 체크포인트 패널
        const checkpointsPanel = document.createElement('div');
        checkpointsPanel.id = 'checkpoints-content';
        checkpointsPanel.className = 'tab-pane active';
        checkpointsPanel.innerHTML = '<div class="loading">모델을 불러오는 중...</div>';
        
        // VAE 패널
        const vaePanel = document.createElement('div');
        vaePanel.id = 'vaes-content';
        vaePanel.className = 'tab-pane';
        vaePanel.innerHTML = '<div class="loading">VAE를 불러오는 중...</div>';
        
        tabContent.appendChild(checkpointsPanel);
        tabContent.appendChild(vaePanel);
        
        // 컨테이너 조립
        container.appendChild(tabNav);
        container.appendChild(tabContent);
        
        // 컨테이너를 참조로 저장 (이벤트 리스너 설정 전에 필요)
        this.containerElement = container;
        
        // CSS 스타일 추가
        this.addStyles();
        
        // 이벤트 리스너 설정
        this.setupEventListeners();
        
        return container;
    }
    
    createTabButton(id, text, active = false) {
        const button = document.createElement('button');
        button.className = `tab-btn ${active ? 'active' : ''}`;
        button.dataset.tab = id;
        button.textContent = text;
        button.style.cssText = `
            flex: 1;
            padding: 8px 12px;
            border: none;
            background: ${active ? 'rgba(108, 182, 255, 0.1)' : 'transparent'};
            color: ${active ? '#6cb6ff' : '#9aa0a6'};
            cursor: pointer;
            font-size: 12px;
            font-weight: ${active ? '600' : '400'};
            transition: all 0.2s ease;
            border-bottom: 2px solid ${active ? '#6cb6ff' : 'transparent'};
        `;
        
        return button;
    }
    
    addStyles() {
        if (document.getElementById('model-explorer-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'model-explorer-styles';
        style.textContent = `
            .model-explorer-component .loading {
                text-align: center;
                padding: 20px;
                color: #9aa0a6;
                font-size: 13px;
            }
            
            .model-explorer-component .error {
                text-align: center;
                padding: 20px;
                color: #ff6b6b;
                font-size: 13px;
            }
            
            .model-explorer-component .tab-pane {
                display: none;
            }
            
            .model-explorer-component .tab-pane.active {
                display: block;
            }
            
            .model-explorer-component .folder-content {
                list-style: none;
                padding-left: 12px;
                margin: 2px 0;
                transition: all 0.2s ease;
            }
            
            .model-explorer-component .folder-content.collapsed {
                height: 0;
                overflow: hidden;
                margin: 0;
            }
            
            .model-explorer-component .folder {
                display: flex;
                align-items: center;
                padding: 3px 6px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 500;
                color: #e8eaed;
                transition: background 0.2s ease;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .model-explorer-component .folder:hover {
                background: rgba(108, 182, 255, 0.1);
            }
            
            .model-explorer-component .toggle-arrow {
                margin-right: 6px;
                font-size: 10px;
                transition: transform 0.2s ease;
            }
            
            .model-explorer-component .file {
                display: block;
                padding: 3px 8px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 11px;
                color: #9aa0a6;
                transition: all 0.2s ease;
                text-overflow: ellipsis;
                overflow: hidden;
                white-space: nowrap;
                max-width: 100%;
                box-sizing: border-box;
            }
            
            .model-explorer-component .file:hover {
                background: rgba(108, 182, 255, 0.15);
                color: #6cb6ff;
            }
            
            .model-explorer-component .file.selected {
                background: rgba(108, 182, 255, 0.2);
                color: #6cb6ff;
                font-weight: 500;
            }

            .model-explorer-component .file.loaded-model {
                font-weight: 700;
                color: #4caf50;
            }

            .model-explorer-component .file.loaded-model:hover {
                background: rgba(76, 175, 80, 0.15);
                color: #66bb6a;
            }

            .model-explorer-component .file.loaded-model.selected {
                background: rgba(76, 175, 80, 0.25);
                color: #4caf50;
            }
        `;

        document.head.appendChild(style);
    }
    
    /**
     * DOM 복원 후 데이터 재로드를 위한 메서드
     * 플로팅 패널 복원 시 호출됨
     * 선택 상태를 보존하여 복원
     */
    refreshData() {
        if (this.containerElement) {
            console.log('ModelExplorer: Refreshing data after DOM restore');
            
            // 현재 선택 상태 백업
            const previousSelectedModel = this.selectedModel;
            const previousSelectedFolderPath = this.selectedFolderPath;
            
            // 현재 활성 탭 백업
            const activeTab = this.containerElement.querySelector('.tab-btn.active');
            const previousActiveTabId = activeTab ? activeTab.dataset.tab : 'checkpoints';
            
            console.log('Preserving selection state:', {
                model: previousSelectedModel,
                folderPath: previousSelectedFolderPath,
                activeTab: previousActiveTabId
            });
            
            // 데이터 재로드
            this.loadModels().then(() => {
                // 선택 상태 복원
                if (previousSelectedModel) {
                    this.restoreModelSelection(previousSelectedModel, previousSelectedFolderPath);
                }
                
                // 탭 상태 복원
                if (previousActiveTabId !== 'checkpoints') {
                    this.restoreTabSelection(previousActiveTabId);
                }
            });
        }
    }
    
    /**
     * 이전에 선택된 모델을 DOM에서 찾아서 선택 상태를 복원
     */
    restoreModelSelection(previousSelectedModel, previousSelectedFolderPath) {
        if (!previousSelectedModel || !this.containerElement) {
            return;
        }
        
        console.log('Restoring model selection:', previousSelectedModel);
        
        // DOM에서 해당 모델 파일 요소 찾기
        const fileElements = this.containerElement.querySelectorAll('.file');
        let targetFileElement = null;
        
        for (const fileElement of fileElements) {
            const elementPath = fileElement.dataset.path;
            const elementSubfolder = fileElement.dataset.subfolder;
            // 경로와 하위 폴더가 일치하는지 확인
            if (elementPath === previousSelectedModel.path &&
                (elementSubfolder || '') === (previousSelectedModel.subfolder || '')) {
                targetFileElement = fileElement;
                break;
            }
        }
        
        if (targetFileElement) {
            // 기존 선택 해제
            this.containerElement.querySelectorAll('.file.selected').forEach(el => {
                el.classList.remove('selected');
            });
            
            // 찾은 요소 선택 표시
            targetFileElement.classList.add('selected');
            
            // 내부 상태 복원
            this.selectedModel = previousSelectedModel;
            this.selectedFolderPath = previousSelectedFolderPath;
            
            // 선택된 모델이 속한 폴더를 확장된 상태로 유지
            this.ensureFolderExpanded(targetFileElement);
            
            // VAE 목록 업데이트
            this.renderFilteredVaes();
            
            console.log('Model selection restored successfully:', this.selectedModel);
            
            // 다른 컴포넌트에 선택 복원 알림
            document.dispatchEvent(new CustomEvent('model:selected', {
                detail: {
                    ...this.selectedModel,
                    folderPath: this.selectedFolderPath,
                    restored: true
                }
            }));
        } else {
            console.warn('Could not find previously selected model in DOM:', previousSelectedModel);
            // 이전 선택이 더 이상 유효하지 않으면 상태 초기화
            this.selectedModel = null;
            this.selectedFolderPath = null;
        }
    }
    
    /**
     * 선택된 파일이 속한 폴더가 접힌 상태라면 펼쳐서 표시
     */
    ensureFolderExpanded(fileElement) {
        let currentElement = fileElement.parentElement;
        
        while (currentElement && currentElement !== this.containerElement) {
            if (currentElement.classList.contains('folder-content') && 
                currentElement.classList.contains('collapsed')) {
                // 폴더 펼치기
                currentElement.classList.remove('collapsed');
                
                // 화살표 상태 업데이트
                const folderHeader = currentElement.previousElementSibling;
                if (folderHeader && folderHeader.classList.contains('folder')) {
                    const arrow = folderHeader.querySelector('.toggle-arrow');
                    if (arrow) {
                        arrow.textContent = '▼';
                    }
                }
            }
            currentElement = currentElement.parentElement;
        }
    }
    
    /**
     * 이전에 활성화된 탭을 복원
     */
    restoreTabSelection(previousActiveTabId) {
        if (!previousActiveTabId || !this.containerElement) {
            return;
        }
        
        console.log('Restoring tab selection:', previousActiveTabId);
        
        const targetTab = this.containerElement.querySelector(`[data-tab="${previousActiveTabId}"]`);
        if (targetTab) {
            // 탭 클릭 이벤트 트리거 (기존 탭 전환 로직 재사용)
            targetTab.click();
            console.log('Tab selection restored successfully:', previousActiveTabId);
        } else {
            console.warn('Could not find previously active tab:', previousActiveTabId);
        }
    }

    setupEventListeners() {
        if (!this.containerElement) {
            console.warn('ModelExplorerComponent: containerElement is not set');
            return;
        }
        
        // 탭 전환
        this.containerElement.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', () => {
                // 모든 탭 비활성화
                this.containerElement.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.background = 'transparent';
                    btn.style.color = '#9aa0a6';
                    btn.style.fontWeight = '400';
                    btn.style.borderBottom = '2px solid transparent';
                });
                
                this.containerElement.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.remove('active');
                });
                
                // 클릭된 탭 활성화
                button.classList.add('active');
                button.style.background = 'rgba(108, 182, 255, 0.1)';
                button.style.color = '#6cb6ff';
                button.style.fontWeight = '600';
                button.style.borderBottom = '2px solid #6cb6ff';
                
                this.containerElement.querySelector(`#${button.dataset.tab}-content`).classList.add('active');
            });
        });
        
        // 델리게이트된 이벤트 리스너 (동적 컨텐트용)
        this.containerElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('folder')) {
                this.handleFolderClick(e.target);
            } else if (e.target.classList.contains('file')) {
                this.handleFileClick(e.target);
            }
        });
        
        // 툴팁 이벤트 - LoRA Selector와 완전히 동일한 패턴 사용
        this.containerElement.addEventListener('mouseover', (e) => {
            if (e.target.closest('.file') && e.target.closest('.file').dataset.preview) {
                const fileElement = e.target.closest('.file');
                const filename = fileElement.textContent;
                const previewImage = fileElement.dataset.preview;
                const subfolder = fileElement.dataset.subfolder || '';
                
                // 로컬 파일 시스템 경로로 이미지 URL 구성 (preview_image에 이미 전체 경로 포함됨)
                const imageUrl = `./models/checkpoints/${previewImage}`.replace(/\\/g, '/').replace(/\/+/g, '/');
                
                const content = `
                    <div class="tooltip-caption">${filename}</div>
                    <img src="${imageUrl}" alt="Preview" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';">
                    <div style="display: none; text-align: center; padding: 20px; color: #999;">
                        이미지를 불러올 수 없습니다
                    </div>
                `;
                
                this.tooltip.show(content, e);
            }
        });
        
        this.containerElement.addEventListener('mouseout', (e) => {
            if (e.target.closest('.file')) {
                this.tooltip.hide();
            }
        });
    }
    
    handleFolderClick(folderElement) {
        const toggleArrow = folderElement.querySelector('.toggle-arrow');
        const ul = folderElement.nextElementSibling;
        
        if (ul && ul.classList.contains('folder-content')) {
            ul.classList.toggle('collapsed');
            toggleArrow.textContent = ul.classList.contains('collapsed') ? '▶' : '▼';
        }
    }
    
    async handleFileClick(fileElement) {
        // 기존 선택 해제
        document.querySelectorAll('.model-explorer-component .file.selected').forEach(el => {
            el.classList.remove('selected');
        });

        // 새 파일 선택
        fileElement.classList.add('selected');
        const datasetPath = fileElement.dataset.path || '';
        const fileName = datasetPath
            ? datasetPath.split(/[\\/]/).pop()
            : (fileElement.textContent || '').trim();

        this.selectedModel = {
            name: fileName,
            path: datasetPath,
            subfolder: fileElement.dataset.subfolder || ''
        };

        // 선택된 모델의 폴더 경로 추출 (첫 번째 폴더만)
        const subfolderParts = this.selectedModel.subfolder.split(/[\/\\]/).filter(p => p);
        this.selectedFolderPath = subfolderParts.length > 0 ? subfolderParts[0] : null;

        console.log('Selected model:', this.selectedModel);
        console.log('Selected folder path:', this.selectedFolderPath);

        // VAE 목록을 선택된 폴더에 맞게 업데이트
        this.renderFilteredVaes();

        // 체크포인트 모델인 경우 GPU 메모리에 로드 시도
        const isCheckpoint = fileElement.closest('#checkpoints-content') !== null;
        if (isCheckpoint) {
            await this.loadModelToGPU(this.selectedModel, fileElement);
        }

        // 이벤트 디스패치 (다른 컴포넌트에서 사용할 수 있도록)
        document.dispatchEvent(new CustomEvent('model:selected', {
            detail: {
                ...this.selectedModel,
                folderPath: this.selectedFolderPath,
                loaded: this.loadedModels.has(this.selectedModel.path)
            }
        }));
    }

    /**
     * 체크포인트 모델을 GPU 메모리에 로드
     */    async loadModelToGPU(model, fileElement) {
        const modelPath = model.path;

        // 이미 로딩 중인 경우 무시
        if (this.loadingModels.has(modelPath)) {
            console.log(`Model ${model.name} is already loading`);
            return;
        }

        // 이미 로드된 경우 무시
        if (this.loadedModels.has(modelPath)) {
            console.log(`Model ${model.name} is already loaded`);
            this.showLoadStatus(fileElement, 'loaded', 'Already loaded');
            return;
        }

        // Clear previous loaded model markers before loading a different model
        this.clearLoadedModelIndicators();
        this.loadedModels.clear();

        try {
            this.loadingModels.add(modelPath);
            this.showLoadStatus(fileElement, 'loading', 'Loading to GPU...');

            console.log(`Loading model to GPU: ${model.name}`);

            // 상대 경로 생성 (subfolder + filename)
            const relativePath = model.subfolder ? `${model.subfolder}/${model.name}` : model.name;

            // Create AbortController for 5-minute timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                console.error(`Model loading timeout after 5 minutes: ${modelPath}`);
            }, 300000); // 5 minutes = 300000ms

            const startTime = performance.now();

            // POST 요청의 body에 경로 전달 (with timeout)
            const response = await fetch(`${this.apiUrl}/models/load`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model_path: relativePath,
                    model_type: 'checkpoint'
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const result = await response.json();
            const clientLoadTime = ((performance.now() - startTime) / 1000).toFixed(2);

            if (result.success) {
                this.loadedModels.add(modelPath);
                this.loadingModels.delete(modelPath);

                const serverLoadTime = result.load_time_seconds || clientLoadTime;
                const memoryUsed = result.memory_usage?.gpu_memory_allocated_mb || result.memory_used_mb || 'N/A';
                const device = result.device || 'unknown';

                this.showLoadStatus(
                    fileElement,
                    'success',
                    `✓ Loaded in ${serverLoadTime}s (${memoryUsed}MB on ${device})`
                );

                // 로드된 모델을 진하게 표시
                fileElement.classList.add('loaded-model');

                console.log(`Model loaded successfully in ${serverLoadTime}s:`, result);

                // GPU 메모리 사용량 업데이트
                this.updateMemoryDisplay();
                // Generation Panel에 로드된 모델 알림
                document.dispatchEvent(new CustomEvent('model:loaded', {
                    detail: {
                        path: modelPath,
                        name: model.name,
                        subfolder: model.subfolder,
                        loadTime: serverLoadTime,
                        memoryUsed: memoryUsed,
                        device: device
                    }
                }));

            } else {
                this.loadingModels.delete(modelPath);
                const errorMsg = result.error || 'Failed to load model';
                this.showLoadStatus(fileElement, 'error', `✗ ${errorMsg}`);
                console.error(`Failed to load model:`, result);
            }

        } catch (error) {
            this.loadingModels.delete(modelPath);

            let errorMessage;
            if (error.name === 'AbortError') {
                errorMessage = 'Loading timeout (5 min)';
                console.error(`Model loading aborted due to timeout: ${modelPath}`);
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Network error';
                console.error(`Network error loading model: ${modelPath}`, error);
            } else {
                errorMessage = error.message || 'Unknown error';
                console.error(`Error loading model ${modelPath}:`, error);
            }

            this.showLoadStatus(fileElement, 'error', `✗ ${errorMessage}`);
        }
    }

    /**
     * 파일 요소에 로딩 상태 표시
     */
    showLoadStatus(fileElement, status, message) {
        // 기존 상태 표시 제거
        const existingStatus = fileElement.querySelector('.load-status');
        if (existingStatus) {
            existingStatus.remove();
        }

        // 새 상태 표시 추가
        const statusElement = document.createElement('span');
        statusElement.className = `load-status load-status-${status}`;
        statusElement.textContent = message;
        statusElement.style.cssText = `
            margin-left: 8px;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            display: inline-block;
        `;

        switch (status) {
            case 'loading':
                statusElement.style.background = 'rgba(108, 182, 255, 0.2)';
                statusElement.style.color = '#6cb6ff';
                break;
            case 'success':
            case 'loaded':
                statusElement.style.background = 'rgba(52, 211, 153, 0.2)';
                statusElement.style.color = '#34d399';
                break;
            case 'error':
                statusElement.style.background = 'rgba(248, 113, 113, 0.2)';
                statusElement.style.color = '#f87171';
                break;
        }

        fileElement.appendChild(statusElement);

        // 성공/에러 메시지는 3초 후 자동 제거
        if (status === 'success' || status === 'error') {
            setTimeout(() => {
                if (statusElement.parentElement) {
                    statusElement.remove();
                }
            }, 3000);
        }
    }

    clearLoadedModelIndicators() {
        const scope = this.containerElement || document;
        const loadedElements = scope.querySelectorAll('.file.loaded-model');

        loadedElements.forEach(fileElement => {
            fileElement.classList.remove('loaded-model');
            const status = fileElement.querySelector('.load-status');
            if (status) {
                status.remove();
            }
        });
    }

    /**
     * GPU 메모리 사용량 표시 업데이트
     */
    async updateMemoryDisplay() {
        try {
            const response = await fetch(`${this.apiUrl}/system/memory`);
            const memoryData = await response.json();

            if (memoryData.gpu_available && memoryData.gpu_memory) {
                const gpuInfo = Object.values(memoryData.gpu_memory)[0];
                console.log('GPU Memory:', gpuInfo);

                // GPU 메모리 정보를 이벤트로 전달
                document.dispatchEvent(new CustomEvent('gpu:memory-updated', {
                    detail: gpuInfo
                }));
            }
        } catch (error) {
            console.error('Error fetching memory usage:', error);
        }
    }
    
    
    async loadModels() {
        // DOM 요소 존재 확인
        const checkpointsElement = this.containerElement?.querySelector('#checkpoints-content') || 
                                  document.getElementById('checkpoints-content');
        const vaesElement = this.containerElement?.querySelector('#vaes-content') || 
                           document.getElementById('vaes-content');
        
        if (!checkpointsElement || !vaesElement) {
            console.error('Model Explorer: DOM 요소를 찾을 수 없습니다. 컴포넌트가 아직 마운트되지 않았을 수 있습니다.');
            return Promise.reject(new Error('DOM 요소를 찾을 수 없습니다'));
        }
        
        try {
            const [checkpointsRes, vaesRes] = await Promise.all([
                fetch(`${this.apiUrl}/models/checkpoints`),
                fetch(`${this.apiUrl}/models/vaes`)
            ]);
            
            if (!checkpointsRes.ok) throw new Error(`Checkpoints 로딩 실패: ${checkpointsRes.status}`);
            if (!vaesRes.ok) throw new Error(`VAEs 로딩 실패: ${vaesRes.status}`);
            
            this.checkpointList = await checkpointsRes.json();
            this.vaeList = await vaesRes.json();
            
            this.renderCheckpoints();
            this.renderVaes();
            
            return Promise.resolve();
            
        } catch (error) {
            console.error('모델 로딩 실패:', error);
            
            // 안전한 DOM 업데이트
            if (checkpointsElement) {
                checkpointsElement.innerHTML = 
                    '<div class="error">모델을 불러올 수 없습니다.<br>백엔드 서버(포트 9004)가 실행 중인지 확인해주세요.</div>';
            }
            
            return Promise.reject(error);
        }
    }
    
    renderCheckpoints() {
        const checkpointsElement = this.containerElement?.querySelector('#checkpoints-content') || 
                                  document.getElementById('checkpoints-content');
        
        if (!checkpointsElement) {
            console.error('Model Explorer: checkpoints-content 요소를 찾을 수 없습니다.');
            return;
        }
        
        const tree = this.buildTree(this.checkpointList);
        checkpointsElement.innerHTML = this.renderTree(tree);
    }
    
    renderVaes() {
        const vaesElement = this.containerElement?.querySelector('#vaes-content') || 
                           document.getElementById('vaes-content');
        
        if (!vaesElement) {
            console.error('Model Explorer: vaes-content 요소를 찾을 수 없습니다.');
            return;
        }
        
        const tree = this.buildTree(this.vaeList);
        vaesElement.innerHTML = this.renderTree(tree);
    }
    
    renderFilteredVaes() {
        const vaesElement = this.containerElement?.querySelector('#vaes-content') || 
                           document.getElementById('vaes-content');
        
        if (!vaesElement) {
            console.error('Model Explorer: vaes-content 요소를 찾을 수 없습니다.');
            return;
        }
        
        if (!this.selectedFolderPath) {
            // 폴더가 선택되지 않았으면 전체 VAE 표시
            const tree = this.buildTree(this.vaeList);
            vaesElement.innerHTML = this.renderTree(tree);
            return;
        }
        
        // 선택된 폴더와 같은 첫 번째 폴더를 가진 VAE만 필터링
        const filteredVaes = this.vaeList.filter(vae => {
            const vaeSubfolderParts = vae.subfolder.split(/[\/\\]/).filter(p => p);
            const vaeFirstFolder = vaeSubfolderParts.length > 0 ? vaeSubfolderParts[0] : null;
            return vaeFirstFolder === this.selectedFolderPath;
        });
        
        console.log(`Filtered VAEs for folder '${this.selectedFolderPath}':`, filteredVaes.length, 'items');
        
        if (filteredVaes.length === 0) {
            vaesElement.innerHTML = `<div class="no-models">선택된 폴더(${this.selectedFolderPath})에 VAE가 없습니다.</div>`;
            return;
        }
        
        const tree = this.buildTree(filteredVaes);
        vaesElement.innerHTML = this.renderTree(tree);
    }
    
    buildTree(files) {
        const tree = {};
        files.forEach(file => {
            let currentLevel = tree;
            
            // 전체 하위 폴더 구조를 추적
            const subfolderParts = file.subfolder.split(/[\/\\]/).filter(p => p);
            
            // 각 하위 폴더별로 트리 구조 생성
            for (let i = 0; i < subfolderParts.length; i++) {
                const part = subfolderParts[i];
                if (!currentLevel[part]) {
                    currentLevel[part] = {};
                }
                currentLevel = currentLevel[part];
            }
            
            // 하위 폴더가 없으면 '루트'로 분류
            if (subfolderParts.length === 0) {
                if (!currentLevel['루트']) {
                    currentLevel['루트'] = {};
                }
                currentLevel = currentLevel['루트'];
            }
            
            // 최종 레벨에 파일 추가
            if (!currentLevel._files) currentLevel._files = [];
            currentLevel._files.push(file);
        });
        
        return tree;
    }
    
    renderTree(node) {
        let html = '';
        const folders = Object.keys(node).filter(key => key !== '_files').sort();
        
        if (folders.length > 0) {
            html += '<ul class="folder-content active">';
            folders.forEach(key => {
                html += `<li><span class="folder"><span class="toggle-arrow">▼</span> ${key}</span>`;
                html += this.renderTree(node[key]);
                html += '</li>';
            });
            html += '</ul>';
        }
        
        if (node._files && node._files.length > 0) {
            const files = node._files.sort((a, b) => a.name.localeCompare(b.name));
            html += '<ul class="folder-content active">';
            files.forEach(file => {
                const previewData = file.preview_image ? `data-preview="${file.preview_image}"` : '';
                // 로드된 모델인지 확인
                const isLoaded = this.loadedModels.has(file.path);
                const loadedClass = isLoaded ? ' loaded-model' : '';
                html += `<li><span class="file${loadedClass}" data-path="${file.path}" data-subfolder="${file.subfolder}" ${previewData}>${file.name}</span></li>`;
            });
            html += '</ul>';
        }
        
        return html;
    }
    
    getSelectedModel() {
        return this.selectedModel;
    }
    
    destroy() {
        this.tooltip.hide();
        console.log('Model Explorer component destroyed');
    }
}