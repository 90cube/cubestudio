// components/controlnet/controlNetPanel.js
// ControlNet Panel Component - Multi-ControlNet support with tab UI

import stateManager from '../../core/stateManager.js';
import { getStage, getLayer } from '../canvas/canvas.js';

export class ControlNetPanel {
    constructor() {
        this.containerElement = null;
        this.isInitialized = false;

        // ControlNet configurations - 3 tabs
        this.controlnets = {
            1: {
                name: 'Depth',
                preprocessorType: 'depth',
                enabled: false,
                sourceImage: {
                    id: null,
                    node: null,
                    name: '',
                    thumbnail: null,
                    processingParams: {}
                },
                selectedModel: null,
                weight: 1.0
            },
            2: {
                name: 'Canny',
                preprocessorType: 'canny',
                enabled: false,
                sourceImage: {
                    id: null,
                    node: null,
                    name: '',
                    thumbnail: null,
                    processingParams: {}
                },
                selectedModel: null,
                weight: 1.0
            },
            3: {
                name: 'OpenPose',
                preprocessorType: 'openpose',
                enabled: false,
                sourceImage: {
                    id: null,
                    node: null,
                    name: '',
                    thumbnail: null,
                    processingParams: {}
                },
                selectedModel: null,
                weight: 1.0
            }
        };

        this.currentTab = 1; // Active tab (1, 2, 3)
        this.availableModels = [];
        this.preprocessedImagesCache = new Map();
        this.isLoading = false;
        this.error = null;
    }

    /**
     * Initialize panel
     */
    async init() {
        if (this.isInitialized) {
            return;
        }

        this.isInitialized = true;

        await this.loadModels();
        this.setupEventListeners();
        this.setupCanvasSynchronization();
        this.scanCanvasForPreprocessedImages();
        this.updateTabContent();
    }

