/**
 * ScaleSlider - UI Scale 조정 슬라이더 컴포넌트
 * 우상단에 접기/펼치기 가능한 슬라이더로 전체 UI 크기 조정
 */

export class ScaleSlider {
    constructor() {
        this.scale = this.loadScale();
        this.isExpanded = false;
        this.init();
    }

    init() {
        this.createSlider();
        this.applyScale(this.scale);
        this.setupEvents();
    }

    createSlider() {
        // 컨테이너
        const container = document.createElement('div');
        container.id = 'scale-slider-container';
        container.className = 'scale-slider-container collapsed';
        container.innerHTML = `
            <!-- 접힌 상태 버튼 -->
            <button class="scale-toggle-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
                </svg>
                <span class="scale-value">${Math.round(this.scale * 100)}%</span>
            </button>

            <!-- 펼쳐진 상태 패널 -->
            <div class="scale-panel">
                <label class="scale-label">UI Scale</label>
                <input type="range"
                       class="scale-range"
                       min="50"
                       max="150"
                       step="5"
                       value="${this.scale * 100}">
                <span class="scale-display">${this.scale.toFixed(2)}x</span>
                <button class="scale-close-btn" title="Close">×</button>
            </div>
        `;

        document.body.appendChild(container);

        // CSS 스타일 주입
        this.injectStyles();
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .scale-slider-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 12px;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            /* 접힌 상태 버튼 */
            .scale-toggle-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                border-radius: 20px;
                color: white;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                transition: all 0.3s ease;
            }

            .scale-toggle-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
            }

            .scale-toggle-btn svg {
                width: 16px;
                height: 16px;
            }

            .scale-value {
                font-variant-numeric: tabular-nums;
                min-width: 40px;
                text-align: right;
            }

            /* 펼쳐진 상태 패널 */
            .scale-panel {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 20px;
                background: rgba(37, 42, 51, 0.95);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(108, 182, 255, 0.2);
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                opacity: 0;
                transform: translateX(20px);
                pointer-events: none;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .scale-slider-container.expanded .scale-panel {
                opacity: 1;
                transform: translateX(0);
                pointer-events: all;
            }

            .scale-slider-container.collapsed .scale-panel {
                opacity: 0;
                transform: translateX(20px);
                pointer-events: none;
            }

            /* 접힌 상태일 때 토글 버튼만 표시 */
            .scale-slider-container.collapsed .scale-toggle-btn {
                opacity: 1;
            }

            .scale-label {
                color: #a0aec0;
                font-size: 12px;
                font-weight: 500;
                white-space: nowrap;
            }

            /* 슬라이더 스타일 */
            .scale-range {
                width: 180px;
                height: 6px;
                background: linear-gradient(to right,
                    #ef4444 0%,
                    #f59e0b 25%,
                    #10b981 50%,
                    #3b82f6 75%,
                    #8b5cf6 100%
                );
                border-radius: 3px;
                outline: none;
                -webkit-appearance: none;
                cursor: pointer;
            }

            .scale-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                background: white;
                border: 2px solid #667eea;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                transition: all 0.2s ease;
            }

            .scale-range::-webkit-slider-thumb:hover {
                transform: scale(1.2);
                box-shadow: 0 3px 12px rgba(102, 126, 234, 0.5);
            }

            .scale-range::-moz-range-thumb {
                width: 18px;
                height: 18px;
                background: white;
                border: 2px solid #667eea;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                transition: all 0.2s ease;
            }

            .scale-range::-moz-range-thumb:hover {
                transform: scale(1.2);
                box-shadow: 0 3px 12px rgba(102, 126, 234, 0.5);
            }

            .scale-display {
                color: #6cb6ff;
                font-size: 14px;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                min-width: 45px;
                text-align: right;
            }

            /* 닫기 버튼 */
            .scale-close-btn {
                width: 24px;
                height: 24px;
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 50%;
                color: #ef4444;
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
                transition: all 0.2s ease;
                padding: 0;
            }

            .scale-close-btn:hover {
                background: rgba(239, 68, 68, 0.2);
                border-color: #ef4444;
                transform: rotate(90deg);
            }

            /* 반응형: 작은 화면 */
            @media (max-width: 768px) {
                .scale-slider-container {
                    top: 10px;
                    right: 10px;
                }

                .scale-panel {
                    padding: 8px 12px;
                }

                .scale-range {
                    width: 120px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    setupEvents() {
        const container = document.getElementById('scale-slider-container');
        const toggleBtn = container.querySelector('.scale-toggle-btn');
        const closeBtn = container.querySelector('.scale-close-btn');
        const slider = container.querySelector('.scale-range');
        const display = container.querySelector('.scale-display');
        const valueSpan = container.querySelector('.scale-value');

        // 토글 버튼 클릭
        toggleBtn.addEventListener('click', () => {
            this.isExpanded = !this.isExpanded;
            container.classList.toggle('expanded', this.isExpanded);
            container.classList.toggle('collapsed', !this.isExpanded);
        });

        // 닫기 버튼
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.isExpanded = false;
            container.classList.remove('expanded');
            container.classList.add('collapsed');
        });

        // 슬라이더 드래그 중 (실시간 적용)
        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value) / 100;
            this.scale = value;
            display.textContent = value.toFixed(2) + 'x';
            valueSpan.textContent = Math.round(value * 100) + '%';
            this.applyScale(value);
        });

        // 슬라이더 드래그 완료 (localStorage 저장)
        slider.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value) / 100;
            this.saveScale(value);
        });

        // ESC 키로 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isExpanded) {
                this.isExpanded = false;
                container.classList.remove('expanded');
                container.classList.add('collapsed');
            }
        });

        // 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (this.isExpanded && !container.contains(e.target)) {
                this.isExpanded = false;
                container.classList.remove('expanded');
                container.classList.add('collapsed');
            }
        });
    }

    applyScale(scale) {
        // CSS 변수 업데이트
        document.documentElement.style.setProperty('--ui-scale', scale);

        // 이벤트 발생 (다른 컴포넌트가 반응할 수 있도록)
        window.dispatchEvent(new CustomEvent('ui-scale-changed', {
            detail: { scale }
        }));

        console.log(`✨ UI Scale applied: ${scale.toFixed(2)}x`);
    }

    loadScale() {
        try {
            const saved = localStorage.getItem('cubestudio_ui_scale');
            return saved ? parseFloat(saved) : 1.0;
        } catch {
            return 1.0;
        }
    }

    saveScale(scale) {
        try {
            localStorage.setItem('cubestudio_ui_scale', scale);
            console.log(`✅ UI Scale saved: ${scale.toFixed(2)}x`);
        } catch (error) {
            console.error('Failed to save UI scale:', error);
        }
    }
}
