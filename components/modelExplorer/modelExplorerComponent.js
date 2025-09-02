// components/modelExplorer/modelExplorerComponent.js

/**
 * 모델 탐색기 컴포넌트 - 플로팅 패널에서 사용
 * FastAPI 백엔드(포트 9001)와 통신하여 모델 목록을 표시
 */

export class ModelExplorerComponent {
    constructor() {
        this.checkpointList = [];
        this.vaeList = [];
        this.selectedModel = null;
        this.apiUrl = 'http://localhost:9001/api';
        this.activeTooltip = null;
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
        
        // 데이터 로드
        this.loadModels();
        
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
            
            /* 툴팁 스타일 */
            .model-tooltip {
                position: fixed;
                z-index: 1100;
                border: 1px solid rgba(134, 142, 150, 0.3);
                background: rgba(32, 35, 42, 0.95);
                backdrop-filter: blur(20px);
                padding: 8px;
                border-radius: 10px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                pointer-events: none;
                animation: fadeIn 0.2s ease-out;
            }
            
            .model-tooltip img {
                max-width: 256px;
                max-height: 256px;
                width: auto;
                height: auto;
                display: block;
                border-radius: 6px;
            }
            
            .tooltip-filename {
                max-width: 256px;
                padding: 4px 8px;
                color: #e8eaed;
                font-size: 12px;
                text-align: center;
                word-break: break-all;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
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
        
        // 툴팁 이벤트
        container.addEventListener('mouseover', (e) => {
            if (e.target.classList.contains('file') && e.target.dataset.preview) {
                this.showTooltip(e);
            }
        });
        
        container.addEventListener('mousemove', (e) => {
            if (this.activeTooltip) {
                this.updateTooltipPosition(e);
            }
        });
        
        container.addEventListener('mouseout', (e) => {
            if (e.target.classList.contains('file') && this.activeTooltip) {
                this.hideTooltip();
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
        
        console.log('Selected model:', this.selectedModel);
        
        // 이벤트 디스패치 (다른 컴포넌트에서 사용할 수 있도록)
        document.dispatchEvent(new CustomEvent('model:selected', {
            detail: this.selectedModel
        }));
    }
    
    showTooltip(event) {
        if (this.activeTooltip) this.hideTooltip();
        
        this.activeTooltip = document.createElement('div');
        this.activeTooltip.className = 'model-tooltip';
        
        const filename = event.target.textContent;
        const previewSrc = event.target.dataset.preview;
        
        this.activeTooltip.innerHTML = `
            <div class="tooltip-filename">${filename}</div>
            <img src="${this.apiUrl}/${previewSrc}" alt="Preview">
        `;
        
        document.body.appendChild(this.activeTooltip);
        this.updateTooltipPosition(event);
    }
    
    updateTooltipPosition(event) {
        if (!this.activeTooltip) return;
        
        this.activeTooltip.style.left = `${event.pageX + 15}px`;
        this.activeTooltip.style.top = `${event.pageY + 15}px`;
    }
    
    hideTooltip() {
        if (this.activeTooltip) {
            this.activeTooltip.remove();
            this.activeTooltip = null;
        }
    }
    
    async loadModels() {
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
            document.getElementById('checkpoints-content').innerHTML = 
                '<div class="error">모델을 불러올 수 없습니다.<br>백엔드 서버(포트 9001)가 실행 중인지 확인해주세요.</div>';
        }
    }
    
    renderCheckpoints() {
        const tree = this.buildTree(this.checkpointList);
        document.getElementById('checkpoints-content').innerHTML = this.renderTree(tree);
    }
    
    renderVaes() {
        const tree = this.buildTree(this.vaeList);
        document.getElementById('vaes-content').innerHTML = this.renderTree(tree);
    }
    
    buildTree(files) {
        const tree = {};
        files.forEach(file => {
            let currentLevel = tree;
            
            // SD15, SDXL 등 주 카테고리 결정
            let primaryCategory = null;
            const subfolderParts = file.subfolder.split(/[\/\\]/).filter(p => p);
            
            if (subfolderParts.length > 0) {
                const firstPart = subfolderParts[0].toLowerCase();
                if (firstPart === 'sd15') {
                    primaryCategory = 'SD 1.5';
                } else if (firstPart === 'sdxl' || firstPart === 'ilxl') {
                    primaryCategory = 'SDXL';
                }
            }
            
            // 주 카테고리가 있으면 첫 레벨로 생성
            if (primaryCategory) {
                if (!currentLevel[primaryCategory]) {
                    currentLevel[primaryCategory] = {};
                }
                currentLevel = currentLevel[primaryCategory];
            } else {
                // 주 카테고리가 없으면 '기타'로 분류
                if (!currentLevel['기타']) {
                    currentLevel['기타'] = {};
                }
                currentLevel = currentLevel['기타'];
            }
            
            // 나머지 서브폴더들 처리
            let startIndex = 0;
            if (subfolderParts.length > 0 && primaryCategory) {
                const firstOriginalPartLower = subfolderParts[0].toLowerCase();
                if (firstOriginalPartLower === primaryCategory.toLowerCase().replace(/[^a-z0-9]/g, '') || 
                    (firstOriginalPartLower === 'ilxl' && primaryCategory === 'SDXL')) {
                    startIndex = 1;
                }
            }
            
            for (let i = startIndex; i < subfolderParts.length; i++) {
                const part = subfolderParts[i];
                if (!currentLevel[part]) {
                    currentLevel[part] = {};
                }
                currentLevel = currentLevel[part];
            }
            
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
        this.hideTooltip();
        console.log('Model Explorer component destroyed');
    }
}