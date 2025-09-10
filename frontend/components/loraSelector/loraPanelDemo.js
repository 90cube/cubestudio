// components/loraSelector/loraPanelDemo.js

/**
 * LoRA 선택기 플로팅 패널 데모
 * 플로팅 패널 시스템과 LoRA 선택기 컴포넌트 연동 예시
 */

import { createFloatingPanel } from '../ui/floatingPanel/floatingPanel.js';
import { LoRASelectorComponent } from './loraSelector.js';

/**
 * LoRA 선택기 플로팅 패널 생성
 * @param {Object} options - 패널 생성 옵션
 * @returns {Object} { panel, loraComponent } 객체 반환
 */
export function createLoRASelectorPanel(options = {}) {
    // 기본 옵션 설정
    const defaultOptions = {
        id: 'lora-selector-panel',
        title: '🎨 LoRA Selector',
        x: 100,
        y: 100,
        width: 380,
        height: 600,
        markingColor: '#9b59b6', // 보라색 테마
        resizable: true,
        draggable: true,
        dotStyle: 'hexagon',
        dotSize: 28
    };
    
    // 옵션 병합
    const finalOptions = { ...defaultOptions, ...options };
    
    // 플로팅 패널 생성
    const panel = createFloatingPanel(finalOptions);
    
    // LoRA 선택기 컴포넌트 생성
    const loraComponent = new LoRASelectorComponent();
    
    // 패널에 LoRA 선택기 추가
    panel.addComponent('loraSelector', loraComponent);
    
    // LoRA 선택 변경 이벤트 리스너
    document.addEventListener('loraSelector:changed', (e) => {
        console.log('🎯 LoRA selection changed:', e.detail.selectedLoRAs);
        
        // 패널 제목에 선택된 LoRA 개수 표시
        const count = e.detail.selectedLoRAs.length;
        const baseTitle = finalOptions.title.replace(/ \(\d+\)$/, ''); // 기존 카운트 제거
        panel.setTitle(count > 0 ? `${baseTitle} (${count})` : baseTitle);
        
        // 커스텀 이벤트 재발송 (다른 컴포넌트에서 사용할 수 있도록)
        document.dispatchEvent(new CustomEvent('loraPanelDemo:selectionChanged', {
            detail: {
                panelId: panel.id,
                selectedLoRAs: e.detail.selectedLoRAs,
                count: count
            }
        }));
    });
    
    return {
        panel,
        loraComponent
    };
}

/**
 * 다중 LoRA 패널 데모 실행
 */
export function runMultiLoRAPanelDemo() {
    console.log('🚀 Starting Multi-LoRA Panel Demo...');
    
    // 첫 번째 LoRA 패널 (메인)
    const { panel: panel1, loraComponent: lora1 } = createLoRASelectorPanel({
        id: 'main-lora-panel',
        title: '🎨 Main LoRA Selector',
        x: 120,
        y: 120,
        width: 400,
        height: 650,
        markingColor: '#e74c3c', // 빨간색
        dotStyle: 'circle'
    });
    
    // 두 번째 LoRA 패널 (보조)
    const { panel: panel2, loraComponent: lora2 } = createLoRASelectorPanel({
        id: 'secondary-lora-panel',
        title: '🎭 Secondary LoRA',
        x: 540,
        y: 160,
        width: 350,
        height: 550,
        markingColor: '#2ecc71', // 녹색
        dotStyle: 'diamond'
    });
    
    // 세 번째 LoRA 패널 (실험용)
    const { panel: panel3, loraComponent: lora3 } = createLoRASelectorPanel({
        id: 'experimental-lora-panel',
        title: '🔬 Experimental LoRA',
        x: 910,
        y: 200,
        width: 320,
        height: 480,
        markingColor: '#f39c12', // 주황색
        dotStyle: 'pill'
    });
    
    // 패널간 LoRA 공유 기능 추가
    setupLoRAPanelSharing([
        { panel: panel1, component: lora1, name: 'Main' },
        { panel: panel2, component: lora2, name: 'Secondary' },
        { panel: panel3, component: lora3, name: 'Experimental' }
    ]);
    
    // 글로벌 이벤트 리스너
    setupGlobalLoRAEventListeners();
    
    console.log('✅ Multi-LoRA Panel Demo loaded successfully!');
    console.log('Created panels:', panel1.id, panel2.id, panel3.id);
    
    return {
        panels: [panel1, panel2, panel3],
        components: [lora1, lora2, lora3]
    };
}

/**
 * LoRA 패널들 간의 공유 기능 설정
 * @param {Array} panelData - 패널 정보 배열
 */
function setupLoRAPanelSharing(panelData) {
    panelData.forEach(({ panel, component, name }) => {
        // 각 패널에 공유 버튼 추가
        const shareComponent = createShareComponent(panelData, panel.id, name);
        panel.addComponent(`share-${panel.id}`, shareComponent);
    });
}

/**
 * LoRA 공유 컴포넌트 생성
 * @param {Array} allPanelData - 모든 패널 데이터
 * @param {string} currentPanelId - 현재 패널 ID
 * @param {string} currentName - 현재 패널 이름
 */
