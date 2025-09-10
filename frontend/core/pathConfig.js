// core/pathConfig.js

/**
 * 경로 설정 관리자
 * 프로젝트의 모든 출력 경로를 중앙에서 관리합니다.
 */

class PathConfig {
    constructor() {
        this.defaultPaths = {
            preprocessor: './output/preprocessor',
            generation: './output/generation',
            cache: './output/cache',
            temp: './output/temp'
        };
        
        this.customPaths = this.loadCustomPaths();
        this.ensureDirectories();
    }
    
    /**
     * 커스텀 경로 설정 로드 (localStorage에서)
     */
    loadCustomPaths() {
        try {
            const stored = localStorage.getItem('cubestudio_paths');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.warn('Failed to load custom paths:', error);
            return {};
        }
    }
    
    /**
     * 커스텀 경로 설정 저장
     */
    saveCustomPaths() {
        try {
            localStorage.setItem('cubestudio_paths', JSON.stringify(this.customPaths));
        } catch (error) {
            console.error('Failed to save custom paths:', error);
        }
    }
    
    /**
     * 특정 타입의 경로 가져오기
     * @param {string} type - 경로 타입 (preprocessor, generation, cache, temp)
     * @returns {string} 경로
     */
    getPath(type) {
        return this.customPaths[type] || this.defaultPaths[type];
    }
    
    /**
     * 전처리기 출력 경로 가져오기
     * @returns {string} 전처리기 출력 경로
     */
    getPreprocessorPath() {
        return this.getPath('preprocessor');
    }
    
    /**
     * 커스텀 경로 설정
     * @param {string} type - 경로 타입
     * @param {string} path - 설정할 경로
     */
    setPath(type, path) {
        if (!path || path.trim() === '') {
            delete this.customPaths[type];
        } else {
            this.customPaths[type] = path;
        }
        this.saveCustomPaths();
    }
    
    /**
     * 전처리기 출력 경로 설정
     * @param {string} path - 설정할 경로
     */
    setPreprocessorPath(path) {
        this.setPath('preprocessor', path);
    }
    
    /**
     * 기본 경로로 재설정
     * @param {string} type - 경로 타입
     */
    resetPath(type) {
        delete this.customPaths[type];
        this.saveCustomPaths();
    }
    
    /**
     * 모든 경로를 기본값으로 재설정
     */
    resetAllPaths() {
        this.customPaths = {};
        this.saveCustomPaths();
    }
    
    /**
     * 현재 설정된 모든 경로 반환
     * @returns {Object} 경로 설정 객체
     */
    getAllPaths() {
        const paths = {};
        for (const type in this.defaultPaths) {
            paths[type] = this.getPath(type);
        }
        return paths;
    }
    
    /**
     * 절대 경로로 변환
     * @param {string} path - 변환할 경로
     * @returns {string} 절대 경로
     */
    toAbsolute(path) {
        if (!path) return '';
        
        // 이미 절대 경로인 경우
        if (path.startsWith('/') || /^[A-Z]:\\/.test(path)) {
            return path;
        }
        
        // 상대 경로를 절대 경로로 변환
        const baseUrl = window.location.origin;
        const basePath = window.location.pathname.replace('/index.html', '').replace(/\/$/, '');
        return `${baseUrl}${basePath}/${path}`;
    }
    
    /**
     * 디렉토리 존재 확인 (브라우저에서는 실제 생성 불가)
     */
    ensureDirectories() {
        // 브라우저 환경에서는 실제 디렉토리 생성 불가
        // 추후 Electron 등으로 확장할 때 실제 구현
        console.log('📁 Path configuration initialized:', this.getAllPaths());
    }
    
    /**
     * 파일명 생성 헬퍼
     * @param {string} prefix - 파일명 접두사
     * @param {string} extension - 파일 확장자 (점 포함)
     * @returns {string} 생성된 파일명
     */
    generateFilename(prefix = 'processed', extension = '.png') {
        const timestamp = new Date().toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .substring(0, 19);
        return `${prefix}_${timestamp}${extension}`;
    }
    
    /**
     * 전체 파일 경로 생성
     * @param {string} type - 경로 타입
     * @param {string} filename - 파일명
     * @returns {string} 전체 파일 경로
     */
    getFullPath(type, filename) {
        const basePath = this.getPath(type);
        return `${basePath}/${filename}`;
    }
}

// 전역 인스턴스 생성
const pathConfig = new PathConfig();

export default pathConfig;