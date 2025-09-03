// components/modelExplorer/modelExplorerComponent.js

import { Tooltip } from '../ui/tooltip/tooltip.js';

/**
 * 모델 탐색기 컴포넌트 - 플로팅 패널에서 사용
 * FastAPI 백엔드(포트 9001)와 통신하여 모델 목록을 표시
 */

export class ModelExplorerComponent {
    constructor() {
        this.checkpointList = [];
        this.vaeList = [];
        this.selectedModel = null;
        this.selectedFolderPath = null; // 선택된 모델의 폴더 경로 추적
        this.apiUrl = 'http://localhost:9001/api';
        this.tooltip = new Tooltip();
        this.containerElement = null;
        this.isInitialized = false;
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
            const elementName = fileElement.textContent.trim();
            
            // 경로, 하위폴더, 이름이 모두 일치하는지 확인
            if (elementPath === previousSelectedModel.path &&
                elementSubfolder === previousSelectedModel.subfolder &&
                elementName === previousSelectedModel.name) {
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
        
        // 툴팁 이벤트 - 새로운 Tooltip 컴포넌트 사용
        this.containerElement.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('file') && e.target.dataset.preview) {
                const filename = e.target.textContent;
                const previewPath = e.target.dataset.preview;
                const imageUrl = `${this.apiUrl}/models/preview/${previewPath}`;
                
                const content = `
                    <div class="tooltip-caption">${filename}</div>
                    <img src="${imageUrl}" alt="Preview" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div style="display: none; text-align: center; padding: 20px; color: #999;">
                        이미지를 불러올 수 없습니다
                    </div>
                `;
                
                this.tooltip.show(content, e);
            }
        });
        
        this.containerElement.addEventListener('mouseout', (e) => {
            if (e.target.classList.contains('file')) {
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
    
    handleFileClick(fileElement) {
        // 기존 선택 해제
        document.querySelectorAll('.model-explorer-component .file.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // 새 파일 선택
        fileElement.classList.add('selected');
        this.selectedModel = {
            name: fileElement.textContent,
            path: fileElement.dataset.path,
            subfolder: fileElement.dataset.subfolder
        };
        
        // 선택된 모델의 폴더 경로 추출 (첫 번째 폴더만)
        const subfolderParts = this.selectedModel.subfolder.split(/[\/\\]/).filter(p => p);
        this.selectedFolderPath = subfolderParts.length > 0 ? subfolderParts[0] : null;
        
        console.log('Selected model:', this.selectedModel);
        console.log('Selected folder path:', this.selectedFolderPath);
        
        // VAE 목록을 선택된 폴더에 맞게 업데이트
        this.renderFilteredVaes();
        
        // 이벤트 디스패치 (다른 컴포넌트에서 사용할 수 있도록)
        document.dispatchEvent(new CustomEvent('model:selected', {
            detail: {
                ...this.selectedModel,
                folderPath: this.selectedFolderPath
            }
        }));
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
                    '<div class="error">모델을 불러올 수 없습니다.<br>백엔드 서버(포트 9001)가 실행 중인지 확인해주세요.</div>';
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
                html += `<li><span class="file" data-path="${file.path}" data-subfolder="${file.subfolder}" ${previewData}>${file.name}</span></li>`;
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