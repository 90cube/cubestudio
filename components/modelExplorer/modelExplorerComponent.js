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
        tabContent.className = 'tab-content';
        tabContent.style.cssText = `
            flex: 1;
            overflow-y: auto;
            min-height: 0;
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
        
        // CSS 스타일 추가
        this.addStyles();
        
        // 이벤트 리스너 설정
        this.setupEventListeners(container);
        
        // 컨테이너를 참조로 저장 (DOM 마운트 후 API 호출용)
        this.containerElement = container;
        
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
                padding-left: 16px;
                margin: 4px 0;
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
                padding: 4px 8px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
                color: #e8eaed;
                transition: background 0.2s ease;
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
                padding: 6px 12px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 12px;
                color: #9aa0a6;
                transition: all 0.2s ease;
                text-overflow: ellipsis;
                overflow: hidden;
                white-space: nowrap;
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
    
    setupEventListeners(container) {
        // 탭 전환
        container.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', () => {
                // 모든 탭 비활성화
                container.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.background = 'transparent';
                    btn.style.color = '#9aa0a6';
                    btn.style.fontWeight = '400';
                    btn.style.borderBottom = '2px solid transparent';
                });
                
                container.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.remove('active');
                });
                
                // 클릭된 탭 활성화
                button.classList.add('active');
                button.style.background = 'rgba(108, 182, 255, 0.1)';
                button.style.color = '#6cb6ff';
                button.style.fontWeight = '600';
                button.style.borderBottom = '2px solid #6cb6ff';
                
                container.querySelector(`#${button.dataset.tab}-content`).classList.add('active');
            });
        });
        
        // 델리게이트된 이벤트 리스너 (동적 컨텐트용)
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('folder')) {
                this.handleFolderClick(e.target);
            } else if (e.target.classList.contains('file')) {
                this.handleFileClick(e.target);
            }
        });
        
        // 툴팁 이벤트 - 새로운 Tooltip 컴포넌트 사용
        container.addEventListener('mouseover', (e) => {
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
        
        container.addEventListener('mouseout', (e) => {
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
            return;
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
            
        } catch (error) {
            console.error('모델 로딩 실패:', error);
            
            // 안전한 DOM 업데이트
            if (checkpointsElement) {
                checkpointsElement.innerHTML = 
                    '<div class="error">모델을 불러올 수 없습니다.<br>백엔드 서버(포트 9001)가 실행 중인지 확인해주세요.</div>';
            }
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