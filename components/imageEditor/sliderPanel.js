// components/imageEditor/sliderPanel.js

/**
 * Vertical slider panel for image adjustments
 * Shows sliders for brightness, contrast, saturation, hue, etc.
 */

import { adjustBrightness, adjustContrast, adjustHSL, applyBlur, applySharpen, applyColorFilter, resetFilters } from './tools/filters.js';

let sliderPanel;
let currentImage;
let originalValues = {};
let sliders = {};

export function init() {
    createSliderPanel();
    // console.log('Slider Panel initialized');
}

/**
 * Show the slider panel next to the selected image
 * @param {Konva.Image} imageNode - Selected image node
 * @param {string} mode - 'adjust' or 'filters'
 * @param {Object} imageRect - Image rectangle bounds
 */
export function showSliderPanel(imageNode, mode, imageRect) {
    if (!imageNode) return;
    
    currentImage = imageNode;
    storeOriginalValues();
    
    // Position panel to the right of the image
    const panelX = imageRect.x + imageRect.width + 20;
    const panelY = imageRect.y;
    
    sliderPanel.style.left = `${panelX}px`;
    sliderPanel.style.top = `${panelY}px`;
    sliderPanel.style.display = 'block';
    
    // Show appropriate sliders based on mode
    updateSliderVisibility(mode);
    updateSliderValues();
    
    // console.log(`Slider panel shown in ${mode} mode`);
}

/**
 * Hide the slider panel
 */
export function hideSliderPanel() {
    if (sliderPanel) {
        sliderPanel.style.display = 'none';
    }
}

/**
 * Create the main slider panel UI
 */
function createSliderPanel() {
    sliderPanel = document.createElement('div');
    sliderPanel.className = 'slider-panel';
    sliderPanel.style.cssText = `
        position: fixed;
        background: rgba(42, 48, 56, 0.95);
        border: 1px solid rgba(134, 142, 150, 0.3);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        padding: 16px;
        z-index: 1001;
        display: none;
        width: 280px;
        max-height: 80vh;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e8eaed;
    `;

    // Create sliders for different adjustments
    createAdjustmentSliders();
    createFilterSliders();
    createActionButtons();
    
    document.body.appendChild(sliderPanel);
}

/**
 * Create adjustment sliders (brightness, contrast, etc.)
 */
function createAdjustmentSliders() {
    const adjustSection = document.createElement('div');
    adjustSection.className = 'adjust-section';
    
    const title = document.createElement('h3');
    title.textContent = '조정';
    title.style.cssText = `
        margin: 0 0 16px 0;
        color: #e8eaed;
        font-size: 16px;
        font-weight: 600;
    `;
    adjustSection.appendChild(title);

    // Brightness slider
    sliders.brightness = createSlider('밝기', -1, 1, 0, 0.01, (value) => {
        adjustBrightness(currentImage, value);
    });
    adjustSection.appendChild(sliders.brightness.container);

    // Contrast slider
    sliders.contrast = createSlider('대비', -100, 100, 0, 1, (value) => {
        adjustContrast(currentImage, value);
    });
    adjustSection.appendChild(sliders.contrast.container);

    // Saturation slider
    sliders.saturation = createSlider('채도', -2, 10, 0, 0.1, (value) => {
        const hue = currentImage.hue() || 0;
        const luminance = currentImage.luminance() || 0;
        adjustHSL(currentImage, hue, value, luminance);
    });
    adjustSection.appendChild(sliders.saturation.container);

    // Hue slider
    sliders.hue = createSlider('색조', -180, 180, 0, 1, (value) => {
        const saturation = currentImage.saturation() || 0;
        const luminance = currentImage.luminance() || 0;
        adjustHSL(currentImage, value, saturation, luminance);
    });
    adjustSection.appendChild(sliders.hue.container);

    sliderPanel.appendChild(adjustSection);
}

/**
 * Create filter sliders (blur, sharpen, etc.)
 */
