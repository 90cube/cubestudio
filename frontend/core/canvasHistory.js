// core/canvasHistory.js

/**
 * Canvas History Manager
 * Undo/Redo 기능을 위한 히스토리 관리 시스템
 *
 * 사용 예시:
 * import canvasHistory from './core/canvasHistory.js';
 *
 * // 작업 전 스냅샷 저장
 * canvasHistory.push({
 *   type: 'crop',
 *   imageId: image.id(),
 *   before: image.toJSON(),
 *   after: croppedImage.toJSON()
 * });
 *
 * // Undo
 * const snapshot = canvasHistory.undo();
 * if (snapshot) {
 *   restoreSnapshot(snapshot);
 * }
 */

class CanvasHistory {
    constructor() {
        // 히스토리 스택
        this.stack = [];

        // 현재 위치 (-1: 초기 상태, 0~: 스냅샷 인덱스)
        this.currentIndex = -1;

        // 최대 히스토리 크기 (메모리 관리)
        this.maxSize = 50;

        // 히스토리 활성화 상태
        this.enabled = true;

        // 통계
        this.stats = {
            totalPushes: 0,
            totalUndos: 0,
            totalRedos: 0,
            totalClears: 0
        };

        console.log('CanvasHistory initialized');
    }

    // ============================================================================
    // 핵심 기능
    // ============================================================================

    /**
     * 히스토리에 스냅샷 추가
     * @param {Object} snapshot - 작업 스냅샷
     * @param {string} snapshot.type - 작업 타입 (crop, move, delete, add, transform, etc.)
     * @param {string} snapshot.description - 작업 설명 (선택사항)
     * @param {Object} snapshot.before - 작업 전 상태
     * @param {Object} snapshot.after - 작업 후 상태
     * @param {number} snapshot.timestamp - 타임스탬프 (자동 생성)
     */
    push(snapshot) {
        if (!this.enabled) {
            console.log('History is disabled, skipping push');
            return;
        }

        // 타임스탬프 자동 추가
        snapshot.timestamp = Date.now();

        // 현재 위치 이후의 히스토리 제거 (새로운 분기 시작)
        if (this.currentIndex < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.currentIndex + 1);
        }

        // 스냅샷 추가
        this.stack.push(snapshot);
        this.currentIndex++;

        // 최대 크기 초과 시 가장 오래된 항목 제거
        if (this.stack.length > this.maxSize) {
            this.stack.shift();
            this.currentIndex--;
        }

        this.stats.totalPushes++;

        console.log(`✅ History snapshot added: ${snapshot.type}`, {
            stackSize: this.stack.length,
            currentIndex: this.currentIndex
        });

