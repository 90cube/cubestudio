// components/ui/floatingPanel/panelDemo.js

/**
 * 플로팅 패널 데모 및 테스트 파일
 */

import { createFloatingPanel } from './floatingPanel.js';
import { ModelExplorerComponent } from '../../modelExplorer/modelExplorerComponent.js';

// 데모 컴포넌트 클래스 예시
class SampleComponent {
    constructor(title, content) {
        this.title = title;
        this.content = content;
    }
    
    render() {
        const element = document.createElement('div');
        element.style.cssText = `
            padding: 12px;
            margin-bottom: 12px;
            background: rgba(240, 245, 250, 0.8);
            border-radius: 8px;
            border-left: 4px solid #3498db;
        `;
        
        const title = document.createElement('h4');
        title.textContent = this.title;
        title.style.cssText = `
            margin: 0 0 8px 0;
            color: #2c3e50;
            font-size: 14px;
        `;
        
        const content = document.createElement('div');
        content.innerHTML = this.content;
        content.style.cssText = `
            color: #5a6c7d;
            font-size: 13px;
            line-height: 1.4;
        `;
        
        element.appendChild(title);
        element.appendChild(content);
        
        return element;
    }
    
    destroy() {
        console.log(`Sample component "${this.title}" destroyed`);
    }
}

// 데모 실행 함수
export function runFloatingPanelDemo() {
    console.log('Starting Floating Panel Demo...');
    
    // 첫 번째 패널 - 다이아몬드 점 스타일
    const panel1 = createFloatingPanel({
        id: 'demo-panel-1',
        title: 'Demo Panel 1',
        x: 120,  // 12 그리드
        y: 120,  // 12 그리드
        width: 320,  // 32 그리드
        height: 450, // 45 그리드
        markingColor: '#e74c3c',
        dotStyle: 'diamond',
        dotSize: 28
    });
    
    // 샘플 컴포넌트 추가
    panel1.addComponent('welcome', new SampleComponent(
        'Welcome Component',
        'This is a sample component showing how easy it is to add content to panels.<br><br>' +
        '<strong>Features:</strong><ul>' +
        '<li>✨ Drag the header to move</li>' +
        '<li>🎨 Click the dot to change color</li>' +
        '<li>📏 Drag bottom-right corner to resize</li>' +
        '<li>➖ Use minimize/close buttons</li></ul>'
    ));
    
    panel1.addComponent('info', new SampleComponent(
        'Panel Information',
        'Panel ID: <code>' + panel1.id + '</code><br>' +
        'Current Color: <span style="display:inline-block;width:12px;height:12px;background:' + panel1.markingColor + ';border-radius:50%;margin:0 4px;"></span>' + panel1.markingColor
    ));
    
    // 두 번째 패널 - 육각형 점 스타일
    const panel2 = createFloatingPanel({
        id: 'demo-panel-2', 
        title: 'Tools Panel',
        x: 480,  // 48 그리드
        y: 160,  // 16 그리드
        width: 280,  // 28 그리드
        height: 380, // 38 그리드
        markingColor: '#2ecc71',
        resizable: true,
        draggable: true,
        dotStyle: 'hexagon',
        dotSize: 32
    });
    
    // 도구 버튼들 추가
    const toolsComponent = {
        render: () => {
            const container = document.createElement('div');
            container.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
            
            const buttons = [
                { text: 'Sample Tool 1', color: '#3498db' },
                { text: 'Sample Tool 2', color: '#9b59b6' },
                { text: 'Sample Tool 3', color: '#f39c12' }
            ];
            
            buttons.forEach(btn => {
                const button = document.createElement('button');
                button.textContent = btn.text;
                button.style.cssText = `
                    padding: 12px 16px;
                    background: ${btn.color};
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: all 0.2s ease;
                `;
                
                button.addEventListener('mouseenter', () => {
                    button.style.transform = 'translateY(-1px)';
                    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                });
                
                button.addEventListener('mouseleave', () => {
                    button.style.transform = 'translateY(0)';
                    button.style.boxShadow = 'none';
                });
                
                button.addEventListener('click', () => {
                    alert(`${btn.text} clicked!`);
                });
                
                container.appendChild(button);
            });
            
            return container;
        },
        destroy: () => console.log('Tools component destroyed')
    };
    
    panel2.addComponent('tools', toolsComponent);
    
    // 세 번째 패널 - 모델 탐색기 (새로운 기능)
    const panel3 = createFloatingPanel({
        id: 'demo-panel-model-explorer',
        title: '🎨 Model Explorer',
        x: 800,  // 80 그리드
        y: 200,  // 20 그리드
        width: 350, // 35 그리드
        height: 500, // 50 그리드
        markingColor: '#9b59b6',
        resizable: true,
        draggable: true,
        dotStyle: 'pill',
        dotSize: 30
    });
    
    // 모델 탐색기 컴포넌트 추가
    const modelExplorer = new ModelExplorerComponent();
    panel3.addComponent('modelExplorer', modelExplorer);
    
    // 모델 선택 이벤트 리스너
    document.addEventListener('model:selected', (e) => {
        console.log('🎯 Model selected:', e.detail);
        // 여기에 선택된 모델 정보를 다른 컴포넌트에 전달하는 로직 추가 가능
    });
    
    // 이벤트 리스너 설정
    document.addEventListener('floatingPanel:colorChanged', (e) => {
        console.log(`🎨 Panel ${e.detail.panelId} color changed to:`, e.detail.color);
    });
    
    document.addEventListener('floatingPanel:destroyed', (e) => {
        console.log(`🗑️ Panel ${e.detail.panelId} permanently deleted`);
    });
    
    document.addEventListener('floatingPanel:minimizedToDot', (e) => {
        console.log(`⚫ Panel ${e.detail.panelId} minimized to dot`);
    });
    
    document.addEventListener('floatingPanel:restored', (e) => {
        console.log(`🔄 Panel ${e.detail.panelId} restored from dot`);
    });
    
    console.log('✅ Floating Panel Demo loaded successfully!');
    console.log('Created panels:', panel1.id, panel2.id, panel3.id);
    
    return { panel1, panel2, panel3 };
}