function createFilterSliders() {
    const filterSection = document.createElement('div');
    filterSection.className = 'filter-section';
    
    const title = document.createElement('h3');
    title.textContent = '필터';
    title.style.cssText = `
        margin: 20px 0 16px 0;
        color: #e8eaed;
        font-size: 16px;
        font-weight: 600;
    `;
    filterSection.appendChild(title);

    // Blur slider
    sliders.blur = createSlider('블러', 0, 10, 0, 0.1, (value) => {
        applyBlur(currentImage, value);
    });
    filterSection.appendChild(sliders.blur.container);

    // Sharpen slider
    sliders.sharpen = createSlider('선명도', 0, 1, 0, 0.01, (value) => {
        applySharpen(currentImage, value);
    });
    filterSection.appendChild(sliders.sharpen.container);

    // Color filter buttons
    const colorFilters = document.createElement('div');
    colorFilters.style.cssText = `
        margin: 12px 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

    const colorFilterLabel = document.createElement('div');
    colorFilterLabel.textContent = '색상 필터';
    colorFilterLabel.style.cssText = `
        color: #9aa0a6;
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
    `;
    colorFilters.appendChild(colorFilterLabel);

    const filterButtons = [
        { label: '원본', value: 'none' },
        { label: '흑백', value: 'grayscale' },
        { label: '세피아', value: 'sepia' },
        { label: '반전', value: 'invert' }
    ];

    sliders.colorFilter = { buttons: {}, activeFilter: 'none' };

    filterButtons.forEach(filter => {
        const button = document.createElement('button');
        button.textContent = filter.label;
        button.style.cssText = `
            background: #4a4a4a;
            color: #e8eaed;
            border: 1px solid #666;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            opacity: 0.7;
        `;

        button.addEventListener('click', () => {
            // Reset all buttons
            Object.values(sliders.colorFilter.buttons).forEach(btn => {
                btn.style.opacity = '0.7';
                btn.style.background = '#4a4a4a';
            });

            // Activate clicked button
            button.style.opacity = '1';
            button.style.background = '#6b6b6b';
            sliders.colorFilter.activeFilter = filter.value;

            if (filter.value === 'none') {
                // Remove color filters but keep other filters
                const currentFilters = currentImage.filters() || [];
                const filteredFilters = currentFilters.filter(f => 
                    f !== Konva.Filters.Grayscale && 
                    f !== Konva.Filters.Sepia && 
                    f !== Konva.Filters.Invert
                );
                currentImage.filters(filteredFilters);
                currentImage.cache();
                currentImage.getLayer().batchDraw();
            } else {
                applyColorFilter(currentImage, filter.value);
            }
        });

        sliders.colorFilter.buttons[filter.value] = button;
        colorFilters.appendChild(button);
    });

    // Set default active button
    sliders.colorFilter.buttons['none'].style.opacity = '1';
    sliders.colorFilter.buttons['none'].style.background = '#6b6b6b';

    filterSection.appendChild(colorFilters);
    sliderPanel.appendChild(filterSection);
}

/**
 * Create action buttons (Apply, Cancel)
 */
function createActionButtons() {
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
        margin-top: 24px;
        display: flex;
        gap: 12px;
        justify-content: center;
    `;

    // Apply button
    const applyButton = document.createElement('button');
    applyButton.textContent = '적용';
    applyButton.style.cssText = `
        background: #4CAF50;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
        min-width: 60px;
    `;

    applyButton.addEventListener('mouseenter', () => {
        applyButton.style.background = '#45a049';
        applyButton.style.transform = 'translateY(-1px)';
        applyButton.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
    });

    applyButton.addEventListener('mouseleave', () => {
        applyButton.style.background = '#4CAF50';
        applyButton.style.transform = 'translateY(0)';
        applyButton.style.boxShadow = 'none';
    });

    applyButton.addEventListener('click', () => {
        // Clear stored original values (accept changes)
        originalValues = {};
        hideSliderPanel();
        // console.log('Changes applied');
    });

    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = '취소';
    cancelButton.style.cssText = `
        background: #f44336;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
        min-width: 60px;
    `;

    cancelButton.addEventListener('mouseenter', () => {
        cancelButton.style.background = '#da190b';
        cancelButton.style.transform = 'translateY(-1px)';
        cancelButton.style.boxShadow = '0 4px 12px rgba(244, 67, 54, 0.3)';
    });

    cancelButton.addEventListener('mouseleave', () => {
        cancelButton.style.background = '#f44336';
        cancelButton.style.transform = 'translateY(0)';
        cancelButton.style.boxShadow = 'none';
    });

    cancelButton.addEventListener('click', () => {
        restoreOriginalValues();
        hideSliderPanel();
        // console.log('Changes cancelled');
    });

    buttonsContainer.appendChild(applyButton);
    buttonsContainer.appendChild(cancelButton);
    sliderPanel.appendChild(buttonsContainer);
}

/**
 * Create a slider control
 * @param {string} label - Slider label
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} defaultValue - Default value
 * @param {number} step - Step size
 * @param {Function} onChange - Change callback
 * @returns {Object} Slider object with container and input elements
 */
