// core/stateManager.js

/**
 * 상태 관리자
 * 패널 상태 저장, 사용량 통계, pub/sub 패턴 구현
 */

class StateManager {
    constructor() {
        // 패널 상태 저장
        this.panelStates = new Map();
        
        // 사용량 통계
        this.usageStats = {
            panelActions: [],
            componentStates: new Map(),
            sessionStart: Date.now(),
            interactions: {
                minimize: 0,
                restore: 0,
                drag: 0,
                resize: 0,
                colorChange: 0
            }
        };
        
        // pub/sub 패턴
        this.subscribers = new Map();
        this.state = new Map();
        
        // 성능 지표
        this.performanceMetrics = {
            panelOperations: [],
            memoryUsage: []
        };
        
        console.log('StateManager initialized');
    }
    
    // ============================================================================
    // PUB/SUB 패턴 구현
    // ============================================================================
    
    /**
     * 상태 업데이트 및 구독자 알림
     * @param {string} key - 상태 키
     * @param {*} value - 상태 값
     */
    updateState(key, value) {
        const oldValue = this.state.get(key);
        this.state.set(key, value);
        
        // 디버깅: isImageSelected에 대해서만 로그
        // if (key === 'isImageSelected') {
        //     console.log('📡 StateManager.updateState called:');
        //     console.log('📡 - Key:', key);
        //     console.log('📡 - Old value:', oldValue);
        //     console.log('📡 - New value:', value);
        //     
        //     const keySubscribers = this.subscribers.get(key);
        //     console.log('📡 - Subscribers for key:', keySubscribers?.size || 0);
        //     
        //     if (keySubscribers && keySubscribers.size > 0) {
        //         console.log('📡 - Subscriber callbacks:', Array.from(keySubscribers).map(cb => cb.toString().substring(0, 100)));
        //     }
        // }
        
        // 구독자 알림
        const keySubscribers = this.subscribers.get(key);
        if (keySubscribers) {
            keySubscribers.forEach((callback, index) => {
                try {
                    // if (key === 'isImageSelected') {
                    //     console.log(`📡 Calling subscriber ${index + 1}/${keySubscribers.size} for ${key}`);
                    // }
                    callback(value, oldValue);
                    // if (key === 'isImageSelected') {
                    //     console.log(`✅ Subscriber ${index + 1} called successfully`);
                    // }
                } catch (error) {
                    console.error(`StateManager: Error in subscriber callback for key "${key}":`, error);
                }
            });
        } // else if (key === 'isImageSelected') {
            // console.log('⚠️ No subscribers found for isImageSelected');
        // }
        
        // 전역 구독자 알림
        const globalSubscribers = this.subscribers.get('*');
        if (globalSubscribers) {
            globalSubscribers.forEach(callback => {
                try {
                    callback(key, value, oldValue);
                } catch (error) {
                    console.error('StateManager: Error in global subscriber callback:', error);
                }
            });
        }
    }
    
    /**
     * 상태 구독
     * @param {string} key - 구독할 상태 키 ('*'로 모든 상태 변경 구독 가능)
     * @param {Function} callback - 콜백 함수
     * @returns {Function} 구독 해제 함수
     */
    subscribe(key, callback) {
        // 디버깅: isImageSelected에 대해서만 로그
        if (key === 'isImageSelected') {
            console.log('📮 StateManager.subscribe called:');
            console.log('📮 - Key:', key);
            console.log('📮 - Callback:', callback.toString().substring(0, 100) + '...');
            console.log('📮 - Existing subscribers for key:', this.subscribers.get(key)?.size || 0);
        }
        
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }
        
        this.subscribers.get(key).add(callback);
        
        if (key === 'isImageSelected') {
            console.log('📮 - Total subscribers after add:', this.subscribers.get(key).size);
            console.log('📮 - All subscribers for isImageSelected:', Array.from(this.subscribers.get(key)).map(cb => cb.toString().substring(0, 50)));
        }
        
