// components/loraSelector/loraSelector.js

import { Tooltip } from '../ui/tooltip/tooltip.js';

/**
 * LoRA 선택기 컴포넌트 - 플로팅 패널에서 사용
 * LoRA 모델을 선택하고 가중치를 조절하는 인터페이스
 */

export class LoRASelectorComponent {
    constructor() {
        this.containerElement = null;
        this.isInitialized = false;
        this.apiUrl = 'http://localhost:8080/api';
        this.selectedModelType = null; // 선택된 체크포인트 타입 (SDXL, WAN 등)
        
        // LoRA 데이터 저장
        this.availableLoRAs = []; // 서버에서 불러온 LoRA 목록
        this.selectedLoRAs = []; // 선택된 LoRA 목록 [{ path, name, weight, subfolder }]
        this.loraTree = {}; // 폴더 트리 구조로 LoRA 정리
        
        this.eventListeners = []; // 이벤트 리스너 추적용
        this.loadingState = { loras: false, error: null }; // 로딩 상태 관리
        
        // UI 상태
        this.searchTerm = '';
        this.showSelectedOnly = false;
        
        // 바인딩된 메서드들
        this.handleModelSelection = this.handleModelSelection.bind(this);
        
        // 툴팁 컴포넌트
        this.tooltip = new Tooltip();
    }
    
    /**
     * renewal 아키텍처 호환 init 메서드
     */
    init() {
        if (this.isInitialized || !this.containerElement) {
            return;
        }
        
        this.isInitialized = true;
        
        // DOM 마운트 후 초기화
        setTimeout(() => {
            this.setupEventListeners();
            this.loadLoRAModels();
            this.setupModelSelectionListener();
        }, 0);
    }
    
    render() {
        const container = document.createElement('div');
        container.className = 'lora-selector-component';
        container.style.cssText = `
            height: 100%;
            display: flex;
            flex-direction: column;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        `;
        
        // 헤더 - 검색 및 필터
        const header = this.createHeader();
        
        // LoRA 목록 컨테이너
        const loraList = document.createElement('div');
        loraList.id = 'lora-list-container';
        loraList.className = 'lora-list-container lora-selector-scrollbar';
        loraList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            min-height: 0;
            max-height: 100%;
        `;
        
        // 선택된 LoRA 카운터
        const selectedCounter = document.createElement('div');
        selectedCounter.id = 'selected-lora-counter';
        selectedCounter.className = 'selected-counter';
        selectedCounter.style.cssText = `
            padding: 8px 12px;
            background: rgba(155, 89, 182, 0.1);
            border-top: 1px solid rgba(155, 89, 182, 0.2);
            font-size: 12px;
            font-weight: 600;
            color: #7b1fa2;
            text-align: center;
        `;
        selectedCounter.textContent = 'Selected: 0 LoRAs';
        
        // 로딩 상태 표시
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'lora-loading';
        loadingDiv.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100px;
            color: #666;
            font-size: 14px;
        `;
        loadingDiv.innerHTML = `
            <div style="text-align: center;">
                <div style="margin-bottom: 8px;">🔄</div>
                <div>Loading LoRA models...</div>
            </div>
        `;
        
        loraList.appendChild(loadingDiv);
        
        // 컨테이너 조립
        container.appendChild(header);
        container.appendChild(loraList);
        container.appendChild(selectedCounter);
        
        // CSS 스타일 추가
        this.addStyles();
        
        // 컨테이너 참조 저장
        this.containerElement = container;
        
        return container;
    }
    
