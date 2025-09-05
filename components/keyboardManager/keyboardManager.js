// components/keyboardManager/keyboardManager.js

/**
 * 키보드 매니저 모듈
 * 웹 브라우저의 기본 단축키를 비활성화하고 애플리케이션 전용 단축키를 관리합니다.
 */

let isActive = false;
let shortcutHandlers = new Map();

export function init() {
    // console.log('Keyboard Manager initialized');
    activateKeyboardCapture();
}

/**
 * 키보드 캡처 활성화 - 웹 단축키 비활성화
 */
export function activateKeyboardCapture() {
    if (isActive) return;
    
    isActive = true;
    
    // 페이지 전체 키보드 이벤트 캡처
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    
    // 컨텍스트 메뉴 비활성화 (주석 처리됨)
    // document.addEventListener('contextmenu', preventContextMenu, true);
    
    // 브라우저 기본 동작 비활성화 (주석 처리됨)
    // document.addEventListener('selectstart', preventSelection, true);
    // document.addEventListener('dragstart', preventDragStart, true);
    
    // console.log('Keyboard capture activated - Waiting for user to specify blocked keys');
}

/**
 * 키보드 캡처 비활성화 - 웹 단축키 복원
 */
export function deactivateKeyboardCapture() {
    if (!isActive) return;
    
    isActive = false;
    
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);
    // document.removeEventListener('contextmenu', preventContextMenu, true);
    // document.removeEventListener('selectstart', preventSelection, true);
    // document.removeEventListener('dragstart', preventDragStart, true);
    
    // console.log('Keyboard capture deactivated - Web shortcuts restored');
}

/**
 * 키다운 이벤트 핸들러
 */
function handleKeyDown(e) {
    // 브라우저 기본 단축키 차단 (주석 처리됨 - 필요한 것만 활성화 예정)
    const blockedKeys = [
        // 사용자가 지정할 때까지 모든 차단 해제
        
        // // 새로고침
        // { key: 'F5' },
        // { key: 'r', ctrl: true },
        // { key: 'R', ctrl: true },
        
        // // 페이지 이동
        // { key: 'F5', shift: true },
        // { key: 'ArrowLeft', alt: true },
        // { key: 'ArrowRight', alt: true },
        
        // // 브라우저 기능
        // { key: 't', ctrl: true },
        // { key: 'T', ctrl: true },
        // { key: 'n', ctrl: true },
        // { key: 'N', ctrl: true },
        // { key: 'w', ctrl: true },
        // { key: 'W', ctrl: true },
        // { key: 'j', ctrl: true },
        // { key: 'J', ctrl: true },
        // { key: 'k', ctrl: true },
        // { key: 'K', ctrl: true },
        // { key: 'u', ctrl: true },
        // { key: 'U', ctrl: true },
        // { key: 'h', ctrl: true },
        // { key: 'H', ctrl: true },
        // { key: 'l', ctrl: true },
        // { key: 'L', ctrl: true },
        // { key: 'd', ctrl: true },
        // { key: 'D', ctrl: true },
        // { key: 'f', ctrl: true },
        // { key: 'F', ctrl: true },
        // { key: 'g', ctrl: true },
        // { key: 'G', ctrl: true },
        // { key: 'p', ctrl: true },
        // { key: 'P', ctrl: true },
        
        // // 개발자 도구
        // { key: 'F12' },
        // { key: 'I', ctrl: true, shift: true },
        // { key: 'i', ctrl: true, shift: true },
        
        // // 저장
        // { key: 's', ctrl: true },
        // { key: 'S', ctrl: true },
        
        // // 인쇄
        // { key: 'p', ctrl: true },
        // { key: 'P', ctrl: true },
        
        // // 확대/축소
        // { key: '+', ctrl: true },
        // { key: '=', ctrl: true },
        // { key: '-', ctrl: true },
        // { key: '0', ctrl: true },
        
        // // 기타
        // { key: 'Backspace' } // 뒤로가기 방지
    ];
    
    const shouldBlock = blockedKeys.some(blocked => {
        const keyMatch = blocked.key === e.key;
        const ctrlMatch = !blocked.ctrl || e.ctrlKey;
        const shiftMatch = !blocked.shift || e.shiftKey;
        const altMatch = !blocked.alt || e.altKey;
        
        return keyMatch && ctrlMatch && shiftMatch && altMatch;
    });
    
    if (shouldBlock) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // console.log(`Blocked browser shortcut: ${e.key}${e.ctrlKey ? ' + Ctrl' : ''}${e.shiftKey ? ' + Shift' : ''}${e.altKey ? ' + Alt' : ''}`);
        return false;
    }
    
    // 텍스트 입력 중인지 확인 - 입력 중이면 단축키 처리 안함
    const activeElement = document.activeElement;
    const isTextInput = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.contentEditable === 'true'
    );
    
    // 텍스트 입력 모달이 열려있는지 확인
    const textInputModal = document.getElementById('text-input-modal');
    const isModalOpen = textInputModal && textInputModal.style.display !== 'none';
    
    // 텍스트 입력 중이면 ESC 키만 허용 (모달 닫기용)
    if ((isTextInput || isModalOpen) && e.key !== 'Escape') {
        return; // 텍스트 입력 중에는 다른 단축키 비활성화
    }
    
    // 애플리케이션 단축키 처리
    const shortcutKey = createShortcutKey(e);
    if (shortcutHandlers.has(shortcutKey)) {
        const handler = shortcutHandlers.get(shortcutKey);
        handler.callback(e);
        
        // ESC 키는 preventDefault를 호출하지 않음 (브라우저 기본 동작 허용)
        if (e.key !== 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }
}