    /**
     * Load ControlNet models from backend
     */
    async loadModels() {
        this.isLoading = true;
        this.error = null;

        try {
            const response = await fetch('http://127.0.0.1:8080/api/controlnet/models');

            if (!response.ok) {
                throw new Error(`Failed to load models: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                this.availableModels = data.models;
            } else {
                throw new Error('Failed to load models');
            }
        } catch (error) {
            console.error('Error loading ControlNet models:', error);
            this.error = error.message;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Setup canvas event synchronization
     */
    setupCanvasSynchronization() {
        document.addEventListener('canvasImageTypeChanged', (e) => {
            this.handleImageTypeChanged(e.detail);
        });

        document.addEventListener('layerNameChanged', (e) => {
            this.handleLayerNameChanged(e.detail);
        });

        document.addEventListener('layerUpdated', (e) => {
            this.handleLayerUpdated(e.detail);
        });

        document.addEventListener('imageDeleted', (e) => {
            this.handleImageDeleted(e.detail);
        });
    }

    /**
     * Scan canvas for existing preprocessed images
     */
    scanCanvasForPreprocessedImages() {
        console.log('[ControlNet] Scanning canvas for all images...');
        const stage = getStage();
        const layer = getLayer();

        if (!stage || !layer) {
            console.warn('[ControlNet] Stage or layer not found during scan');
            return;
        }

        const images = layer.find('Image');
        console.log(`[ControlNet] Found ${images.length} total images on canvas`);

        // 모든 이미지를 캐시 (preproc 타입이 아니어도 사용 가능)
        images.forEach(imageNode => {
            const imageType = imageNode.getAttr('imageType') || 'normal';
            const imageId = imageNode.id();
            console.log(`[ControlNet] Caching image ${imageId}: type="${imageType}"`);
            this.cachePreprocessedImage(imageNode);
        });

        console.log(`[ControlNet] Scan complete: ${images.length} images cached`);
    }

    /**
     * Cache image data (모든 타입의 이미지 캐시 가능)
     */
    cachePreprocessedImage(imageNode) {
        let id = imageNode.id();

        // 🔧 FIX: ID가 없으면 자동 생성
        if (!id) {
            id = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            imageNode.id(id);
            console.warn(`[ControlNet] Image had no ID, generated: ${id}`);
        }

        const imageType = imageNode.getAttr('imageType') || 'normal';
        const processingParams = imageNode.getAttr('processingParams') || {};
        const processingSource = imageNode.getAttr('processingSource') || 'user';
        const preprocessorType = this.detectPreprocessorType(imageNode);

        console.log(`[ControlNet] Caching image ${id}:`, {
            imageType,
            preprocessorType,
            processingParams,
            processingSource
        });

        const imageData = {
            id: id,
            node: imageNode,
            name: this.getImageName(imageNode),
            type: imageType,
            preprocessor: preprocessorType,
            processingParams: processingParams,
            processingSource: processingSource,
            thumbnail: null // 🔧 FIX: 썸네일은 나중에 업데이트
        };

        // 🔧 FIX: 썸네일 없이 먼저 캐시에 추가 (즉시 사용 가능하도록)
        this.preprocessedImagesCache.set(id, imageData);
        console.log(`[ControlNet] Image ${id} cached immediately (type: ${imageType}, preprocessor: ${preprocessorType})`);

        // 썸네일 생성 후 업데이트 (비동기)
        this.generateThumbnail(imageNode).then(thumbnail => {
            imageData.thumbnail = thumbnail;
            this.preprocessedImagesCache.set(id, imageData); // 썸네일 업데이트
            console.log(`[ControlNet] Thumbnail generated for ${id}`);
            this.updateTabContent();
        }).catch(err => {
            console.warn(`[ControlNet] Thumbnail generation failed for ${id}:`, err);
        });
    }

    /**
     * Get image display name
     */
    getImageName(imageNode) {
        return imageNode.getAttr('layerName') ||
               `Image ${imageNode.id().slice(-4)}`;
    }

    /**
     * Detect preprocessor type from processing parameters
     */
    detectPreprocessorType(imageNode) {
        const params = imageNode.getAttr('processingParams') || {};
        const source = imageNode.getAttr('processingSource') || '';

        // Check params.processor first
        if (params.processor) {
            return this.normalizePreprocessorType(params.processor);
        }

        // Check params.type (e.g., 'pose_detection', 'depth_estimation', 'edge_detection')
        if (params.type) {
            if (params.type.includes('pose')) {
                return 'openpose';
            }
            if (params.type.includes('depth')) {
                return 'depth';
            }
            if (params.type.includes('edge') || params.type.includes('canny')) {
                return 'canny';
            }
        }

        // Fallback to source checking
        if (source.includes('openpose') || source.includes('pose')) {
            return 'openpose';
        }
        if (source.includes('depth')) {
            return 'depth';
        }
        if (source.includes('canny')) {
            return 'canny';
        }

        return 'unknown';
    }

    /**
     * Normalize preprocessor type name
     */
    normalizePreprocessorType(type) {
        const normalized = type.toLowerCase();

        if (normalized.includes('openpose') || normalized.includes('pose')) {
            return 'openpose';
        }
        if (normalized.includes('depth')) {
            return 'depth';
        }
        if (normalized.includes('canny')) {
            return 'canny';
        }

        return normalized;
    }

    /**
     * Generate thumbnail from image node
     */
    async generateThumbnail(imageNode) {
        return new Promise((resolve) => {
            try {
                const image = imageNode.image();
                if (!image) {
                    console.warn('[ControlNet] No image found in imageNode');
                    resolve(null);
                    return;
                }

                // 🔧 FIX: 이미지가 완전히 로드될 때까지 대기
                const generateWhenReady = () => {
                    try {
                        // naturalWidth 체크로 이미지 로드 확인
                        if (!image.complete || !image.naturalWidth) {
                            console.log('[ControlNet] Image not ready, waiting...');
                            setTimeout(generateWhenReady, 50);
                            return;
                        }

                        const canvas = document.createElement('canvas');
                        const size = 64;
                        canvas.width = size;
                        canvas.height = size;

                        const ctx = canvas.getContext('2d');

                        const aspectRatio = image.naturalWidth / image.naturalHeight;
                        let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

                        if (aspectRatio > 1) {
                            drawHeight = size;
                            drawWidth = size * aspectRatio;
                            offsetX = -(drawWidth - size) / 2;
                        } else {
                            drawWidth = size;
                            drawHeight = size / aspectRatio;
                            offsetY = -(drawHeight - size) / 2;
                        }

                        ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

                        const dataURL = canvas.toDataURL('image/png');
                        console.log('[ControlNet] Thumbnail generated successfully');
                        resolve(dataURL);
                    } catch (err) {
                        console.error('[ControlNet] Thumbnail generation error:', err);
                        resolve(null);
                    }
                };

                generateWhenReady();
            } catch (error) {
                console.error('[ControlNet] Failed to generate thumbnail:', error);
                resolve(null);
            }
        });
    }

    /**
     * Handle canvas events
     */
    handleImageTypeChanged(detail) {
        const { imageNode, oldType, newType } = detail;
        const id = imageNode.id();

        if (newType === 'preproc') {
            this.cachePreprocessedImage(imageNode);
        } else {
            this.preprocessedImagesCache.delete(id);

            Object.keys(this.controlnets).forEach(key => {
                if (this.controlnets[key].sourceImage.id === id) {
                    this.clearSourceImage(key);
                }
            });
        }

        this.updateTabContent();
    }

    handleLayerNameChanged(detail) {
        const { imageId, newName } = detail;

        if (this.preprocessedImagesCache.has(imageId)) {
            const imageData = this.preprocessedImagesCache.get(imageId);
            imageData.name = newName;
        }

        Object.keys(this.controlnets).forEach(key => {
            if (this.controlnets[key].sourceImage.id === imageId) {
                this.controlnets[key].sourceImage.name = newName;
            }
        });

        this.updateTabContent();
    }

    handleLayerUpdated(detail) {
        this.scanCanvasForPreprocessedImages();
    }

    handleImageDeleted(detail) {
        const { imageId } = detail;

        this.preprocessedImagesCache.delete(imageId);

        Object.keys(this.controlnets).forEach(key => {
            if (this.controlnets[key].sourceImage.id === imageId) {
                this.clearSourceImage(key);
            }
        });

        this.updateTabContent();
    }

    /**
     * Select source image for a ControlNet
     */
    selectSourceImage(cnIndex, imageData) {
        const cn = this.controlnets[cnIndex];

        console.log(`[ControlNet] Selecting source image for ${cn.name}:`, imageData);

        cn.sourceImage = {
            id: imageData.id,
            node: imageData.node,
            name: imageData.name,
            thumbnail: imageData.thumbnail,
            processingParams: imageData.processingParams
        };

        console.log(`[ControlNet] Source image set:`, cn.sourceImage);

        this.autoMatchModel(cnIndex);
        this.updateTabContent();

        console.log(`[ControlNet] Tab content updated for ${cn.name}`);

        document.dispatchEvent(new CustomEvent('controlnet-source-selected', {
            detail: {
                index: cnIndex,
                type: cn.preprocessorType,
                imageData: cn.sourceImage
            }
        }));
    }

    /**
     * Auto-match ControlNet model
     */
    autoMatchModel(cnIndex) {
        const cn = this.controlnets[cnIndex];
        const preprocessorType = cn.preprocessorType;

        const matchingModels = this.availableModels.filter(model =>
            model.preprocessor === preprocessorType
        );

        if (matchingModels.length > 0) {
            const sdxlModel = matchingModels.find(m => m.type === 'SDXL');
            cn.selectedModel = sdxlModel || matchingModels[0];
        }
    }

    /**
     * Clear source image
     */
    clearSourceImage(cnIndex) {
        const cn = this.controlnets[cnIndex];

        cn.sourceImage = {
            id: null,
            node: null,
            name: '',
            thumbnail: null,
            processingParams: {}
        };
        cn.selectedModel = null;
        cn.enabled = false;

        this.updateTabContent();
    }

    /**
     * Get ControlNet configuration
     */
    getControlNetConfig(cnIndex) {
        const cn = this.controlnets[cnIndex];

        return {
            enabled: cn.enabled,
            index: cnIndex,
            type: cn.preprocessorType,
            preprocessorType: cn.preprocessorType,
            sourceImage: cn.sourceImage,  // 🔧 FIX: 전체 sourceImage 객체 전달 (node 포함)
            model: cn.selectedModel ? {
                name: cn.selectedModel.name,
                type: cn.selectedModel.type,
                preprocessor: cn.selectedModel.preprocessor,
                path: cn.selectedModel.path  // 🔧 FIX: model path 추가
            } : null,
            weight: cn.weight
        };
    }

    /**
     * Get all enabled ControlNet configurations
     */
    getAllEnabledConfigs() {
        const configs = [];

        Object.keys(this.controlnets).forEach(key => {
            const cn = this.controlnets[key];
            if (cn.enabled) {
                configs.push(this.getControlNetConfig(key));
            }
        });

        return configs;
    }

    /**
     * Switch tab
     */
    switchTab(tabIndex) {
        this.currentTab = tabIndex;
        this.updateTabButtons();
        this.updateTabContent();
    }

    /**
     * Update tab buttons
     */
    updateTabButtons() {
        const tabButtons = this.containerElement.querySelectorAll('.controlnet-tab-btn');
        tabButtons.forEach(btn => {
            const tabIndex = parseInt(btn.dataset.tab);
            const isActive = tabIndex === this.currentTab;

            btn.style.background = isActive ? 'rgba(108, 182, 255, 0.15)' : 'transparent';
            btn.style.color = isActive ? '#1a73e8' : '#5f6368';
            btn.style.fontWeight = isActive ? '600' : '400';

            if (isActive) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    /**
     * Generate tab content HTML
     */
    generateTabContentHtml(tabIndex) {
        const cn = this.controlnets[tabIndex];

        // Filter models for this preprocessor type
        const filteredModels = this.availableModels.filter(model =>
            model.preprocessor === cn.preprocessorType
        );

        return `
            <div class="controlnet-tab-pane" data-tab="${tabIndex}">
                <!-- 활성화 토글 -->
                <div class="controlnet-activation-section">
                    <label class="controlnet-toggle-label">
                        <input type="checkbox"
                               id="controlnet-${tabIndex}-active"
                               class="controlnet-active-toggle"
                               ${cn.enabled ? 'checked' : ''}>
                        <span class="toggle-text">ControlNet ${tabIndex} (${cn.name}) 활성</span>
                    </label>
                </div>

                <!-- 파라미터 필드셋 -->
                <fieldset id="controlnet-${tabIndex}-fieldset" ${cn.enabled ? '' : 'disabled'}>

                    <!-- Source Image -->
                    <div class="param-group">
                        <h4 class="group-title">Source Image</h4>

                        <div class="param-row">
                            <div id="cn-source-display-${tabIndex}" class="source-image-display">
                                ${cn.sourceImage.id && cn.sourceImage.id.trim() !== '' ? `
                                    <div class="source-image-card">
                                        ${cn.sourceImage.thumbnail ? `<img src="${cn.sourceImage.thumbnail}" class="source-thumbnail">` : ''}
                                        <div class="source-info">
                                            <div class="source-name">${cn.sourceImage.name || 'Unknown'}</div>
                                            <div class="source-type">${cn.name}</div>
                                        </div>
                                        <button class="btn-clear" data-action="clear-source" data-index="${tabIndex}">×</button>
                                    </div>
                                ` : `
                                    <div class="source-placeholder">
                                        No ${cn.name} image selected
                                    </div>
                                `}
                            </div>
                        </div>

                        <div class="param-row">
                            <button class="btn-primary" data-action="select-source" data-index="${tabIndex}">
                                Select ${cn.name} Image
                            </button>
                        </div>
                    </div>

                    <!-- Model Selection -->
                    <div class="param-group">
                        <h4 class="group-title">ControlNet Model</h4>

                        <div class="param-row">
                            <select id="controlnet-${tabIndex}-model" data-index="${tabIndex}">
                                <option value="">Select ${cn.name} Model</option>
                                ${filteredModels.map(model => `
                                    <option value="${model.name}" ${cn.selectedModel && cn.selectedModel.name === model.name ? 'selected' : ''}>
                                        [${model.type}] ${model.name}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>

                    <!-- Weight Control -->
                    <div class="param-group">
                        <h4 class="group-title">Weight (가중치)</h4>

                        <div class="param-row slider-row">
                            <label for="controlnet-${tabIndex}-weight">
                                ControlNet Weight
                                <span class="param-hint">(0.0~2.0, 기본 1.0)</span>
                            </label>
                            <div class="slider-container">
                                <input type="range"
                                       id="controlnet-${tabIndex}-weight"
                                       data-index="${tabIndex}"
                                       min="0" max="2" step="0.05"
                                       value="${cn.weight}">
                                <span class="slider-value" id="controlnet-${tabIndex}-weight-value">${cn.weight.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                </fieldset>
            </div>
        `;
    }

    /**
     * Update tab content
     */
    updateTabContent() {
        console.log('[ControlNet] updateTabContent called, currentTab:', this.currentTab);

        const activeTabContent = this.containerElement?.querySelector('#active-tab-content');
        if (!activeTabContent) {
            console.warn('[ControlNet] Active tab content container not found');
            return;
        }

        const cn = this.controlnets[this.currentTab];
        console.log(`[ControlNet] Current tab data:`, {
            name: cn.name,
            enabled: cn.enabled,
            sourceImage: cn.sourceImage,
            selectedModel: cn.selectedModel
        });

        activeTabContent.innerHTML = this.generateTabContentHtml(this.currentTab);

        // Re-attach event listeners for the new content
        this.attachTabContentListeners();

        console.log('[ControlNet] Tab content HTML regenerated and listeners attached');
    }

    /**
     * Attach event listeners to tab content
     */
    attachTabContentListeners() {
        const tabIndex = this.currentTab;
        const cn = this.controlnets[tabIndex];

        // Active toggle
        const activeToggle = this.containerElement.querySelector(`#controlnet-${tabIndex}-active`);
        if (activeToggle) {
            activeToggle.addEventListener('change', (e) => {
                cn.enabled = e.target.checked;

                // Update fieldset disabled state
                const fieldset = this.containerElement.querySelector(`#controlnet-${tabIndex}-fieldset`);
                if (fieldset) {
                    fieldset.disabled = !cn.enabled;
                }

                document.dispatchEvent(new CustomEvent('controlnet-state-changed', {
                    detail: {
                        index: tabIndex,
                        type: cn.preprocessorType,
                        enabled: cn.enabled,
                        config: this.getControlNetConfig(tabIndex)
                    }
                }));
            });
        }

        // Select source button
        const selectBtn = this.containerElement.querySelector('[data-action="select-source"]');
        if (selectBtn) {
            selectBtn.addEventListener('click', () => {
                this.showSourceImagePicker(tabIndex);
            });
        }

        // Clear source button
        const clearBtn = this.containerElement.querySelector('[data-action="clear-source"]');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearSourceImage(tabIndex);
            });
        }

        // Model select
        const modelSelect = this.containerElement.querySelector(`#controlnet-${tabIndex}-model`);
        if (modelSelect) {
            modelSelect.addEventListener('change', (e) => {
                const modelName = e.target.value;
                cn.selectedModel = this.availableModels.find(m => m.name === modelName);
            });
        }

        // Weight slider
        const weightSlider = this.containerElement.querySelector(`#controlnet-${tabIndex}-weight`);
        const weightValue = this.containerElement.querySelector(`#controlnet-${tabIndex}-weight-value`);

        if (weightSlider && weightValue) {
            weightSlider.addEventListener('input', (e) => {
                cn.weight = parseFloat(e.target.value);
                weightValue.textContent = cn.weight.toFixed(2);
            });
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (!this.containerElement) return;

        // Tab buttons
        const tabButtons = this.containerElement.querySelectorAll('.controlnet-tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabIndex = parseInt(btn.dataset.tab);
                this.switchTab(tabIndex);
            });
        });

        // Refresh button
        const refreshBtn = this.containerElement.querySelector('#cn-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadModels().then(() => {
                    this.updateTabContent();
                });
                this.scanCanvasForPreprocessedImages();
            });
        }
    }

    /**
     * Show source image picker modal
     */
    showSourceImagePicker(cnIndex) {
        const cn = this.controlnets[cnIndex];

        console.log(`[ControlNet] Opening image picker for ${cn.name}`);

        // 🔧 FIX: 이미지 선택 모달을 열 때마다 캔버스를 다시 스캔하여 최신 이미지 목록 확보
        this.scanCanvasForPreprocessedImages();

        console.log(`[ControlNet] Cache size: ${this.preprocessedImagesCache.size}`);

        // 모든 이미지를 그대로 표시 (매칭 판단 없음)
        const availableImages = Array.from(this.preprocessedImagesCache.values());

        console.log(`[ControlNet] Total available: ${availableImages.length} images`);

        if (availableImages.length === 0) {
            console.warn(`[ControlNet] No images found on canvas`);
            alert('캔버스에 이미지가 없습니다. 먼저 이미지를 캔버스에 추가하거나 전처리를 수행하세요.');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'cn-source-picker-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        `;

        const title = document.createElement('h3');
        title.style.cssText = `
            margin: 0 0 20px 0;
            color: #202124;
            font-size: 16px;
            font-weight: 600;
        `;
        title.textContent = `Select ${cn.name} Image`;

        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        `;

        availableImages.forEach(imageData => {
            const item = document.createElement('div');
            item.style.cssText = `
                cursor: pointer;
                border-radius: 8px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                transition: all 0.2s;
                padding: 20px 16px;
                border: 2px solid transparent;
                min-height: 80px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
            `;

            item.addEventListener('mouseenter', () => {
                item.style.background = 'linear-gradient(135deg, #5568d3 0%, #663a8a 100%)';
                item.style.borderColor = '#fff';
                item.style.transform = 'scale(1.05)';
                item.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            });

            item.addEventListener('mouseleave', () => {
                item.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                item.style.borderColor = 'transparent';
                item.style.transform = 'scale(1)';
                item.style.boxShadow = 'none';
            });

            item.addEventListener('click', () => {
                this.selectSourceImage(cnIndex, imageData);
                document.body.removeChild(modal);
            });

            // 이미지 아이콘
            const icon = document.createElement('div');
            icon.style.cssText = `
                font-size: 32px;
                margin-bottom: 8px;
            `;
            icon.textContent = '🖼️';
            item.appendChild(icon);

            // 이미지 이름 (크게 표시)
            const name = document.createElement('div');
            name.style.cssText = `
                color: white;
                font-size: 13px;
                font-weight: 600;
                word-break: break-word;
                line-height: 1.3;
            `;
            name.textContent = imageData.name;
            item.appendChild(name);

            // 이미지 타입 표시 (작게)
            const typeLabel = document.createElement('div');
            typeLabel.style.cssText = `
                color: rgba(255,255,255,0.8);
                font-size: 10px;
                margin-top: 4px;
            `;
            typeLabel.textContent = imageData.preprocessor !== 'unknown'
                ? imageData.preprocessor.toUpperCase()
                : imageData.type.toUpperCase();
            item.appendChild(typeLabel);

            grid.appendChild(item);
        });

        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = `
            width: 100%;
            padding: 10px;
            background: #f44336;
            border: none;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        `;
        closeBtn.textContent = 'Cancel';
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        content.appendChild(title);
        content.appendChild(grid);
        content.appendChild(closeBtn);
        modal.appendChild(content);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        document.body.appendChild(modal);
    }

    /**
     * Create tab button
     */
    createTabButton(index, active = false) {
        const cn = this.controlnets[index];
        const button = document.createElement('button');
        button.className = `controlnet-tab-btn ${active ? 'active' : ''}`;
        button.dataset.tab = index;
        button.textContent = `${cn.name}`;
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

    /**
     * Add styles
     */
    addStyles() {
        if (document.getElementById('controlnet-panel-styles')) return;

        const style = document.createElement('style');
        style.id = 'controlnet-panel-styles';
        style.textContent = `
            .controlnet-panel {
                height: 100%;
                display: flex;
                flex-direction: column;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: white;
            }

            .tab-nav {
                display: flex;
                border-bottom: 1px solid rgba(134, 142, 150, 0.2);
                margin-bottom: 10px;
                background: rgba(245, 246, 247, 0.8);
                border-radius: 6px 6px 0 0;
                padding: 3px;
                gap: 1px;
            }

            .tab-content {
                flex: 1;
                overflow-y: auto;
                min-height: 0;
                padding: 6px 0;
            }

            .controlnet-activation-section {
                padding: 12px;
                background: rgba(245, 248, 250, 0.5);
                border-bottom: 1px solid rgba(134, 142, 150, 0.2);
                margin-bottom: 12px;
            }

            .controlnet-toggle-label {
                display: flex;
                align-items: center;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                color: #202124;
            }

            .controlnet-active-toggle {
                margin-right: 8px;
                width: 16px;
                height: 16px;
                cursor: pointer;
            }

            .param-group {
                margin-bottom: 16px;
                padding: 0 12px;
            }

            .group-title {
                font-size: 11px;
                font-weight: 600;
                color: #1976d2;
                margin: 0 0 8px 0;
                padding-bottom: 4px;
                border-bottom: 2px solid rgba(21, 101, 192, 0.2);
            }

            .param-row {
                margin-bottom: 6px;
                display: flex;
                flex-direction: column;
                gap: 3px;
            }

            .param-row label {
                font-size: 11px;
                font-weight: 500;
                color: #424242;
                margin-bottom: 2px;
                line-height: 1.2;
            }

            .param-hint {
                color: #757575;
                font-weight: 400;
                font-size: 10px;
            }

            .param-row select {
                padding: 5px 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 11px;
                transition: border-color 0.2s ease;
                background: white;
                width: 100%;
                box-sizing: border-box;
            }

            .param-row select:focus {
                outline: none;
                border-color: #1976d2;
                box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.1);
            }

            .slider-row {
                flex-direction: column !important;
                align-items: stretch;
                gap: 4px;
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

            .source-image-display {
                margin-bottom: 6px;
            }

            .source-image-card {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                background: #f5f5f5;
                border: 1px solid #ddd;
                border-radius: 4px;
            }

            .source-thumbnail {
                width: 40px;
                height: 40px;
                border-radius: 4px;
                object-fit: cover;
            }

            .source-info {
                flex: 1;
                min-width: 0;
            }

            .source-name {
                color: #202124;
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .source-type {
                color: #5f6368;
                font-size: 10px;
                margin-top: 2px;
            }

            .source-placeholder {
                text-align: center;
                color: #757575;
                font-size: 11px;
                padding: 20px;
                background: #f9f9f9;
                border: 1px dashed #ddd;
                border-radius: 4px;
            }

            .btn-clear {
                padding: 4px 8px;
                background: #f44336;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                line-height: 1;
            }

            .btn-clear:hover {
                background: #d32f2f;
            }

            .btn-primary {
                padding: 8px 12px;
                background: #1976d2;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 500;
                transition: background 0.2s;
                width: 100%;
            }

            .btn-primary:hover {
                background: #1565c0;
            }

            fieldset {
                border: none;
                padding: 0;
                margin: 0;
            }

            fieldset:disabled {
                opacity: 0.5;
                pointer-events: none;
            }

            .cn-footer {
                padding: 8px 12px;
                background: rgba(245, 246, 247, 0.8);
                border-top: 1px solid rgba(134, 142, 150, 0.2);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .cn-status {
                font-size: 11px;
                color: #5f6368;
                font-weight: 500;
            }

            .btn-refresh {
                padding: 4px 8px;
                background: #1976d2;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 500;
            }

            .btn-refresh:hover {
                background: #1565c0;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Render panel
     */
    render() {
        const container = document.createElement('div');
        container.className = 'controlnet-panel';

        // Tab navigation
        const tabNav = document.createElement('div');
        tabNav.className = 'tab-nav';

        for (let i = 1; i <= 3; i++) {
            const tabBtn = this.createTabButton(i, i === 1);
            tabNav.appendChild(tabBtn);
        }

        // Tab content
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';

        const activeTabContent = document.createElement('div');
        activeTabContent.id = 'active-tab-content';
        activeTabContent.innerHTML = this.generateTabContentHtml(1);

        tabContent.appendChild(activeTabContent);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'cn-footer';
        footer.innerHTML = `
            <div id="cn-status" class="cn-status">Ready</div>
            <button id="cn-refresh-btn" class="btn-refresh">↻ Refresh</button>
        `;

        // Assemble container
        container.appendChild(tabNav);
        container.appendChild(tabContent);
        container.appendChild(footer);

        // Add styles
        this.addStyles();

        this.containerElement = container;
        return container;
    }
}

// Export singleton instance
let panelInstance = null;

export function getControlNetPanel() {
    if (!panelInstance) {
        panelInstance = new ControlNetPanel();
    }
    return panelInstance;
}
