// components/ui/imageSettingsUI.js

import imageSettings from '../../core/imageSettings.js';

/**
 * 이미지 저장 설정 UI 컴포넌트
 * 다양한 이미지 타입별 저장 설정을 관리합니다.
 */

let imageSettingsModal = null;

/**
 * 이미지 설정 모달 열기
 */
export function openImageSettings() {
    if (imageSettingsModal) {
        imageSettingsModal.focus();
        return;
    }
    
    imageSettingsModal = createImageSettingsModal();
    document.body.appendChild(imageSettingsModal.element);
}

/**
 * 이미지 설정 모달 생성
 */
function createImageSettingsModal() {
    // 모달 백드롭
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // 모달 컨테이너
    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #2a2a2a;
        border-radius: 12px;
        width: 800px;
        max-width: 95vw;
        max-height: 90vh;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
        border: 1px solid #444;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    `;
    
    // 헤더
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        background: #9b59b6;
        color: white;
        font-weight: 600;
    `;
    
    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0; font-size: 16px;';
    title.textContent = '🖼️ 이미지 저장 설정';
    
    const closeButton = document.createElement('button');
    closeButton.style.cssText = `
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    closeButton.innerHTML = '×';
    
    // 탭 네비게이션
    const tabNav = document.createElement('div');
    tabNav.style.cssText = `
        display: flex;
        background: #333;
        border-bottom: 1px solid #444;
    `;
    
    const tabs = [
        { id: 'paths', label: '📁 저장 경로', icon: '📁' },
        { id: 'filenames', label: '📝 파일명 패턴', icon: '📝' },
        { id: 'quality', label: '⚙️ 품질 설정', icon: '⚙️' },
        { id: 'advanced', label: '🔧 고급 설정', icon: '🔧' }
    ];
    
    let activeTab = 'paths';
    
    // 바디
    const body = document.createElement('div');
    body.style.cssText = `
        flex: 1;
        overflow-y: auto;
        background: #1a1a1a;
        color: #e8eaed;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // 탭 버튼들 생성
    tabs.forEach(tab => {
        const tabButton = document.createElement('button');
        tabButton.className = `image-settings-tab ${tab.id === activeTab ? 'active' : ''}`;
        tabButton.dataset.tab = tab.id;
        tabButton.innerHTML = `${tab.icon} ${tab.label}`;
        tabButton.style.cssText = `
            flex: 1;
            padding: 12px 8px;
            background: ${tab.id === activeTab ? '#9b59b6' : 'transparent'};
            color: ${tab.id === activeTab ? '#ffffff' : '#ccc'};
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        `;
        
        tabButton.addEventListener('click', () => {
            switchImageSettingsTab(tab.id, tabNav, body);
        });
        
        tabNav.appendChild(tabButton);
    });
    
    // 닫기 기능
    const closeModal = () => {
        document.body.removeChild(backdrop);
        imageSettingsModal = null;
    };
    
    // 이벤트 리스너
    closeButton.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeModal();
        }
    });
    
    // ESC 키로 닫기
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    // 모달 구성
    header.appendChild(title);
    header.appendChild(closeButton);
    modal.appendChild(header);
    modal.appendChild(tabNav);
    modal.appendChild(body);
    backdrop.appendChild(modal);
    
    // 초기 탭 컨텐츠 로드
    switchImageSettingsTab(activeTab, tabNav, body);
    
    return {
        element: backdrop,
        close: closeModal,
        focus: () => {
            backdrop.style.zIndex = '10001';
            setTimeout(() => {
                backdrop.style.zIndex = '10000';
            }, 100);
        }
    };
}

/**
 * 탭 전환
 */
function switchImageSettingsTab(tabId, tabNav, body) {
    // 탭 버튼 스타일 업데이트
    const tabButtons = tabNav.querySelectorAll('.image-settings-tab');
    tabButtons.forEach(button => {
        const isActive = button.dataset.tab === tabId;
        button.style.background = isActive ? '#9b59b6' : 'transparent';
        button.style.color = isActive ? '#ffffff' : '#ccc';
    });
    
    // 컨텐츠 업데이트
    body.innerHTML = '';
    
    switch(tabId) {
        case 'paths':
            body.appendChild(createPathsUI());
            break;
        case 'filenames':
            body.appendChild(createFilenamesUI());
            break;
        case 'quality':
            body.appendChild(createQualityUI());
            break;
        case 'advanced':
            body.appendChild(createAdvancedUI());
            break;
    }
}

/**
 * 저장 경로 설정 UI
 */
function createPathsUI() {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 20px;';
    
    const title = document.createElement('h4');
    title.style.cssText = 'margin: 0 0 16px 0; color: #9b59b6; font-size: 16px;';
    title.textContent = '📁 이미지 타입별 저장 경로';
    
    const description = document.createElement('div');
    description.style.cssText = `
        margin-bottom: 20px;
        padding: 12px;
        background: rgba(155, 89, 182, 0.1);
        border: 1px solid rgba(155, 89, 182, 0.3);
        border-radius: 6px;
        color: #ccc;
        font-size: 14px;
    `;
    description.textContent = '각 이미지 타입별로 저장될 경로를 설정하세요. 상대 경로 또는 절대 경로를 사용할 수 있습니다.';
    
    const pathTypes = [
        { key: 't2i', label: '🎨 Text-to-Image', desc: '기본 텍스트에서 이미지 생성' },
        { key: 'i2i', label: '🖼️ Image-to-Image', desc: '이미지에서 이미지 생성' },
        { key: 'detail', label: '✨ 디테일러', desc: '디테일러 후처리 결과' },
        { key: 'upscaled', label: '🔍 업스케일', desc: '업스케일된 이미지' },
        { key: 'preprocessor', label: '🎛️ 전처리', desc: 'ControlNet 전처리 이미지' },
        { key: 'controlnet', label: '🎮 ControlNet', desc: 'ControlNet 적용 결과' },
        { key: 'custom', label: '📂 커스텀', desc: '기타 커스텀 저장' }
    ];
    
    const pathFormsContainer = document.createElement('div');
    
    pathTypes.forEach(pathType => {
        const formGroup = createPathFormGroup(pathType);
        pathFormsContainer.appendChild(formGroup);
    });
    
    container.appendChild(title);
    container.appendChild(description);
    container.appendChild(pathFormsContainer);
    
    return container;
}

/**
 * 파일명 패턴 설정 UI
 */
function createFilenamesUI() {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 20px;';
    
    const title = document.createElement('h4');
    title.style.cssText = 'margin: 0 0 16px 0; color: #9b59b6; font-size: 16px;';
    title.textContent = '📝 파일명 패턴 설정';
    
    const description = document.createElement('div');
    description.style.cssText = `
        margin-bottom: 20px;
        padding: 12px;
        background: rgba(155, 89, 182, 0.1);
        border: 1px solid rgba(155, 89, 182, 0.3);
        border-radius: 6px;
        color: #ccc;
        font-size: 14px;
        line-height: 1.4;
    `;
    description.innerHTML = `
        <strong>📋 사용 가능한 변수:</strong><br>
        <code>%%YYYY</code> - 년(4자리) | <code>%%MM</code> - 월 | <code>%%DD</code> - 일 | <code>%%HH</code> - 시 | <code>%%mm</code> - 분 | <code>%%SS</code> - 초<br>
        <code>%%YYYYMMDD</code> - 날짜(20241215) | <code>%%HHMMSS</code> - 시간(143025)<br>
        <code>[model]</code> - 모델명 | <code>[seed]</code> - 시드값 | <code>[scale]</code> - 배율 | <code>[type]</code> - 타입
    `;
    
    const filenameTypes = [
        { key: 't2i', label: '🎨 Text-to-Image', example: 'model_seed_20241215_143025.png' },
        { key: 'i2i', label: '🖼️ Image-to-Image', example: 'i2i_seed_20241215_143025.png' },
        { key: 'detail', label: '✨ 디테일러', example: 'detail_20241215_143025.png' },
        { key: 'upscaled', label: '🔍 업스케일', example: 'upscaled_4x_20241215_143025.png' },
        { key: 'preprocessor', label: '🎛️ 전처리', example: 'canny_20241215_143025.png' },
        { key: 'controlnet', label: '🎮 ControlNet', example: 'cn_depth_20241215_143025.png' }
    ];
    
    const filenameFormsContainer = document.createElement('div');
    
    filenameTypes.forEach(filenameType => {
        const formGroup = createFilenameFormGroup(filenameType);
        filenameFormsContainer.appendChild(formGroup);
    });
    
    container.appendChild(title);
    container.appendChild(description);
    container.appendChild(filenameFormsContainer);
    
    return container;
}

/**
 * 품질 설정 UI
 */
function createQualityUI() {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 20px;';
    
    const title = document.createElement('h4');
    title.style.cssText = 'margin: 0 0 16px 0; color: #9b59b6; font-size: 16px;';
    title.textContent = '⚙️ 이미지 품질 설정';
    
    // 포맷 선택
    const formatGroup = document.createElement('div');
    formatGroup.style.cssText = 'margin-bottom: 20px;';
    formatGroup.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-weight: 500;">이미지 포맷</label>
        <select id="image-format" style="width: 200px; padding: 8px; background: #3a3a3a; border: 1px solid #555; border-radius: 5px; color: #fff;">
            <option value="png">PNG (무손실)</option>
            <option value="jpg">JPEG (압축)</option>
            <option value="webp">WebP (최신)</option>
        </select>
    `;
    
    // PNG 압축 설정
    const pngGroup = document.createElement('div');
    pngGroup.id = 'png-settings';
    pngGroup.style.cssText = 'margin-bottom: 20px;';
    pngGroup.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-weight: 500;">
            PNG 압축 레벨: <span id="png-compression-value">${imageSettings.get('quality.png_compression')}</span>
        </label>
        <input type="range" id="png-compression" min="0" max="9" value="${imageSettings.get('quality.png_compression')}" 
               style="width: 300px;">
        <div style="font-size: 12px; color: #999; margin-top: 4px;">0 = 빠른 압축, 9 = 작은 파일</div>
    `;
    
    // JPEG 품질 설정
    const jpgGroup = document.createElement('div');
    jpgGroup.id = 'jpg-settings';
    jpgGroup.style.cssText = 'margin-bottom: 20px; display: none;';
    jpgGroup.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-weight: 500;">
            JPEG 품질: <span id="jpg-quality-value">${imageSettings.get('quality.jpg_quality')}</span>%
        </label>
        <input type="range" id="jpg-quality" min="1" max="100" value="${imageSettings.get('quality.jpg_quality')}" 
               style="width: 300px;">
        <div style="font-size: 12px; color: #999; margin-top: 4px;">높을수록 좋은 품질, 큰 파일</div>
    `;
    
    // WebP 품질 설정
    const webpGroup = document.createElement('div');
    webpGroup.id = 'webp-settings';
    webpGroup.style.cssText = 'margin-bottom: 20px; display: none;';
    webpGroup.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #ddd; font-weight: 500;">
            WebP 품질: <span id="webp-quality-value">${imageSettings.get('quality.webp_quality')}</span>%
        </label>
        <input type="range" id="webp-quality" min="1" max="100" value="${imageSettings.get('quality.webp_quality')}" 
               style="width: 300px;">
        <div style="font-size: 12px; color: #999; margin-top: 4px;">높을수록 좋은 품질, 큰 파일</div>
    `;
    
    // 메타데이터 설정
    const metadataGroup = document.createElement('div');
    metadataGroup.style.cssText = 'margin-bottom: 20px;';
    metadataGroup.innerHTML = `
        <label style="display: flex; align-items: center; color: #ddd; font-weight: 500;">
            <input type="checkbox" id="save-metadata" ${imageSettings.get('quality.save_metadata') ? 'checked' : ''} 
                   style="margin-right: 8px;">
            EXIF 메타데이터 저장 (생성 정보 포함)
        </label>
    `;
    
    // 이벤트 리스너 설정
    container.appendChild(title);
    container.appendChild(formatGroup);
    container.appendChild(pngGroup);
    container.appendChild(jpgGroup);
    container.appendChild(webpGroup);
    container.appendChild(metadataGroup);
    
    // 이벤트 리스너 추가
    setTimeout(() => {
        setupQualityEventListeners();
    }, 0);
    
    return container;
}

/**
 * 고급 설정 UI
 */
function createAdvancedUI() {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 20px;';
    
    const title = document.createElement('h4');
    title.style.cssText = 'margin: 0 0 16px 0; color: #9b59b6; font-size: 16px;';
    title.textContent = '🔧 고급 설정';
    
    const settings = imageSettings.get('advanced');
    
    container.innerHTML = `
        <div style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; color: #ddd; font-weight: 500; margin-bottom: 8px;">
                <input type="checkbox" id="create-date-folders" ${settings.create_date_folders ? 'checked' : ''} 
                       style="margin-right: 8px;">
                날짜별 폴더 생성 (YYYY/MM/DD)
            </label>
            <div style="font-size: 12px; color: #999; margin-left: 24px;">파일을 날짜별 폴더에 자동으로 정리합니다.</div>
        </div>
        
        <div style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; color: #ddd; font-weight: 500; margin-bottom: 8px;">
                <input type="checkbox" id="sanitize-filenames" ${settings.sanitize_filenames ? 'checked' : ''} 
                       style="margin-right: 8px;">
                파일명 자동 정리
            </label>
            <div style="font-size: 12px; color: #999; margin-left: 24px;">특수문자를 안전한 문자로 변환합니다.</div>
        </div>
        
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: #ddd; font-weight: 500;">
                최대 파일명 길이: <span id="max-filename-value">${settings.max_filename_length}</span>자
            </label>
            <input type="range" id="max-filename-length" min="50" max="250" value="${settings.max_filename_length}" 
                   style="width: 300px;">
        </div>
        
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; color: #ddd; font-weight: 500;">중복 파일 처리 방식</label>
            <select id="duplicate-handling" style="width: 200px; padding: 8px; background: #3a3a3a; border: 1px solid #555; border-radius: 5px; color: #fff;">
                <option value="rename" ${settings.duplicate_handling === 'rename' ? 'selected' : ''}>이름 변경 (자동 번호 추가)</option>
                <option value="overwrite" ${settings.duplicate_handling === 'overwrite' ? 'selected' : ''}>덮어쓰기</option>
                <option value="skip" ${settings.duplicate_handling === 'skip' ? 'selected' : ''}>건너뛰기</option>
            </select>
        </div>
        
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #444;">
            <button id="reset-settings" style="padding: 8px 16px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 8px;">
                모든 설정 초기화
            </button>
            <button id="export-settings" style="padding: 8px 16px; background: #27ae60; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 8px;">
                설정 내보내기
            </button>
            <input type="file" id="import-file" accept=".json" style="display: none;">
            <button id="import-settings" style="padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">
                설정 가져오기
            </button>
        </div>
    `;
    
    // 이벤트 리스너 추가
    setTimeout(() => {
        setupAdvancedEventListeners();
    }, 0);
    
    return container;
}

/**
 * 경로 폼 그룹 생성
 */
function createPathFormGroup(pathType) {
    const formGroup = document.createElement('div');
    formGroup.style.cssText = 'margin-bottom: 20px;';
    
    const currentPath = imageSettings.getPath(pathType.key);
    
    formGroup.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #9b59b6; font-weight: 500;">
            ${pathType.label}
        </label>
        <div style="font-size: 12px; color: #999; margin-bottom: 8px;">${pathType.desc}</div>
        <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="path-${pathType.key}" value="${currentPath}" 
                   style="flex: 1; padding: 8px 12px; background: #3a3a3a; border: 1px solid #555; border-radius: 5px; color: #fff; font-size: 13px;">
            <button type="button" class="reset-path-btn" data-type="${pathType.key}"
                    style="padding: 8px 12px; background: #95a5a6; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">
                기본값
            </button>
        </div>
    `;
    
    return formGroup;
}