        // 히스토리 변경 이벤트 발생
        this.dispatchHistoryEvent('historyChanged', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            stackSize: this.stack.length
        });
    }

    /**
     * Undo - 이전 상태로 되돌리기
     * @returns {Object|null} 복원할 스냅샷 (before 상태)
     */
    undo() {
        if (!this.canUndo()) {
            console.log('⚠️ Cannot undo: already at the beginning');
            return null;
        }

        const snapshot = this.stack[this.currentIndex];
        this.currentIndex--;
        this.stats.totalUndos++;

        console.log(`↩️ Undo: ${snapshot.type}`, {
            newIndex: this.currentIndex,
            stackSize: this.stack.length
        });

        // 히스토리 변경 이벤트 발생
        this.dispatchHistoryEvent('historyChanged', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            stackSize: this.stack.length
        });

        return {
            ...snapshot,
            state: snapshot.before,
            action: 'undo'
        };
    }

    /**
     * Redo - 다시 실행
     * @returns {Object|null} 복원할 스냅샷 (after 상태)
     */
    redo() {
        if (!this.canRedo()) {
            console.log('⚠️ Cannot redo: already at the end');
            return null;
        }

        this.currentIndex++;
        const snapshot = this.stack[this.currentIndex];
        this.stats.totalRedos++;

        console.log(`↪️ Redo: ${snapshot.type}`, {
            newIndex: this.currentIndex,
            stackSize: this.stack.length
        });

        // 히스토리 변경 이벤트 발생
        this.dispatchHistoryEvent('historyChanged', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            stackSize: this.stack.length
        });

        return {
            ...snapshot,
            state: snapshot.after,
            action: 'redo'
        };
    }

    // ============================================================================
    // 상태 확인
    // ============================================================================

    /**
     * Undo 가능 여부 확인
     * @returns {boolean}
     */
    canUndo() {
        return this.currentIndex >= 0;
    }

    /**
     * Redo 가능 여부 확인
     * @returns {boolean}
     */
    canRedo() {
        return this.currentIndex < this.stack.length - 1;
    }

    /**
     * 현재 히스토리 정보 조회
     * @returns {Object}
     */
    getInfo() {
        return {
            stackSize: this.stack.length,
            currentIndex: this.currentIndex,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            enabled: this.enabled,
            maxSize: this.maxSize,
            stats: { ...this.stats }
        };
    }

    /**
     * 히스토리 스택 조회 (읽기 전용)
     * @returns {Array} 스냅샷 배열
     */
    getStack() {
        return this.stack.map(snapshot => ({
            type: snapshot.type,
            description: snapshot.description,
            timestamp: snapshot.timestamp,
            // before/after는 메모리 절약을 위해 제외
        }));
    }

    // ============================================================================
    // 관리 기능
    // ============================================================================

    /**
     * 히스토리 초기화
     */
    clear() {
        this.stack = [];
        this.currentIndex = -1;
        this.stats.totalClears++;

        console.log('🗑️ History cleared');

        // 히스토리 변경 이벤트 발생
        this.dispatchHistoryEvent('historyChanged', {
            canUndo: false,
            canRedo: false,
            stackSize: 0
        });
    }

    /**
     * 히스토리 활성화/비활성화
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`History ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * 최대 히스토리 크기 설정
     * @param {number} maxSize
     */
    setMaxSize(maxSize) {
        if (maxSize < 1) {
            console.error('Max size must be at least 1');
            return;
        }

        this.maxSize = maxSize;

        // 현재 스택이 새로운 최대 크기를 초과하면 오래된 항목 제거
        if (this.stack.length > maxSize) {
            const removeCount = this.stack.length - maxSize;
            this.stack = this.stack.slice(removeCount);
            this.currentIndex = Math.max(-1, this.currentIndex - removeCount);
        }

        console.log(`Max history size set to ${maxSize}`);
    }

    /**
     * 특정 타입의 히스토리만 제거
     * @param {string} type - 제거할 작업 타입
     */
    removeByType(type) {
        const beforeSize = this.stack.length;
        this.stack = this.stack.filter(snapshot => snapshot.type !== type);
        const removedCount = beforeSize - this.stack.length;

        // 현재 인덱스 조정
        if (this.currentIndex >= this.stack.length) {
            this.currentIndex = this.stack.length - 1;
        }

        console.log(`Removed ${removedCount} snapshots of type '${type}'`);

        // 히스토리 변경 이벤트 발생
        this.dispatchHistoryEvent('historyChanged', {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            stackSize: this.stack.length
        });
    }

    // ============================================================================
    // 고급 기능
    // ============================================================================

    /**
     * 그룹 작업 시작 (여러 작업을 하나로 묶기)
     * @param {string} description - 그룹 설명
     */
    beginGroup(description = 'Group operation') {
        this._groupStack = [];
        this._groupDescription = description;
        console.log(`📦 Begin group: ${description}`);
    }

    /**
     * 그룹 작업 종료
     */
    endGroup() {
        if (!this._groupStack || this._groupStack.length === 0) {
            console.warn('No group operation in progress');
            return;
        }

        const groupSnapshot = {
            type: 'group',
            description: this._groupDescription,
            operations: this._groupStack,
            before: this._groupStack[0]?.before,
            after: this._groupStack[this._groupStack.length - 1]?.after
        };

        this.push(groupSnapshot);

        console.log(`📦 End group: ${this._groupDescription} (${this._groupStack.length} operations)`);

        this._groupStack = null;
        this._groupDescription = null;
    }

    /**
     * 그룹 진행 중인지 확인
     * @returns {boolean}
     */
    isGrouping() {
        return this._groupStack !== null;
    }

    /**
     * 북마크 생성 (특정 시점 저장)
     * @param {string} name - 북마크 이름
     */
    createBookmark(name) {
        if (!this._bookmarks) {
            this._bookmarks = new Map();
        }

        this._bookmarks.set(name, {
            index: this.currentIndex,
            timestamp: Date.now()
        });

        console.log(`🔖 Bookmark created: ${name}`);
    }

    /**
     * 북마크로 이동
     * @param {string} name - 북마크 이름
     * @returns {boolean} 성공 여부
     */
    gotoBookmark(name) {
        if (!this._bookmarks || !this._bookmarks.has(name)) {
            console.error(`Bookmark '${name}' not found`);
            return false;
        }

        const bookmark = this._bookmarks.get(name);
        const targetIndex = bookmark.index;

        if (targetIndex < -1 || targetIndex >= this.stack.length) {
            console.error(`Invalid bookmark index: ${targetIndex}`);
            return false;
        }

        this.currentIndex = targetIndex;
        console.log(`🔖 Jumped to bookmark: ${name} (index ${targetIndex})`);

        return true;
    }

    // ============================================================================
    // 이벤트 시스템
    // ============================================================================

    /**
     * 히스토리 변경 이벤트 발생
     * @param {string} eventName
     * @param {Object} detail
     */
    dispatchHistoryEvent(eventName, detail) {
        const event = new CustomEvent(eventName, { detail });
        document.dispatchEvent(event);
    }

    // ============================================================================
    // 디버그 및 통계
    // ============================================================================

    /**
     * 디버그 정보 출력
     */
    debug() {
        console.group('CanvasHistory Debug Info');
        console.log('Stack size:', this.stack.length);
        console.log('Current index:', this.currentIndex);
        console.log('Can undo:', this.canUndo());
        console.log('Can redo:', this.canRedo());
        console.log('Enabled:', this.enabled);
        console.log('Max size:', this.maxSize);
        console.log('Statistics:', this.stats);
        console.log('Recent snapshots:', this.getStack().slice(-5));
        console.groupEnd();
    }

    /**
     * 메모리 사용량 추정
     * @returns {Object} 메모리 정보
     */
    getMemoryUsage() {
        // JSON 직렬화 크기로 대략적인 메모리 사용량 추정
        const stackSize = JSON.stringify(this.stack).length;
        const avgSnapshotSize = this.stack.length > 0 ? stackSize / this.stack.length : 0;

        return {
            totalBytes: stackSize,
            totalKB: (stackSize / 1024).toFixed(2),
            totalMB: (stackSize / 1024 / 1024).toFixed(2),
            snapshotCount: this.stack.length,
            avgSnapshotBytes: Math.round(avgSnapshotSize),
            avgSnapshotKB: (avgSnapshotSize / 1024).toFixed(2)
        };
    }
}

// 싱글톤 인스턴스 생성 및 export
const canvasHistory = new CanvasHistory();

// 디버깅을 위한 전역 참조
window.canvasHistory = canvasHistory;

// 키보드 단축키 등록 (Ctrl+Z: Undo, Ctrl+Y: Redo)
document.addEventListener('keydown', (e) => {
    // 텍스트 입력 중이면 무시
    const activeElement = document.activeElement;
    const isTextInput = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
    );

    if (isTextInput) return;

    // Ctrl+Z 또는 Cmd+Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const snapshot = canvasHistory.undo();
        if (snapshot) {
            // 실제 복원 로직은 canvas.js에서 구현
            document.dispatchEvent(new CustomEvent('canvasUndo', { detail: snapshot }));
        }
    }

    // Ctrl+Y 또는 Ctrl+Shift+Z 또는 Cmd+Shift+Z: Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const snapshot = canvasHistory.redo();
        if (snapshot) {
            // 실제 복원 로직은 canvas.js에서 구현
            document.dispatchEvent(new CustomEvent('canvasRedo', { detail: snapshot }));
        }
    }
});

console.log('CanvasHistory module loaded. Keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y (Redo)');

export default canvasHistory;
