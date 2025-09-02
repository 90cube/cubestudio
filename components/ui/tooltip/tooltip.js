export class Tooltip {
    constructor() {
        this.tooltipElement = null;
        this.boundUpdatePosition = this._updatePosition.bind(this);
    }

    _createTooltipElement() {
        const tooltip = document.createElement('div');
        tooltip.className = 'cubestudio-tooltip';
        document.body.appendChild(tooltip);
        return tooltip;
    }

    _applyStyles() {
        if (document.getElementById('cubestudio-tooltip-styles')) return;

        const style = document.createElement('style');
        style.id = 'cubestudio-tooltip-styles';
        style.textContent = `
            .cubestudio-tooltip {
                position: fixed;
                z-index: 1100;
                border: 1px solid rgba(134, 142, 150, 0.3);
                background: rgba(32, 35, 42, 0.95);
                backdrop-filter: blur(10px);
                padding: 8px;
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
                transform-origin: var(--transform-origin);
                animation: fadeIn 0.2s ease-out forwards;
            }

            .cubestudio-tooltip img {
                max-width: 256px;
                max-height: 256px;
                width: auto;
                height: auto;
                display: block;
                border-radius: 4px;
            }

            .cubestudio-tooltip .tooltip-caption {
                max-width: 256px;
                padding: 6px 4px 2px;
                color: #e8eaed;
                font-size: 12px;
                text-align: center;
                word-break: break-all;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    show(content, event) {
        this._applyStyles();
        
        if (!this.tooltipElement) {
            this.tooltipElement = this._createTooltipElement();
        }

        this.tooltipElement.innerHTML = content;
        this._updatePosition(event);

        document.addEventListener('mousemove', this.boundUpdatePosition);
    }

    hide() {
        if (this.tooltipElement) {
            this.tooltipElement.style.opacity = '0';
            setTimeout(() => {
                if (this.tooltipElement) {
                    this.tooltipElement.remove();
                    this.tooltipElement = null;
                }
            }, 200);
        }
        document.removeEventListener('mousemove', this.boundUpdatePosition);
    }

    _updatePosition(event) {
        if (!this.tooltipElement) return;

        const mouseX = event.clientX;
        const mouseY = event.clientY;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const tooltipRect = this.tooltipElement.getBoundingClientRect();
        let offsetX, offsetY;
        let transformOrigin = '';

        // 화면 중심 기준으로 마우스 위치 판단
        if (mouseX < centerX && mouseY < centerY) {
            // 좌상단 → 툴팁은 마우스 기준 우하단
            offsetX = 20;
            offsetY = 20;
            transformOrigin = 'top left';
        } else if (mouseX >= centerX && mouseY < centerY) {
            // 우상단 → 툴팁은 마우스 기준 좌하단
            offsetX = -tooltipRect.width - 20;
            offsetY = 20;
            transformOrigin = 'top right';
        } else if (mouseX < centerX && mouseY >= centerY) {
            // 좌하단 → 툴팁은 마우스 기준 우상단
            offsetX = 20;
            offsetY = -tooltipRect.height - 20;
            transformOrigin = 'bottom left';
        } else {
            // 우하단 → 툴팁은 마우스 기준 좌상단
            offsetX = -tooltipRect.width - 20;
            offsetY = -tooltipRect.height - 20;
            transformOrigin = 'bottom right';
        }

        let newX = mouseX + offsetX;
        let newY = mouseY + offsetY;

        // 화면 경계 체크
        if (newX < 0) newX = 10;
        if (newX + tooltipRect.width > window.innerWidth) newX = window.innerWidth - tooltipRect.width - 10;
        if (newY < 0) newY = 10;
        if (newY + tooltipRect.height > window.innerHeight) newY = window.innerHeight - tooltipRect.height - 10;

        this.tooltipElement.style.setProperty('--transform-origin', transformOrigin);
        this.tooltipElement.style.left = `${newX}px`;
        this.tooltipElement.style.top = `${newY}px`;
        this.tooltipElement.style.opacity = '1';
    }
}