/**
 * 파일명 폼 그룹 생성
 */
function createFilenameFormGroup(filenameType) {
    const formGroup = document.createElement('div');
    formGroup.style.cssText = 'margin-bottom: 20px;';
    
    const currentPattern = imageSettings.getFilenamePattern(filenameType.key);
    
    formGroup.innerHTML = `
        <label style="display: block; margin-bottom: 8px; color: #9b59b6; font-weight: 500;">
            ${filenameType.label}
        </label>
        <div style="font-size: 12px; color: #27ae60; margin-bottom: 4px;">예시: ${filenameType.example}</div>
        <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" id="filename-${filenameType.key}" value="${currentPattern}" 
                   style="flex: 1; padding: 8px 12px; background: #3a3a3a; border: 1px solid #555; border-radius: 5px; color: #fff; font-size: 13px;">
            <button type="button" class="reset-filename-btn" data-type="${filenameType.key}"
                    style="padding: 8px 12px; background: #95a5a6; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px;">
                기본값
            </button>
        </div>
    `;
    
    return formGroup;
}

/**
 * 품질 설정 이벤트 리스너 설정
 */
function setupQualityEventListeners() {
    const formatSelect = document.getElementById('image-format');
    const pngSettings = document.getElementById('png-settings');
    const jpgSettings = document.getElementById('jpg-settings');
    const webpSettings = document.getElementById('webp-settings');
    
    if (!formatSelect) return;
    
    // 현재 포맷 설정
    formatSelect.value = imageSettings.get('quality.format');
    
    // 포맷 변경 이벤트
    formatSelect.addEventListener('change', (e) => {
        const format = e.target.value;
        imageSettings.set('quality.format', format);
        
        // UI 업데이트
        pngSettings.style.display = format === 'png' ? 'block' : 'none';
        jpgSettings.style.display = format === 'jpg' ? 'block' : 'none';
        webpSettings.style.display = format === 'webp' ? 'block' : 'none';
    });
    
    // 초기 UI 업데이트
    const currentFormat = formatSelect.value;
    pngSettings.style.display = currentFormat === 'png' ? 'block' : 'none';
    jpgSettings.style.display = currentFormat === 'jpg' ? 'block' : 'none';
    webpSettings.style.display = currentFormat === 'webp' ? 'block' : 'none';
    
    // 슬라이더 이벤트들
    const pngSlider = document.getElementById('png-compression');
    const jpgSlider = document.getElementById('jpg-quality');
    const webpSlider = document.getElementById('webp-quality');
    const metadataCheckbox = document.getElementById('save-metadata');
    
    if (pngSlider) {
        pngSlider.addEventListener('input', (e) => {
            document.getElementById('png-compression-value').textContent = e.target.value;
            imageSettings.set('quality.png_compression', parseInt(e.target.value));
        });
    }
    
    if (jpgSlider) {
        jpgSlider.addEventListener('input', (e) => {
            document.getElementById('jpg-quality-value').textContent = e.target.value;
            imageSettings.set('quality.jpg_quality', parseInt(e.target.value));
        });
    }
    
    if (webpSlider) {
        webpSlider.addEventListener('input', (e) => {
            document.getElementById('webp-quality-value').textContent = e.target.value;
            imageSettings.set('quality.webp_quality', parseInt(e.target.value));
        });
    }
    
    if (metadataCheckbox) {
        metadataCheckbox.addEventListener('change', (e) => {
            imageSettings.set('quality.save_metadata', e.target.checked);
        });
    }
}

