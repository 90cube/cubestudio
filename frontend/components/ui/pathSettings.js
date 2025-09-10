// components/ui/pathSettings.js

import pathConfig from '../../core/pathConfig.js';

/**
 * 경로 설정 UI 컴포넌트
 * 프로젝트의 출력 경로들을 관리합니다.
 */

let pathSettingsModal = null;

/**
 * 경로 설정 모달 열기
 */
export function openPathSettings() {
    if (pathSettingsModal) {
        pathSettingsModal.focus();
        return;
    }
    
    pathSettingsModal = createPathSettingsModal();
    document.body.appendChild(pathSettingsModal.element);
}

/**
 * 경로 설정 모달 생성
 */
function createPathSettingsModal() {
    // 모달 백드롭
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
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
        width: 600px;
        max-width: 90vw;
        max-height: 80vh;
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
        background: #f39c12;
        color: white;
        font-weight: 600;
    `;
    
    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0; font-size: 16px;';
    title.textContent = '📁 출력 경로 설정';
    
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
    
    // 바디
    const body = document.createElement('div');
    body.style.cssText = `
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        background: #1a1a1a;
        color: #e8eaed;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // 경로 설정 UI 생성
    const pathSettingsUI = createPathSettingsUI();
    body.appendChild(pathSettingsUI);
    
    // 닫기 기능
    const closeModal = () => {
        document.body.removeChild(backdrop);
        pathSettingsModal = null;
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
    modal.appendChild(body);
    backdrop.appendChild(modal);
    
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
 * 경로 설정 UI 생성
 */
function createPathSettingsUI() {
    const container = document.createElement('div');
    
    // 설명
    const description = document.createElement('div');
    description.style.cssText = `
        margin-bottom: 20px;
        padding: 12px;
        background: rgba(52, 152, 219, 0.1);
        border: 1px solid rgba(52, 152, 219, 0.3);
        border-radius: 6px;
        color: #ccc;
        font-size: 14px;
    `;
    description.innerHTML = `
        <strong>📋 출력 경로 관리</strong><br>
        각 기능별 출력 경로를 설정할 수 있습니다. 빈 값으로 두면 기본 경로가 사용됩니다.<br>
        <small style="color: #95a5a6;">* 브라우저에서는 서버가 실행 중일 때만 지정된 경로에 저장됩니다.</small>
    `;
    
    // 경로 설정 폼들
    const pathTypes = [
        {
            key: 'preprocessor',
            label: '🎛️ 전처리기 출력',
            description: 'ControlNet 전처리 이미지가 저장되는 경로',
            defaultPath: './output/preprocessor'
        },
        {
            key: 'generation',
            label: '🖼️ 생성 이미지 출력',
            description: 'AI 생성 이미지가 저장되는 경로',
            defaultPath: './output/generation'
        },
        {
            key: 'cache',
            label: '💾 캐시',
            description: '임시 파일과 캐시가 저장되는 경로',
            defaultPath: './output/cache'
        },
        {
            key: 'temp',
            label: '🗂️ 임시 파일',
            description: '작업 중 임시로 생성되는 파일들이 저장되는 경로',
            defaultPath: './output/temp'
        }
    ];
    
    const pathFormsContainer = document.createElement('div');
    pathFormsContainer.style.cssText = 'margin-bottom: 20px;';
    
    pathTypes.forEach(pathType => {
        const formGroup = createPathForm(pathType);
        pathFormsContainer.appendChild(formGroup);
    });
    
    // 버튼들
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.cssText = `
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        padding-top: 20px;
        border-top: 1px solid #444;
    `;
    
    const resetButton = document.createElement('button');
    resetButton.textContent = '기본값으로 재설정';
    resetButton.style.cssText = `
        padding: 10px 16px;
        background: #e74c3c;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s;
    `;
    
    const saveButton = document.createElement('button');
    saveButton.textContent = '저장';
    saveButton.style.cssText = `
        padding: 10px 16px;
        background: #27ae60;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.2s;
    `;
    
    // 이벤트 리스너
    resetButton.addEventListener('click', () => {
        if (confirm('모든 경로를 기본값으로 재설정하시겠습니까?')) {
            pathConfig.resetAllPaths();
            // UI 새로고침
            pathFormsContainer.innerHTML = '';
            pathTypes.forEach(pathType => {
                const formGroup = createPathForm(pathType);
                pathFormsContainer.appendChild(formGroup);
            });
        }
    });
    
    saveButton.addEventListener('click', () => {
        // 현재 입력값들을 pathConfig에 저장
        pathTypes.forEach(pathType => {
            const input = container.querySelector(`#path-${pathType.key}`);
            if (input) {
                pathConfig.setPath(pathType.key, input.value.trim());
            }
        });
        
        // 저장 완료 메시지
        showNotification('✅ 경로 설정이 저장되었습니다.');
    });
    
    // 호버 효과
    resetButton.addEventListener('mouseenter', () => {
        resetButton.style.background = '#c0392b';
    });
    resetButton.addEventListener('mouseleave', () => {
        resetButton.style.background = '#e74c3c';
    });
    
    saveButton.addEventListener('mouseenter', () => {
        saveButton.style.background = '#2ecc71';
    });
    saveButton.addEventListener('mouseleave', () => {
        saveButton.style.background = '#27ae60';
    });
    
    buttonsDiv.appendChild(resetButton);
    buttonsDiv.appendChild(saveButton);
    
    // 컨테이너 구성
    container.appendChild(description);
    container.appendChild(pathFormsContainer);
    container.appendChild(buttonsDiv);
    
    return container;
}

/**
 * 개별 경로 설정 폼 생성
 */
function createPathForm(pathType) {
    const formGroup = document.createElement('div');
    formGroup.style.cssText = 'margin-bottom: 20px;';
    
    const label = document.createElement('label');
    label.style.cssText = `
        display: block;
        margin-bottom: 8px;
        color: #f39c12;
        font-weight: 500;
        font-size: 14px;
    `;
    label.textContent = pathType.label;
    
    const description = document.createElement('div');
    description.style.cssText = `
        font-size: 12px;
        color: #95a5a6;
        margin-bottom: 8px;
    `;
    description.textContent = pathType.description;
    
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `path-${pathType.key}`;
    input.value = pathConfig.getPath(pathType.key);
    input.placeholder = pathType.defaultPath;
    input.style.cssText = `
        flex: 1;
        padding: 8px 12px;
        background: #3a3a3a;
        border: 1px solid #555;
        border-radius: 5px;
        color: #fff;
        font-size: 13px;
    `;
    
    const resetSingleButton = document.createElement('button');
    resetSingleButton.textContent = '기본값';
    resetSingleButton.style.cssText = `
        padding: 8px 12px;
        background: #95a5a6;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 12px;
        transition: background 0.2s;
    `;
    
    resetSingleButton.addEventListener('click', () => {
        input.value = '';
        input.placeholder = pathType.defaultPath;
    });
    
    resetSingleButton.addEventListener('mouseenter', () => {
        resetSingleButton.style.background = '#7f8c8d';
    });
    resetSingleButton.addEventListener('mouseleave', () => {
        resetSingleButton.style.background = '#95a5a6';
    });
    
    inputContainer.appendChild(input);
    inputContainer.appendChild(resetSingleButton);
    
    formGroup.appendChild(label);
    formGroup.appendChild(description);
    formGroup.appendChild(inputContainer);
    
    return formGroup;
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