    createHeader() {
        const header = document.createElement('div');
        header.className = 'lora-header';
        header.style.cssText = `
            padding: 12px;
            background: rgba(255, 255, 255, 0.9);
            border-bottom: 1px solid rgba(155, 89, 182, 0.2);
            backdrop-filter: blur(10px);
        `;
        
        // 검색 입력
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = `
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
        `;
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'lora-search';
        searchInput.placeholder = 'Search LoRA models...';
        searchInput.style.cssText = `
            flex: 1;
            padding: 6px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 12px;
        `;
        
        // 필터 버튼들
        const filterContainer = document.createElement('div');
        filterContainer.style.cssText = `
            display: flex;
            gap: 6px;
        `;
        
        const showSelectedBtn = document.createElement('button');
        showSelectedBtn.id = 'show-selected-toggle';
        showSelectedBtn.textContent = '📌 Selected';
        showSelectedBtn.style.cssText = `
            padding: 6px 10px;
            border: 1px solid #9b59b6;
            background: white;
            color: #9b59b6;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        const clearAllBtn = document.createElement('button');
        clearAllBtn.id = 'clear-all-loras';
        clearAllBtn.textContent = '🗑️ Clear';
        clearAllBtn.style.cssText = `
            padding: 6px 10px;
            border: 1px solid #e74c3c;
            background: white;
            color: #e74c3c;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        searchContainer.appendChild(searchInput);
        filterContainer.appendChild(showSelectedBtn);
        filterContainer.appendChild(clearAllBtn);
        
        header.appendChild(searchContainer);
        header.appendChild(filterContainer);
        
        return header;
    }
    