function createSlider(label, min, max, defaultValue, step, onChange) {
    const container = document.createElement('div');
    container.style.cssText = `
        margin: 12px 0;
        opacity: 1;
        transition: opacity 0.2s;
    `;

    const labelElement = document.createElement('div');
    labelElement.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
    `;

    const labelText = document.createElement('span');
    labelText.textContent = label;
    labelText.style.cssText = `
        color: #9aa0a6;
        font-size: 13px;
        font-weight: 500;
    `;

    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = defaultValue;
    valueDisplay.style.cssText = `
        color: #e8eaed;
        font-size: 12px;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        min-width: 35px;
        text-align: center;
    `;

    labelElement.appendChild(labelText);
    labelElement.appendChild(valueDisplay);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = defaultValue;
    slider.style.cssText = `
        width: 100%;
        height: 4px;
        border-radius: 2px;
        background: #444;
        outline: none;
        -webkit-appearance: none;
    `;

    // Webkit slider thumb styling
    const style = document.createElement('style');
    style.textContent = `
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4CAF50;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            transition: all 0.2s;
        }
        input[type="range"]::-webkit-slider-thumb:hover {
            background: #45a049;
            transform: scale(1.1);
        }
        input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4CAF50;
            cursor: pointer;
            border: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
    `;
    document.head.appendChild(style);

    slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        valueDisplay.textContent = step < 1 ? value.toFixed(2) : Math.round(value);
        onChange(value);
    });

    container.appendChild(labelElement);
    container.appendChild(slider);

    return { container, input: slider, valueDisplay, onChange };
}

/**
 * Update slider visibility based on mode
 * @param {string} mode - 'adjust' or 'filters'
 */
function updateSliderVisibility(mode) {
    const adjustSection = sliderPanel.querySelector('.adjust-section');
    const filterSection = sliderPanel.querySelector('.filter-section');

    if (mode === 'adjust') {
        adjustSection.style.display = 'block';
        filterSection.style.display = 'none';
    } else if (mode === 'filters') {
        adjustSection.style.display = 'none';
        filterSection.style.display = 'block';
    } else {
        // Show both for comprehensive editing
        adjustSection.style.display = 'block';
        filterSection.style.display = 'block';
    }
}

/**
 * Store original values for cancel functionality
 */
function storeOriginalValues() {
    if (!currentImage) return;

    originalValues = {
        brightness: currentImage.brightness() || 0,
        contrast: currentImage.contrast() || 0,
        saturation: currentImage.saturation() || 0,
        hue: currentImage.hue() || 0,
        blurRadius: currentImage.blurRadius() || 0,
        enhance: currentImage.enhance() || 0,
        filters: [...(currentImage.filters() || [])]
    };
}

/**
 * Update slider values to match current image state
 */
function updateSliderValues() {
    if (!currentImage) return;

    if (sliders.brightness) {
        const brightness = currentImage.brightness() || 0;
        sliders.brightness.input.value = brightness;
        sliders.brightness.valueDisplay.textContent = brightness.toFixed(2);
    }

    if (sliders.contrast) {
        const contrast = currentImage.contrast() || 0;
        sliders.contrast.input.value = contrast;
        sliders.contrast.valueDisplay.textContent = Math.round(contrast);
    }

    if (sliders.saturation) {
        const saturation = currentImage.saturation() || 0;
        sliders.saturation.input.value = saturation;
        sliders.saturation.valueDisplay.textContent = saturation.toFixed(1);
    }

    if (sliders.hue) {
        const hue = currentImage.hue() || 0;
        sliders.hue.input.value = hue;
        sliders.hue.valueDisplay.textContent = Math.round(hue);
    }

    if (sliders.blur) {
        const blur = currentImage.blurRadius() || 0;
        sliders.blur.input.value = blur;
        sliders.blur.valueDisplay.textContent = blur.toFixed(1);
    }

    if (sliders.sharpen) {
        const sharpen = currentImage.enhance() || 0;
        sliders.sharpen.input.value = sharpen;
        sliders.sharpen.valueDisplay.textContent = sharpen.toFixed(2);
    }

    // Update color filter buttons
    if (sliders.colorFilter) {
        const currentFilters = currentImage.filters() || [];
        let activeFilter = 'none';
        
        if (currentFilters.includes(Konva.Filters.Grayscale)) activeFilter = 'grayscale';
        else if (currentFilters.includes(Konva.Filters.Sepia)) activeFilter = 'sepia';
        else if (currentFilters.includes(Konva.Filters.Invert)) activeFilter = 'invert';

        // Reset all buttons
        Object.values(sliders.colorFilter.buttons).forEach(btn => {
            btn.style.opacity = '0.7';
            btn.style.background = '#4a4a4a';
        });

        // Activate current filter button
        if (sliders.colorFilter.buttons[activeFilter]) {
            sliders.colorFilter.buttons[activeFilter].style.opacity = '1';
            sliders.colorFilter.buttons[activeFilter].style.background = '#6b6b6b';
        }

        sliders.colorFilter.activeFilter = activeFilter;
    }
}

/**
 * Restore original values (cancel changes)
 */
function restoreOriginalValues() {
    if (!currentImage || !originalValues) return;

    currentImage.brightness(originalValues.brightness);
    currentImage.contrast(originalValues.contrast);
    currentImage.saturation(originalValues.saturation);
    currentImage.hue(originalValues.hue);
    currentImage.blurRadius(originalValues.blurRadius);
    currentImage.enhance(originalValues.enhance);
    currentImage.filters(originalValues.filters);
    currentImage.cache();
    currentImage.getLayer().batchDraw();

    updateSliderValues();
}