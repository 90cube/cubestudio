// core/imageSettings.js

/**
 * 이미지 저장 설정 관리자
 * 다양한 이미지 타입별 저장 경로와 파일명 패턴을 관리합니다.
 */

class ImageSettings {
    constructor() {
        this.defaultSettings = {
            // 기본 출력 경로들
            paths: {
                t2i: './output/t2i',              // 텍스트 투 이미지
                i2i: './output/i2i',              // 이미지 투 이미지  
                detail: './output/detail',         // 디테일러 후처리
                upscaled: './output/upscaled',     // 업스케일
                preprocessor: './output/preprocessor', // 전처리
                controlnet: './output/controlnet', // ControlNet
                custom: './output/custom'          // 커스텀
            },
            
            // 파일명 패턴 (날짜/시간 치환 지원)
            filename_patterns: {
                t2i: '[model]_[seed]_%%YYYYMMDD_%%HHMMSS',
                i2i: 'i2i_[seed]_%%YYYYMMDD_%%HHMMSS', 
                detail: 'detail_%%YYYYMMDD_%%HHMMSS',
                upscaled: 'upscaled_[scale]x_%%YYYYMMDD_%%HHMMSS',
                preprocessor: '[type]_%%YYYYMMDD_%%HHMMSS',
                controlnet: 'cn_[type]_%%YYYYMMDD_%%HHMMSS',
                custom: 'custom_%%YYYYMMDD_%%HHMMSS'
            },
            
            // 이미지 품질 설정
            quality: {
                format: 'png',        // png, jpg, webp
                png_compression: 6,   // 0-9 (0=fast, 9=small)
                jpg_quality: 90,      // 1-100
                webp_quality: 90,     // 1-100
                save_metadata: true   // EXIF 메타데이터 포함 여부
            },
            
            // 자동 저장 설정
            auto_save: {
                enabled: true,
                save_on_generate: true,
                save_on_upscale: true,
                save_on_detail: true,
                create_backup: false
            },
            
            // 고급 설정
            advanced: {
                use_sequential_numbering: false,
                max_filename_length: 200,
                sanitize_filenames: true,
                create_date_folders: true,     // YYYY/MM/DD 폴더 구조
                duplicate_handling: 'rename'   // rename, overwrite, skip
            }
        };
        
        this.customSettings = this.loadCustomSettings();
    }
    
    /**
     * 커스텀 설정 로드 (localStorage에서)
     */
    loadCustomSettings() {
        try {
            const stored = localStorage.getItem('cubestudio_image_settings');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.warn('Failed to load image settings:', error);
            return {};
        }
    }
    
    /**
     * 커스텀 설정 저장
     */
    saveCustomSettings() {
        try {
            localStorage.setItem('cubestudio_image_settings', JSON.stringify(this.customSettings));
            console.log('✅ 이미지 설정이 저장되었습니다.');
        } catch (error) {
            console.error('Failed to save image settings:', error);
        }
    }
    
    /**
     * 설정값 가져오기 (deep merge)
     * @param {string} key - 설정 키 (점 표기법 지원, 예: 'paths.t2i')
     * @returns {any} 설정값
     */
    get(key = null) {
        const settings = this.mergeSettings(this.defaultSettings, this.customSettings);
        
        if (!key) {
            return settings;
        }
        
        // 점 표기법으로 중첩된 객체 접근
        return key.split('.').reduce((obj, k) => obj && obj[k], settings);
    }
    