function createShareComponent(allPanelData, currentPanelId, currentName) {
    return {
        render() {
            const container = document.createElement('div');
            container.style.cssText = `
                margin-top: 12px;
                padding: 12px;
                border-top: 1px solid rgba(0, 0, 0, 0.1);
                background: rgba(240, 245, 250, 0.5);
                border-radius: 0 0 8px 8px;
            `;
            
            const title = document.createElement('h4');
            title.textContent = '🔗 LoRA Sharing';
            title.style.cssText = `
                margin: 0 0 8px 0;
                font-size: 12px;
                color: #666;
                text-align: center;
            `;
            
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
                justify-content: center;
            `;
            
            // 다른 패널들로 복사 버튼 생성
            allPanelData.forEach(({ panel, component, name }) => {
                if (panel.id === currentPanelId) return; // 자기 자신 제외
                
                const copyBtn = document.createElement('button');
                copyBtn.textContent = `→ ${name}`;
                copyBtn.title = `Copy selected LoRAs to ${name} panel`;
                copyBtn.style.cssText = `
                    padding: 4px 8px;
                    font-size: 10px;
                    background: rgba(52, 152, 219, 0.8);
                    color: white;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                `;
                
                copyBtn.addEventListener('click', () => {
                    const currentComponent = allPanelData.find(p => p.panel.id === currentPanelId)?.component;
                    if (currentComponent) {
                        const selectedLoRAs = currentComponent.getSelectedLoRAs();
                        if (selectedLoRAs.length > 0) {
                            // 기존 선택에 추가 (중복 제거)
                            const targetSelected = component.getSelectedLoRAs();
                            const mergedLoRAs = [...targetSelected];
                            
                            selectedLoRAs.forEach(newLora => {
                                if (!mergedLoRAs.some(existing => existing.path === newLora.path)) {
                                    mergedLoRAs.push(newLora);
                                }
                            });
                            
                            component.setSelectedLoRAs(mergedLoRAs);
                            
                            // 피드백
                            copyBtn.style.background = '#27ae60';
                            copyBtn.textContent = '✓ Copied';
                            setTimeout(() => {
                                copyBtn.style.background = 'rgba(52, 152, 219, 0.8)';
                                copyBtn.textContent = `→ ${name}`;
                            }, 1500);
                        } else {
                            // 선택된 LoRA가 없음
                            copyBtn.style.background = '#e74c3c';
                            copyBtn.textContent = '! Empty';
                            setTimeout(() => {
                                copyBtn.style.background = 'rgba(52, 152, 219, 0.8)';
                                copyBtn.textContent = `→ ${name}`;
                            }, 1500);
                        }
                    }
                });
                
                copyBtn.addEventListener('mouseenter', () => {
                    copyBtn.style.transform = 'scale(1.05)';
                });
                
                copyBtn.addEventListener('mouseleave', () => {
                    copyBtn.style.transform = 'scale(1)';
                });
                
                buttonContainer.appendChild(copyBtn);
            });
            
            container.appendChild(title);
            container.appendChild(buttonContainer);
            
            return container;
        },
        
        destroy() {
            console.log(`LoRA sharing component destroyed for panel: ${currentPanelId}`);
        }
    };
}

/**
 * 글로벌 LoRA 이벤트 리스너 설정
 */
function setupGlobalLoRAEventListeners() {
    // LoRA 선택 변경 통합 로깅
    document.addEventListener('loraPanelDemo:selectionChanged', (e) => {
        console.log(`📊 Panel ${e.detail.panelId}: ${e.detail.count} LoRAs selected`);
        
        // 선택된 LoRA들의 요약 정보 출력
        if (e.detail.selectedLoRAs.length > 0) {
            const summary = e.detail.selectedLoRAs.map(lora => 
                `${lora.name} (${lora.weight})`
            ).join(', ');
            console.log(`   📝 Details: ${summary}`);
        }
    });
    
    // 패널 상태 변경 이벤트
    document.addEventListener('floatingPanel:minimizedToDot', (e) => {
        if (e.detail.panelId.includes('lora')) {
            console.log(`⚫ LoRA Panel ${e.detail.panelId} minimized`);
        }
    });
    
    document.addEventListener('floatingPanel:restored', (e) => {
        if (e.detail.panelId.includes('lora')) {
            console.log(`🔄 LoRA Panel ${e.detail.panelId} restored`);
        }
    });
    
    document.addEventListener('floatingPanel:destroyed', (e) => {
        if (e.detail.panelId.includes('lora')) {
            console.log(`🗑️ LoRA Panel ${e.detail.panelId} permanently deleted`);
        }
    });
}

/**
 * 단일 LoRA 패널 데모 (간단한 버전)
 */
export function runSimpleLoRAPanelDemo() {
    console.log('🎯 Starting Simple LoRA Panel Demo...');
    
    const { panel, loraComponent } = createLoRASelectorPanel({
        title: '🎨 LoRA Collection',
        x: 200,
        y: 150,
        width: 380,
        height: 600,
        markingColor: '#8e44ad'
    });
    
    // 간단한 이벤트 리스너
    document.addEventListener('loraSelector:changed', (e) => {
        const count = e.detail.selectedLoRAs.length;
        console.log(`🎯 Selected ${count} LoRA(s)`);
        
        if (count > 0) {
            e.detail.selectedLoRAs.forEach((lora, index) => {
                console.log(`  ${index + 1}. ${lora.name} (weight: ${lora.weight})`);
            });
        }
    });
    
    console.log('✅ Simple LoRA Panel Demo ready!');
    
    return { panel, loraComponent };
}

/**
 * LoRA 패널 API 통합 테스트
 */
export function testLoRAPanelAPI() {
    console.log('🧪 Testing LoRA Panel API...');
    
    const { panel, loraComponent } = createLoRASelectorPanel({
        id: 'api-test-panel',
        title: '🧪 API Test Panel',
        x: 300,
        y: 200,
        markingColor: '#34495e'
    });
    
    // API 테스트 함수들
    setTimeout(() => {
        console.log('📋 Current selected LoRAs:', loraComponent.getSelectedLoRAs());
        
        // 테스트용 LoRA 추가 (실제로는 서버에서 불러와야 함)
        // loraComponent.addLoRA('test/sample_lora.safetensors', 1.2);
        
        console.log('✅ API test completed');
    }, 2000);
    
    return { panel, loraComponent };
}