    addStyles() {
        if (document.getElementById('lora-selector-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'lora-selector-styles';
        style.textContent = `
            .lora-selector-component {
                color: #333;
                font-size: 13px;
            }
            
            .lora-item {
                display: flex;
                align-items: center;
                padding: 8px;
                margin: 4px 0;
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 6px;
                transition: all 0.2s ease;
                cursor: pointer;
            }
            
            .lora-item:hover {
                border-color: #9b59b6;
                box-shadow: 0 2px 8px rgba(155, 89, 182, 0.15);
                transform: translateY(-1px);
            }
            
            .lora-item.selected {
                border-color: #9b59b6;
                background: linear-gradient(135deg, rgba(155, 89, 182, 0.1) 0%, rgba(155, 89, 182, 0.05) 100%);
            }
            
            .lora-item .lora-checkbox {
                width: 16px;
                height: 16px;
                margin-right: 8px;
                accent-color: #9b59b6;
            }
            
            .lora-item .lora-info {
                flex: 1;
                min-width: 0;
            }
            
            .lora-item .lora-name {
                font-weight: 500;
                color: #333;
                margin-bottom: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .lora-item .lora-path {
                font-size: 11px;
                color: #666;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .lora-item .lora-weight {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-left: 8px;
                min-width: 120px;
            }
            
            .lora-item .weight-slider {
                width: 70px;
                height: 4px;
                accent-color: #9b59b6;
            }
            
            .lora-item .weight-value {
                min-width: 35px;
                font-size: 11px;
                font-weight: 600;
                color: #9b59b6;
                background: rgba(155, 89, 182, 0.1);
                padding: 2px 4px;
                border-radius: 3px;
                text-align: center;
            }
            
            .lora-folder {
                margin: 8px 0 4px 0;
                padding: 6px 8px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            
            .lora-header button:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            }
            
            .lora-header button.active {
                background: #9b59b6;
                color: white;
                border-color: #9b59b6;
            }
            
            #lora-search:focus {
                outline: none;
                border-color: #9b59b6;
                box-shadow: 0 0 0 2px rgba(155, 89, 182, 0.1);
            }
        `;
        
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        if (!this.containerElement) return;
        
        // 검색 입력 이벤트
        const searchInput = this.containerElement.querySelector('#lora-search');
        if (searchInput) {
            const searchHandler = (e) => {
                this.searchTerm = e.target.value;
                this.filterAndRenderLoRAs();
            };
            searchInput.addEventListener('input', searchHandler);
            this.eventListeners.push({ element: searchInput, event: 'input', handler: searchHandler });
        }
        
        // 선택된 것만 보기 토글
        const showSelectedBtn = this.containerElement.querySelector('#show-selected-toggle');
        if (showSelectedBtn) {
            const toggleHandler = () => {
                this.showSelectedOnly = !this.showSelectedOnly;
                showSelectedBtn.classList.toggle('active', this.showSelectedOnly);
                this.filterAndRenderLoRAs();
            };
            showSelectedBtn.addEventListener('click', toggleHandler);
            this.eventListeners.push({ element: showSelectedBtn, event: 'click', handler: toggleHandler });
        }
        
        // 모두 지우기
        const clearAllBtn = this.containerElement.querySelector('#clear-all-loras');
        if (clearAllBtn) {
            const clearHandler = () => {
                this.selectedLoRAs = [];
                this.updateSelectedCounter();
                this.filterAndRenderLoRAs();
                this.notifyChange();
            };
            clearAllBtn.addEventListener('click', clearHandler);
            this.eventListeners.push({ element: clearAllBtn, event: 'click', handler: clearHandler });
        }
        
        // 툴팁 이벤트 설정
        this.setupTooltipEvents();
    }
    
    setupTooltipEvents() {
        if (!this.containerElement) return;
        
        // 툴팁 이벤트 - ModelExplorer와 동일한 패턴
        this.containerElement.addEventListener('mouseover', (e) => {
            if (e.target.closest('.lora-item') && e.target.closest('.lora-item').dataset.previewImage) {
                const loraItem = e.target.closest('.lora-item');
                const loraName = loraItem.querySelector('.lora-name')?.textContent;
                const previewImage = loraItem.dataset.previewImage;
                const subfolder = loraItem.dataset.subfolder;
                
                // 로컬 파일 시스템 경로로 이미지 URL 구성
                const imageUrl = `models/loras/${subfolder}/${previewImage}`.replace(/\/+/g, '/');
                
                const content = `
                    <div class="tooltip-caption">${loraName}</div>
                    <img src="${imageUrl}" alt="Preview" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                    <div style="display: none; text-align: center; padding: 20px; color: #999;">
                        이미지를 불러올 수 없습니다
                    </div>
                `;
                
                this.tooltip.show(content, e);
            }
        });
        
        this.containerElement.addEventListener('mouseout', (e) => {
            if (e.target.closest('.lora-item')) {
                this.tooltip.hide();
            }
        });
    }
    
    async loadLoRAModels() {
        this.loadingState.loras = true;
        
        try {
            // 로컬 파일 시스템에서 LoRA 모델 스캔
            const loraModels = await this.scanLocalLoRAModels();
            this.availableLoRAs = loraModels;
            this.buildLoRATree();
            this.loadingState.loras = false;
            this.loadingState.error = null;
            
            // 로딩 완료 후 렌더링
            this.filterAndRenderLoRAs();
            
        } catch (error) {
            console.error('LoRA models loading failed:', error);
            this.loadingState.loras = false;
            this.loadingState.error = error.message;
            
            // 기본 목록으로 폴백 (로컬 파일 시스템 기준)
            this.availableLoRAs = await this.getDefaultLoRAList();
            this.buildLoRATree();
            this.filterAndRenderLoRAs();
        }
    }
    
    async scanLocalLoRAModels() {
        // API 없이 직접 하드코딩된 목록 사용
        // console.log('Loading hardcoded LoRA list (API not available)');
        return this.getHardcodedLoRAList();
    }
    
    getHardcodedLoRAList() {
        // models/loras 폴더 구조를 기반으로 한 하드코딩된 목록
        return [
            // SDXL/ILXL 폴더
            { name: 'YHILXL-000001', path: 'YHILXL-000001.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'YHILXL-000001.png' },
            { name: 'iLLMythSmo0thL1nes', path: 'iLLMythSmo0thL1nes.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'iLLMythSmo0thL1nes.png' },
            { name: 'ILLMythP0rtr4itStyle', path: 'ILLMythP0rtr4itStyle.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'ILLMythP0rtr4itStyle.jpeg' },
            { name: 'leatherarmor IL', path: 'leatherarmor IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'leatherarmor IL.jpeg' },
            { name: 'goblin_IL', path: 'goblin_IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'goblin_IL.jpeg' },
            { name: 'minotaur IL', path: 'minotaur IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'minotaur IL.jpeg' },
            { name: 'kobold IL', path: 'kobold IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'kobold IL.jpeg' },
            { name: 'tieflingIL', path: 'tieflingIL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'tieflingIL.jpeg' },
            { name: 'yuanti IL', path: 'yuanti IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'yuanti IL.jpeg' },
            { name: 'warforged', path: 'warforged.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'warforged.jpeg' },
            { name: 'gnome IL', path: 'gnome IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'gnome IL.jpeg' },
            { name: 'viwe_topdown_IL', path: 'viwe_topdown_IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'viwe_topdown_IL.jpeg' },
            { name: 'kenku IL', path: 'kenku IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'kenku IL.jpeg' },
            { name: 'armors IL', path: 'armors IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'armors IL.png' },
            { name: 'NinjaAF_IL', path: 'NinjaAF_IL.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'NinjaAF_IL.png' },
            { name: 'ILXL_YH_Style_DNF', path: 'ILXL_YH_Style_DNF.safetensors', subfolder: 'SDXL/ILXL', preview_image: 'ILXL_YH_Style_DNF.png' },
            
            // SDXL/NOOB 폴더
            { name: 'korean idol-noob-V1', path: 'korean idol-noob-V1.safetensors', subfolder: 'SDXL/NOOB', preview_image: 'korean idol-noob-V1.png' },
            { name: 'Film Photography-NOOB-V1', path: 'Film Photography-NOOB-V1.safetensors', subfolder: 'SDXL/NOOB', preview_image: 'Film Photography-NOOB-V1.png' },
            { name: 'asian beauty face-SDXL-V1', path: 'asian beauty face-SDXL-V1.safetensors', subfolder: 'SDXL/NOOB', preview_image: 'asian beauty face-SDXL-V1.png' },
            
            // WAN 폴더
            { name: 'Wan21_CausVid_14B_T2V_lora_rank32', path: 'Wan21_CausVid_14B_T2V_lora_rank32.safetensors', subfolder: 'WAN' },
            { name: 'Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank32', path: 'Wan21_T2V_14B_lightx2v_cfg_step_distill_lora_rank32.safetensors', subfolder: 'WAN' },
            { name: 'Wan2.1-Fun-1.3B-InP-MPS', path: 'Wan2.1-Fun-1.3B-InP-MPS.safetensors', subfolder: 'WAN' },
            { name: 'Wan2.1-Fun-1.3B-InP-HPS2.1', path: 'Wan2.1-Fun-1.3B-InP-HPS2.1.safetensors', subfolder: 'WAN' },
            { name: 'Wan2.1-Fun-14B-InP-MPS', path: 'Wan2.1-Fun-14B-InP-MPS.safetensors', subfolder: 'WAN' },
            { name: 'Wan2.1-Fun-14B-InP-HPS2.1', path: 'Wan2.1-Fun-14B-InP-HPS2.1.safetensors', subfolder: 'WAN' },
            { name: 'Wan2.1_T2V_14B_FusionX_LoRA', path: 'Wan2.1_T2V_14B_FusionX_LoRA.safetensors', subfolder: 'WAN' },
            { name: 'Wan2.1_I2V_14B_FusionX_LoRA', path: 'Wan2.1_I2V_14B_FusionX_LoRA.safetensors', subfolder: 'WAN' },
            
            // WAN/KJ_WAN 하위폴더
            { name: 'Wan2.1-Fun-1.3B-InP-MPS_reward_lora_comfy', path: 'Wan2.1-Fun-1.3B-InP-MPS_reward_lora_comfy.safetensors', subfolder: 'WAN/KJ_WAN' },
            { name: 'Wan2.1-Fun-14B-InP-MPS_reward_lora_comfy', path: 'Wan2.1-Fun-14B-InP-MPS_reward_lora_comfy.safetensors', subfolder: 'WAN/KJ_WAN' },
            { name: 'Wan21_T2V_14B_MoviiGen_lora_rank32_fp16', path: 'Wan21_T2V_14B_MoviiGen_lora_rank32_fp16.safetensors', subfolder: 'WAN/KJ_WAN' },
            { name: 'lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank32_bf16', path: 'lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank32_bf16.safetensors', subfolder: 'WAN/KJ_WAN' },
            { name: 'lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16', path: 'lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors', subfolder: 'WAN/KJ_WAN' },
            { name: 'wan_i2v_720_l1v3w4llp4p3r_e50_with_trigger', path: 'wan_i2v_720_l1v3w4llp4p3r_e50_with_trigger.safetensors', subfolder: 'WAN/KJ_WAN' }
        ];
    }
    
    async getDefaultLoRAList() {
        return [
            { name: 'Default LoRA 1', path: 'default_lora_1.safetensors', subfolder: 'default' },
            { name: 'Default LoRA 2', path: 'default_lora_2.safetensors', subfolder: 'default' }
        ];
    }
    
    buildLoRATree() {
        this.loraTree = {};
        
        // 선택된 모델 타입에 따라 필터링
        let filteredLoRAs = this.availableLoRAs;
        if (this.selectedModelType) {
            filteredLoRAs = this.availableLoRAs.filter(lora => {
                return lora.subfolder && lora.subfolder.toLowerCase().startsWith(this.selectedModelType.toLowerCase());
            });
        }
        
        filteredLoRAs.forEach(lora => {
            const folder = lora.subfolder || 'root';
            if (!this.loraTree[folder]) {
                this.loraTree[folder] = [];
            }
            this.loraTree[folder].push(lora);
        });
        
        // 폴더별 정렬
        Object.keys(this.loraTree).forEach(folder => {
            this.loraTree[folder].sort((a, b) => a.name.localeCompare(b.name));
        });
    }
    
    setupModelSelectionListener() {
        // 모델 선택 이벤트 리스너 등록
        document.addEventListener('model:selected', this.handleModelSelection);
    }
    
    handleModelSelection(e) {
        const modelInfo = e.detail;
        console.log('LoRA Selector: Model selection changed', modelInfo);
        
        // 선택된 모델의 첫 번째 폴더명을 추출하여 모델 타입 결정
        if (modelInfo && modelInfo.subfolder) {
            const subfolderParts = modelInfo.subfolder.split(/[\/\\]/).filter(p => p);
            this.selectedModelType = subfolderParts.length > 0 ? subfolderParts[0] : null;
            
            console.log('LoRA Selector: Model type set to', this.selectedModelType);
            
            // LoRA 트리 재구성 및 렌더링
            this.buildLoRATree();
            this.filterAndRenderLoRAs();
            
            // 패널 제목에 모델 타입 표시
            this.updatePanelTitle();
        }
    }
    
    updatePanelTitle() {
        // 플로팅 패널 제목 업데이트
        const panelElement = this.containerElement?.closest('.floating-panel');
        if (panelElement) {
            const titleElement = panelElement.querySelector('.floating-panel-title');
            if (titleElement) {
                const baseTitle = '🎨 LoRA Selector';
                const newTitle = this.selectedModelType 
                    ? `${baseTitle} (${this.selectedModelType})`
                    : baseTitle;
                titleElement.textContent = newTitle;
            }
        }
    }
    
    filterAndRenderLoRAs() {
        const container = this.containerElement?.querySelector('#lora-list-container');
        if (!container) return;
        
        // 로딩 중이면 로딩 표시
        if (this.loadingState.loras) {
            return;
        }
        
        container.innerHTML = '';
        
        // 에러 상태 표시
        if (this.loadingState.error) {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                padding: 20px;
                text-align: center;
                color: #e74c3c;
                font-size: 14px;
            `;
            errorDiv.innerHTML = `
                <div style="margin-bottom: 8px;">⚠️</div>
                <div>Error loading LoRAs: ${this.loadingState.error}</div>
                <div style="margin-top: 8px; font-size: 12px; color: #666;">Using default list</div>
            `;
            container.appendChild(errorDiv);
        }
        
        const folders = Object.keys(this.loraTree).sort();
        
        folders.forEach(folderName => {
            const loras = this.loraTree[folderName];
            let filteredLoRAs = loras;
            
            // 검색 필터 적용
            if (this.searchTerm) {
                filteredLoRAs = loras.filter(lora => 
                    lora.name.toLowerCase().includes(this.searchTerm.toLowerCase())
                );
            }
            
            // 선택된 것만 보기 필터
            if (this.showSelectedOnly) {
                filteredLoRAs = filteredLoRAs.filter(lora =>
                    this.selectedLoRAs.some(selected => selected.path === lora.path)
                );
            }
            
            // 필터링 결과가 있을 때만 폴더 표시
            if (filteredLoRAs.length > 0) {
                // 폴더 헤더
                const folderDiv = document.createElement('div');
                folderDiv.className = 'lora-folder';
                folderDiv.textContent = `📁 ${folderName} (${filteredLoRAs.length})`;
                container.appendChild(folderDiv);
                
                // LoRA 아이템들
                filteredLoRAs.forEach(lora => {
                    const loraItem = this.createLoRAItem(lora);
                    container.appendChild(loraItem);
                });
            }
        });
        
        // 검색 결과 없음
        if (container.children.length === 0) {
            const noResultDiv = document.createElement('div');
            noResultDiv.style.cssText = `
                padding: 40px 20px;
                text-align: center;
                color: #666;
                font-size: 14px;
            `;
            noResultDiv.innerHTML = `
                <div style="margin-bottom: 8px;">🔍</div>
                <div>No LoRAs found</div>
                ${this.searchTerm ? '<div style="font-size: 12px; margin-top: 4px;">Try different search terms</div>' : ''}
            `;
            container.appendChild(noResultDiv);
        }
    }
    
    createLoRAItem(lora) {
        const item = document.createElement('div');
        item.className = 'lora-item';
        item.dataset.subfolder = lora.subfolder || '';
        
        // 미리보기 이미지 정보 추가
        if (lora.preview_image) {
            item.dataset.previewImage = lora.preview_image;
        }
        
        const isSelected = this.selectedLoRAs.some(selected => selected.path === lora.path);
        if (isSelected) {
            item.classList.add('selected');
        }
        
        // 체크박스
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'lora-checkbox';
        checkbox.checked = isSelected;
        
        // LoRA 정보
        const info = document.createElement('div');
        info.className = 'lora-info';
        info.innerHTML = `
            <div class="lora-name">${lora.name}</div>
            <div class="lora-path">${lora.path}</div>
        `;
        
        // 가중치 컨트롤 (선택된 경우만)
        const weightControl = document.createElement('div');
        weightControl.className = 'lora-weight';
        
        if (isSelected) {
            const selectedLora = this.selectedLoRAs.find(selected => selected.path === lora.path);
            const weight = selectedLora ? selectedLora.weight : 1.0;
            
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'weight-slider';
            slider.min = '0';
            slider.max = '2';
            slider.step = '0.1';
            slider.value = weight;
            
            const valueDisplay = document.createElement('span');
            valueDisplay.className = 'weight-value';
            valueDisplay.textContent = weight.toFixed(1);
            
            // 슬라이더 이벤트
            slider.addEventListener('input', (e) => {
                const newWeight = parseFloat(e.target.value);
                valueDisplay.textContent = newWeight.toFixed(1);
                this.updateLoRAWeight(lora.path, newWeight);
            });
            
            weightControl.appendChild(slider);
            weightControl.appendChild(valueDisplay);
        }
        
        // 체크박스 이벤트
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectLoRA(lora);
            } else {
                this.deselectLoRA(lora.path);
            }
            
            // UI 즉시 업데이트를 위해 다시 렌더링
            setTimeout(() => this.filterAndRenderLoRAs(), 0);
        });
        
        // 미리보기 툴팁은 setupTooltipEvents에서 처리됨
        
        item.appendChild(checkbox);
        item.appendChild(info);
        item.appendChild(weightControl);
        
        return item;
    }
    
    selectLoRA(lora) {
        // 이미 선택되어 있지 않은 경우에만 추가
        if (!this.selectedLoRAs.some(selected => selected.path === lora.path)) {
            this.selectedLoRAs.push({
                path: lora.path,
                name: lora.name,
                weight: 1.0,
                subfolder: lora.subfolder
            });
            
            this.updateSelectedCounter();
            this.notifyChange();
        }
    }
    
    deselectLoRA(loraPath) {
        this.selectedLoRAs = this.selectedLoRAs.filter(selected => selected.path !== loraPath);
        this.updateSelectedCounter();
        this.notifyChange();
    }
    
    updateLoRAWeight(loraPath, weight) {
        const selectedLora = this.selectedLoRAs.find(selected => selected.path === loraPath);
        if (selectedLora) {
            selectedLora.weight = weight;
            this.notifyChange();
        }
    }
    
    updateSelectedCounter() {
        const counter = this.containerElement?.querySelector('#selected-lora-counter');
        if (counter) {
            counter.textContent = `Selected: ${this.selectedLoRAs.length} LoRAs`;
        }
    }
    
    
    notifyChange() {
        // 커스텀 이벤트로 변경 알림
        document.dispatchEvent(new CustomEvent('loraSelector:changed', {
            detail: {
                selectedLoRAs: [...this.selectedLoRAs],
                totalSelected: this.selectedLoRAs.length
            }
        }));
        
        console.log('LoRA selection changed:', this.selectedLoRAs);
    }
    
    // 정리 메서드
    cleanupEventListeners() {
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];
    }
    
    destroy() {
        this.cleanupEventListeners();
        
        // 모델 선택 이벤트 리스너 제거
        document.removeEventListener('model:selected', this.handleModelSelection);
        
        // 툴팁 제거 (Tooltip 컴포넌트 사용)
        if (this.tooltip) {
            this.tooltip.hide();
        }
        
        console.log('LoRA Selector component destroyed');
    }
    
    /**
     * 상태 보존을 위한 refreshData 메서드
     * FloatingPanel 복원 시 호출되어 상태를 보존하면서 데이터 재로드
     */
    refreshData() {
        if (!this.containerElement) return;
        
        console.log('LoRA Selector: Refreshing data after DOM restore');
        
        // 현재 상태 백업
        const previousSearchTerm = this.searchTerm;
        const previousSelectedLoRAs = [...this.selectedLoRAs];
        const previousShowSelectedOnly = this.showSelectedOnly;
        const previousSelectedModelType = this.selectedModelType;
        
        console.log('Preserving LoRA Selector state:', {
            searchTerm: previousSearchTerm,
            selectedLoRAs: previousSelectedLoRAs.length,
            showSelectedOnly: previousShowSelectedOnly,
            selectedModelType: previousSelectedModelType
        });
        
        // DOM 재생성은 하지 않고 데이터만 재로드
        this.loadLoRAModels().then(() => {
            this.restoreLoRAState(
                previousSearchTerm, 
                previousSelectedLoRAs, 
                previousShowSelectedOnly, 
                previousSelectedModelType
            );
        }).catch(() => {
            // 에러가 발생해도 상태는 복원
            this.restoreLoRAState(
                previousSearchTerm, 
                previousSelectedLoRAs, 
                previousShowSelectedOnly, 
                previousSelectedModelType
            );
        });
    }
    
    /**
     * LoRA 선택기 상태 복원
     */
    restoreLoRAState(previousSearchTerm, previousSelectedLoRAs, previousShowSelectedOnly, previousSelectedModelType) {
        console.log('Restoring LoRA Selector state...');
        
        // 기본 상태 복원
        this.searchTerm = previousSearchTerm;
        this.selectedLoRAs = previousSelectedLoRAs;
        this.showSelectedOnly = previousShowSelectedOnly;
        this.selectedModelType = previousSelectedModelType;
        
        // UI 요소들 상태 복원
        this.restoreUIElements();
        
        // LoRA 트리 재구성 (모델 타입에 맞게)
        this.buildLoRATree();
        
        // 필터링 및 렌더링
        this.filterAndRenderLoRAs();
        
        // 카운터 업데이트
        this.updateSelectedCounter();
        
        console.log('LoRA Selector state restored successfully');
    }
    
    /**
     * UI 요소들의 상태 복원
     */
    restoreUIElements() {
        if (!this.containerElement) return;
        
        // 검색 입력 필드 복원
        const searchInput = this.containerElement.querySelector('#lora-search');
        if (searchInput) {
            searchInput.value = this.searchTerm;
        }
        
        // Selected 필터 버튼 상태 복원
        const showSelectedBtn = this.containerElement.querySelector('#show-selected-toggle');
        if (showSelectedBtn) {
            showSelectedBtn.classList.toggle('active', this.showSelectedOnly);
            if (this.showSelectedOnly) {
                showSelectedBtn.style.background = '#9b59b6';
                showSelectedBtn.style.color = 'white';
                showSelectedBtn.style.borderColor = '#9b59b6';
            } else {
                showSelectedBtn.style.background = 'white';
                showSelectedBtn.style.color = '#9b59b6';
                showSelectedBtn.style.borderColor = '#9b59b6';
            }
        }
        
        // 패널 제목 복원
        this.updatePanelTitle();
        
        console.log('UI elements restored:', {
            searchTerm: this.searchTerm,
            showSelectedOnly: this.showSelectedOnly,
            selectedModelType: this.selectedModelType
        });
    }
    
    /**
     * 개선된 LoRA 데이터 로드 메서드 (상태 보존용)
     */
    async loadAvailableLoRAs() {
        // 기존 loadLoRAModels와 동일하지만 상태 보존에 최적화
        this.loadingState.loras = true;
        
        try {
            const loraModels = await this.scanLocalLoRAModels();
            this.availableLoRAs = loraModels;
            this.loadingState.loras = false;
            this.loadingState.error = null;
            
            console.log('LoRA models reloaded:', this.availableLoRAs.length);
            return Promise.resolve();
            
        } catch (error) {
            console.error('LoRA models loading failed:', error);
            this.loadingState.loras = false;
            this.loadingState.error = error.message;
            
            // 기본 목록으로 폴백
            this.availableLoRAs = await this.getDefaultLoRAList();
            return Promise.resolve();
        }
    }

    // API 메서드들
    getSelectedLoRAs() {
        return [...this.selectedLoRAs];
    }
    
    setSelectedLoRAs(loras) {
        this.selectedLoRAs = loras.map(lora => ({ ...lora }));
        this.updateSelectedCounter();
        this.filterAndRenderLoRAs();
        this.notifyChange();
    }
    
    clearSelection() {
        this.selectedLoRAs = [];
        this.updateSelectedCounter();
        this.filterAndRenderLoRAs();
        this.notifyChange();
    }
}