/**
 * 키업 이벤트 핸들러
 */
function handleKeyUp(e) {
    // 필요한 경우 키업 이벤트 처리
}

/**
 * 컨텍스트 메뉴 방지
 */
function preventContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
}

/**
 * 텍스트 선택 방지
 */
function preventSelection(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
}

/**
 * 드래그 시작 방지
 */
function preventDragStart(e) {
    if (e.target.tagName !== 'CANVAS') {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
}

/**
 * 단축키 등록
 * @param {string} key - 키 이름
 * @param {Function} callback - 콜백 함수
 * @param {Object} modifiers - 수정키 { ctrl, shift, alt }
 * @param {string} description - 단축키 설명
 */
export function registerShortcut(key, callback, modifiers = {}, description = '') {
    const shortcutKey = `${key}${modifiers.ctrl ? '+ctrl' : ''}${modifiers.shift ? '+shift' : ''}${modifiers.alt ? '+alt' : ''}`;
    
    shortcutHandlers.set(shortcutKey, {
        callback,
        modifiers,
        description
    });
    
    // console.log(`Registered shortcut: ${shortcutKey} - ${description}`);
}

/**
 * 단축키 해제
 * @param {string} key - 키 이름
 * @param {Object} modifiers - 수정키 { ctrl, shift, alt }
 */
export function unregisterShortcut(key, modifiers = {}) {
    const shortcutKey = `${key}${modifiers.ctrl ? '+ctrl' : ''}${modifiers.shift ? '+shift' : ''}${modifiers.alt ? '+alt' : ''}`;
    
    if (shortcutHandlers.has(shortcutKey)) {
        shortcutHandlers.delete(shortcutKey);
        // console.log(`Unregistered shortcut: ${shortcutKey}`);
        return true;
    }
    
    return false;
}

/**
 * 이벤트로부터 단축키 키 생성
 */
function createShortcutKey(event) {
    return `${event.key}${event.ctrlKey ? '+ctrl' : ''}${event.shiftKey ? '+shift' : ''}${event.altKey ? '+alt' : ''}`;
}

/**
 * 등록된 단축키 목록 가져오기
 */
export function getRegisteredShortcuts() {
    const shortcuts = [];
    for (const [key, handler] of shortcutHandlers.entries()) {
        shortcuts.push({
            key,
            description: handler.description
        });
    }
    return shortcuts;
}

/**
 * 모든 단축키 해제
 */
export function clearAllShortcuts() {
    shortcutHandlers.clear();
    // console.log('All shortcuts cleared');
}

/**
 * 키보드 매니저 활성 상태 확인
 */
export function isKeyboardCaptureActive() {
    return isActive;
}