    /**
     * 설정값 설정하기
     * @param {string} key - 설정 키 (점 표기법 지원)
     * @param {any} value - 설정값
     */
    set(key, value) {
        const keys = key.split('.');
        let target = this.customSettings;
        
        // 중첩된 객체 구조 생성
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in target) || typeof target[keys[i]] !== 'object') {
                target[keys[i]] = {};
            }
            target = target[keys[i]];
        }
        
        target[keys[keys.length - 1]] = value;
        this.saveCustomSettings();
    }
    
    /**
     * 특정 이미지 타입의 저장 경로 가져오기
     * @param {string} type - 이미지 타입 (t2i, detail, upscaled 등)
     * @returns {string} 저장 경로
     */
    getPath(type) {
        return this.get(`paths.${type}`) || this.get('paths.custom');
    }
    
    /**
     * 특정 이미지 타입의 파일명 패턴 가져오기
     * @param {string} type - 이미지 타입
     * @returns {string} 파일명 패턴
     */
    getFilenamePattern(type) {
        return this.get(`filename_patterns.${type}`) || this.get('filename_patterns.custom');
    }
    
    /**
     * 파일명 생성
     * @param {string} type - 이미지 타입
     * @param {Object} variables - 치환할 변수들
     * @returns {string} 생성된 파일명
     */
    generateFilename(type, variables = {}) {
        const pattern = this.getFilenamePattern(type);
        let filename = pattern;
        
        // 날짜/시간 치환
        const now = new Date();
        const dateReplacements = {
            '%%YYYY': now.getFullYear().toString(),
            '%%YY': now.getFullYear().toString().slice(2),
            '%%MM': (now.getMonth() + 1).toString().padStart(2, '0'),
            '%%DD': now.getDate().toString().padStart(2, '0'),
            '%%HH': now.getHours().toString().padStart(2, '0'),
            '%%mm': now.getMinutes().toString().padStart(2, '0'),
            '%%SS': now.getSeconds().toString().padStart(2, '0'),
            '%%YYYYMMDD': `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`,
            '%%HHMMSS': `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
        };
        
        // 날짜/시간 치환 적용
        for (const [placeholder, value] of Object.entries(dateReplacements)) {
            filename = filename.replace(new RegExp(placeholder, 'g'), value);
        }
        
        // 변수 치환 ([변수명] 형태)
        for (const [varName, varValue] of Object.entries(variables)) {
            const placeholder = `[${varName}]`;
            filename = filename.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), varValue || 'unknown');
        }
        
        // 파일명 정리
        if (this.get('advanced.sanitize_filenames')) {
            filename = this.sanitizeFilename(filename);
        }
        
        // 최대 길이 제한
        const maxLength = this.get('advanced.max_filename_length');
        if (filename.length > maxLength) {
            const extension = this.getFileExtension();
            filename = filename.substring(0, maxLength - extension.length - 1) + extension;
        }
        
        return filename + this.getFileExtension();
    }
    
    /**
     * 저장 경로와 파일명을 포함한 전체 경로 생성
     * @param {string} type - 이미지 타입
     * @param {Object} variables - 파일명 변수들
     * @returns {string} 전체 저장 경로
     */
    getFullSavePath(type, variables = {}) {
        const basePath = this.getPath(type);
        const filename = this.generateFilename(type, variables);
        
        // 날짜 폴더 생성 옵션
        if (this.get('advanced.create_date_folders')) {
            const now = new Date();
            const dateFolder = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}`;
            return `${basePath}/${dateFolder}/${filename}`;
        }
        
        return `${basePath}/${filename}`;
    }
    
    /**
     * 파일 확장자 가져오기
     * @returns {string} 파일 확장자 (.png, .jpg 등)
     */
    getFileExtension() {
        const format = this.get('quality.format');
        switch (format) {
            case 'jpg':
            case 'jpeg':
                return '.jpg';
            case 'webp':
                return '.webp';
            case 'png':
            default:
                return '.png';
        }
    }
    
    /**
     * 파일명 정리 (특수문자 제거/치환)
     * @param {string} filename - 원본 파일명
     * @returns {string} 정리된 파일명
     */
    sanitizeFilename(filename) {
        return filename
            .replace(/[<>:"/\\|?*]/g, '_')  // Windows 금지 문자들
            .replace(/\s+/g, '_')          // 공백을 언더스코어로
            .replace(/_{2,}/g, '_')        // 연속된 언더스코어 정리
            .replace(/^_|_$/g, '');        // 앞뒤 언더스코어 제거
    }
    
    /**
     * 설정 초기화 (기본값으로 재설정)
     * @param {string} section - 특정 섹션만 초기화 (선택사항)
     */
    reset(section = null) {
        if (section) {
            delete this.customSettings[section];
        } else {
            this.customSettings = {};
        }
        this.saveCustomSettings();
    }
    
    /**
     * 두 설정 객체를 깊게 병합
     */
    mergeSettings(defaults, custom) {
        const result = JSON.parse(JSON.stringify(defaults));
        
        function deepMerge(target, source) {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    target[key] = target[key] || {};
                    deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
        
        deepMerge(result, custom);
        return result;
    }
    
    /**
     * 현재 설정을 JSON으로 내보내기
     * @returns {string} JSON 문자열
     */
    exportSettings() {
        return JSON.stringify(this.customSettings, null, 2);
    }
    
    /**
     * JSON에서 설정 가져오기
     * @param {string} jsonString - JSON 문자열
     */
    importSettings(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.customSettings = imported;
            this.saveCustomSettings();
            return true;
        } catch (error) {
            console.error('Failed to import settings:', error);
            return false;
        }
    }
    
    /**
     * 설정 유효성 검사
     * @returns {Array} 문제점 목록
     */
    validateSettings() {
        const issues = [];
        const settings = this.get();
        
        // 경로 유효성 검사
        for (const [type, path] of Object.entries(settings.paths)) {
            if (!path || typeof path !== 'string') {
                issues.push(`Invalid path for ${type}: ${path}`);
            }
        }
        
        // 품질 설정 검사
        const quality = settings.quality;
        if (quality.jpg_quality < 1 || quality.jpg_quality > 100) {
            issues.push(`Invalid JPG quality: ${quality.jpg_quality} (should be 1-100)`);
        }
        
        if (quality.webp_quality < 1 || quality.webp_quality > 100) {
            issues.push(`Invalid WebP quality: ${quality.webp_quality} (should be 1-100)`);
        }
        
        if (quality.png_compression < 0 || quality.png_compression > 9) {
            issues.push(`Invalid PNG compression: ${quality.png_compression} (should be 0-9)`);
        }
        
        return issues;
    }
}

// 전역 인스턴스 생성
const imageSettings = new ImageSettings();

export default imageSettings;