        // 구독 해제 함수 반환
        return () => {
            const keySubscribers = this.subscribers.get(key);
            if (keySubscribers) {
                keySubscribers.delete(callback);
                if (keySubscribers.size === 0) {
                    this.subscribers.delete(key);
                }
            }
        };
    }
    
    /**
     * 상태 조회
     * @param {string} key - 조회할 상태 키
     * @returns {*} 상태 값
     */
    getState(key) {
        return this.state.get(key);
    }
    
    // ============================================================================
    // 패널 상태 관리
    // ============================================================================
    
    /**
     * 패널 상태 저장
     * @param {string} panelId - 패널 ID
     * @param {Object} state - 패널 상태
     */
    savePanelState(panelId, state) {
        const timestamp = Date.now();
        const panelState = {
            ...state,
            lastUpdated: timestamp,
            isMinimized: state.isMinimized || false
        };
        
        this.panelStates.set(panelId, panelState);
        this.updateState(`panel_${panelId}`, panelState);
        
        // 성능 지표 기록
        this.recordPerformanceMetric('panelStateUpdate', {
            panelId,
            timestamp,
            operation: 'save_state'
        });
    }
    
    /**
     * 패널 상태 조회
     * @param {string} panelId - 패널 ID
     * @returns {Object|null} 패널 상태
     */
    getPanelState(panelId) {
        return this.panelStates.get(panelId) || null;
    }
    
    /**
     * 패널 상태 삭제
     * @param {string} panelId - 패널 ID
     */
    deletePanelState(panelId) {
        this.panelStates.delete(panelId);
        this.updateState(`panel_${panelId}`, null);
    }
    
    /**
     * 모든 패널 상태 조회
     * @returns {Map} 모든 패널 상태
     */
    getAllPanelStates() {
        return new Map(this.panelStates);
    }
    
    // ============================================================================
    // 사용량 통계 - 사용자 행동 분석
    // ============================================================================
    
    /**
     * 패널 액션 로깅 (사용량 통계용)
     * @param {string} panelId - 패널 ID
     * @param {string} action - 액션 타입 ('minimize', 'restore', 'drag', 'resize', 'colorChange')
     * @param {Object} metadata - 추가 메타데이터
     */
    logPanelAction(panelId, action, metadata = {}) {
        const timestamp = Date.now();
        const actionLog = {
            panelId,
            action,
            timestamp,
            sessionDuration: timestamp - this.usageStats.sessionStart,
            metadata: {
                ...metadata,
                userAgent: navigator.userAgent,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                timestamp: new Date(timestamp).toISOString()
            }
        };
        
        // 액션 로그 저장
        this.usageStats.panelActions.push(actionLog);
        
        // 상호작용 카운터 업데이트
        if (this.usageStats.interactions.hasOwnProperty(action)) {
            this.usageStats.interactions[action]++;
        }
        
        // 메모리 관리 - 1000개 초과시 로그 정리 (최근 800개 유지)
        if (this.usageStats.panelActions.length > 1000) {
            this.usageStats.panelActions = this.usageStats.panelActions.slice(-800);
        }
        
        // 상태 업데이트 및 구독자 알림
        this.updateState('panelActionLogged', actionLog);
        
        console.log(`Panel Action Logged:`, action, panelId, metadata);
        
        return actionLog;
    }
    
    /**
     * 컴포넌트 상태 저장
     * @param {string} componentId - 컴포넌트 ID
     * @param {*} state - 컴포넌트 상태
     */
    saveComponentState(componentId, state) {
        const timestamp = Date.now();
        const componentState = {
            state,
            timestamp,
            lastAccessed: timestamp
        };
        
        this.usageStats.componentStates.set(componentId, componentState);
        this.updateState(`component_${componentId}`, componentState);
    }
    
    /**
     * 컴포넌트 상태 조회
     * @param {string} componentId - 컴포넌트 ID
     * @returns {*} 컴포넌트 상태
     */
    getComponentState(componentId) {
        const componentState = this.usageStats.componentStates.get(componentId);
        if (componentState) {
            // 접근 시간 업데이트
            componentState.lastAccessed = Date.now();
            return componentState.state;
        }
        return null;
    }
    
    /**
     * 사용량 통계 분석 결과 조회
     * @returns {Object} 분석된 사용량 데이터
     */
    getUsageAnalytics() {
        const now = Date.now();
        const sessionDuration = now - this.usageStats.sessionStart;
        
        // 액션별 통계
        const actionStats = {};
        this.usageStats.panelActions.forEach(log => {
            if (!actionStats[log.action]) {
                actionStats[log.action] = {
                    count: 0,
                    avgDuration: 0,
                    totalDuration: 0
                };
            }
            actionStats[log.action].count++;
            if (log.metadata.duration) {
                actionStats[log.action].totalDuration += log.metadata.duration;
                actionStats[log.action].avgDuration = actionStats[log.action].totalDuration / actionStats[log.action].count;
            }
        });
        
        // 최근 활동 (최근 10분간)
        const recentActions = this.usageStats.panelActions.filter(
            log => now - log.timestamp < 10 * 60 * 1000
        );
        
        return {
            sessionDuration,
            totalActions: this.usageStats.panelActions.length,
            interactions: this.usageStats.interactions,
            actionStats,
            recentActivity: {
                count: recentActions.length,
                actions: recentActions.map(log => ({
                    action: log.action,
                    panelId: log.panelId,
                    timestamp: log.timestamp
                }))
            },
            panelCount: this.panelStates.size,
            componentCount: this.usageStats.componentStates.size,
            generatedAt: new Date().toISOString()
        };
    }
    
    // ============================================================================
    // 성능 지표 수집
    // ============================================================================
    
    /**
     * 성능 지표 기록
     * @param {string} operation - 작업 유형
     * @param {Object} data - 지표 데이터
     */
    recordPerformanceMetric(operation, data) {
        const metric = {
            operation,
            timestamp: Date.now(),
            data
        };
        
        this.performanceMetrics.panelOperations.push(metric);
        
        // 메모리 관리 - 500개 초과시 지표를 정리 (최근 400개 유지)
        if (this.performanceMetrics.panelOperations.length > 500) {
            this.performanceMetrics.panelOperations = this.performanceMetrics.panelOperations.slice(-400);
        }
    }
    
    /**
     * 메모리 사용량 기록
     */
    recordMemoryUsage() {
        if (performance && performance.memory) {
            const memoryInfo = {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
                timestamp: Date.now()
            };
            
            this.performanceMetrics.memoryUsage.push(memoryInfo);
            
            // 메모리 관리
            if (this.performanceMetrics.memoryUsage.length > 100) {
                this.performanceMetrics.memoryUsage = this.performanceMetrics.memoryUsage.slice(-80);
            }
            
            this.updateState('memoryUsage', memoryInfo);
        }
    }
    
    /**
     * 성능 리포트 생성
     * @returns {Object} 성능 분석 데이터
     */
    getPerformanceReport() {
        return {
            panelOperations: this.performanceMetrics.panelOperations,
            memoryUsage: this.performanceMetrics.memoryUsage,
            generatedAt: new Date().toISOString()
        };
    }
    
    // ============================================================================
    // 유틸리티 메소드
    // ============================================================================
    
    /**
     * 상태 관리자 초기화 (개발/테스트용)
     */
    reset() {
        this.panelStates.clear();
        this.usageStats.panelActions = [];
        this.usageStats.componentStates.clear();
        this.usageStats.sessionStart = Date.now();
        this.usageStats.interactions = {
            minimize: 0,
            restore: 0,
            drag: 0,
            resize: 0,
            colorChange: 0
        };
        this.subscribers.clear();
        this.state.clear();
        this.performanceMetrics.panelOperations = [];
        this.performanceMetrics.memoryUsage = [];
        
        console.log('StateManager reset completed');
    }
    
    /**
     * 디버그 정보 출력
     */
    debug() {
        console.group('StateManager Debug Info');
        console.log('Panel States:', this.getAllPanelStates());
        console.log('Usage Analytics:', this.getUsageAnalytics());
        console.log('Performance Report:', this.getPerformanceReport());
        console.log('Current State:', new Map(this.state));
        console.log('Subscribers:', new Map(this.subscribers));
        console.groupEnd();
    }
}

// 싱글톤 인스턴스 생성 및 export
const stateManager = new StateManager();

// 메모리 사용량 주기적 수집 (30초마다)
setInterval(() => {
    stateManager.recordMemoryUsage();
}, 30000);

// 디버깅을 위한 전역 참조
window.stateManager = stateManager;
// console.log('StateManager instance created and exposed globally');

export default stateManager;