/**
 * 고급 설정 이벤트 리스너 설정
 */
function setupAdvancedEventListeners() {
    // 체크박스들
    const createDateFolders = document.getElementById('create-date-folders');
    const sanitizeFilenames = document.getElementById('sanitize-filenames');
    const maxFilenameSlider = document.getElementById('max-filename-length');
    const duplicateHandling = document.getElementById('duplicate-handling');
    
    if (createDateFolders) {
        createDateFolders.addEventListener('change', (e) => {
            imageSettings.set('advanced.create_date_folders', e.target.checked);
        });
    }
    
    if (sanitizeFilenames) {
        sanitizeFilenames.addEventListener('change', (e) => {
            imageSettings.set('advanced.sanitize_filenames', e.target.checked);
        });
    }
    
    if (maxFilenameSlider) {
        maxFilenameSlider.addEventListener('input', (e) => {
            document.getElementById('max-filename-value').textContent = e.target.value;
            imageSettings.set('advanced.max_filename_length', parseInt(e.target.value));
        });
    }
    
    if (duplicateHandling) {
        duplicateHandling.addEventListener('change', (e) => {
            imageSettings.set('advanced.duplicate_handling', e.target.value);
        });
    }
    
    // 버튼들
    const resetBtn = document.getElementById('reset-settings');
    const exportBtn = document.getElementById('export-settings');
    const importBtn = document.getElementById('import-settings');
    const importFile = document.getElementById('import-file');
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('모든 이미지 설정을 초기화하시겠습니까?')) {
                imageSettings.reset();
                showNotification('✅ 설정이 초기화되었습니다. 페이지를 새로고침해주세요.');
            }
        });
    }
    
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const settings = imageSettings.exportSettings();
            const blob = new Blob([settings], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cubestudio-image-settings-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showNotification('✅ 설정이 내보내졌습니다.');
        });
    }
    
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });
        
        importFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (imageSettings.importSettings(e.target.result)) {
                        showNotification('✅ 설정을 가져왔습니다. 페이지를 새로고침해주세요.');
                    } else {
                        showNotification('❌ 설정 파일이 올바르지 않습니다.');
                    }
                };
                reader.readAsText(file);
            }
        });
    }
}

/**
 * 알림 메시지 표시
 */
function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10001;
        font-size: 14px;
        max-width: 300px;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (document.body.contains(notification)) {
            document.body.removeChild(notification);
        }
    }, 3000);
}