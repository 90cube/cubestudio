// components/poseEditor/poseWorkflowManager.js

/**
 * 포즈 워크플로우 매니저 - JSON 중심 워크플로우
 * 
 * 4단계 JSON-first 워크플로우 구현:
 * 1. Image → JSON coordinate extraction
 * 2. JSON → Konva visual editor for pose manipulation  
 * 3. Editor → Modified JSON coordinates
 * 4. Modified JSON → Final ControlNet image
 */

export class PoseWorkflowManager {
    constructor(imageNode) {
        this.imageNode = imageNode;
        this.currentStep = 'extract';
        this.originalPoseData = null;
        this.modifiedPoseData = null;
        this.workflowModal = null;
        this.onComplete = null;
    }

    /**
     * 워크플로우 시작 - 통합 진입점
     * @param {string} processor - 선택된 포즈 프로세서 (dwpose_builtin, openpose_body, etc.)
     * @param {Object} parameters - 처리 파라미터
     * @param {Function} onComplete - 완료 콜백
     */
    async startWorkflow(processor, parameters = {}, onComplete = null) {
        console.log(`[POSE WORKFLOW] Starting JSON-first workflow with ${processor}`);
        
        this.onComplete = onComplete;
        
        try {
            // Step 1: Extract JSON coordinates from image
            await this.extractPoseData(processor, parameters);
            
            // Step 2: Open Konva editor for visual editing  
            await this.openPoseEditor();
            
        } catch (error) {
            console.error('[POSE WORKFLOW] Error starting workflow:', error);
            this.showError('워크플로우 시작 중 오류가 발생했습니다: ' + error.message);
        }
    }

    /**
     * Step 1: 이미지에서 JSON 좌표 추출
     * @param {string} processor - 포즈 프로세서
     * @param {Object} parameters - 처리 파라미터
     */
    async extractPoseData(processor, parameters) {
        console.log(`[POSE WORKFLOW] Step 1: Extracting pose data with ${processor}`);
        
        // 이미지 노드에서 base64 데이터 추출
        const imageBase64 = await this.getImageAsBase64(this.imageNode);
        
        // 백엔드 API 호출 - 전용 포즈 추출 엔드포인트 사용
        const requestData = {
            processor: processor,
            image: imageBase64,
            parameters: {
                confidence_threshold: parameters.confidence_threshold || 0.3,
                detect_body: parameters.detect_body !== false,
                detect_hands: parameters.detect_hand || false,
                detect_face: parameters.detect_face || false,
                line_width: parameters.line_width || 2,
                point_radius: parameters.point_radius || 4,
                output_format: 'json'  // JSON 우선 요청
            }
        };

        const response = await fetch('/api/pose/extract', {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        // 디버그를 위한 응답 전체 로깅
        console.log('[POSE WORKFLOW] 백엔드 응답:', result);
        
        if (!result.success) {
            throw new Error(`포즈 추출 실패: ${result.error || 'Unknown error'}`);
        }
        
        if (!result.pose_data) {
            throw new Error('포즈 데이터를 추출할 수 없습니다 - pose_data가 없습니다');
        }

        this.originalPoseData = result.pose_data;
        
        // 키포인트 개수 계산 (OpenPose 형식: people 배열에서 첫 번째 사람의 키포인트)
        let keypointCount = 0;
        if (this.originalPoseData.people && this.originalPoseData.people.length > 0) {
            const person = this.originalPoseData.people[0];
            if (person.pose_keypoints_2d) {
                keypointCount = person.pose_keypoints_2d.length / 3; // x, y, confidence 로 3개씩
            }
        }
        
        console.log(`[POSE WORKFLOW] ✅ Step 1 Complete: ${keypointCount} keypoints extracted from ${this.originalPoseData.people?.length || 0} people`);
        
        // 자동 다운로드 제거 - 사용자가 에디터에서 원할 때만 다운로드하도록 변경
    }

    /**
     * Step 2: Konva 비주얼 에디터 열기
     */
    async openPoseEditor() {
        console.log('[POSE WORKFLOW] Step 2: Opening Konva visual editor');
        
        // 전용 포즈 에디터 모달 생성
        this.workflowModal = this.createWorkflowModal();
        
        // Konva 캔버스 초기화
        await this.initializePoseCanvas();
        
        console.log('[POSE WORKFLOW] ✅ Step 2 Complete: Visual editor opened');
    }

    /**
     * Step 3: 수정된 JSON 좌표 처리 (에디터 완료 시 호출됨)
     * @param {Object} modifiedPoseData - 수정된 포즈 데이터
     */
    async handleModifiedPose(modifiedPoseData) {
        console.log('[POSE WORKFLOW] Step 3: Processing modified pose data');
        
        this.modifiedPoseData = modifiedPoseData;
        
        // Step 4: 렌더링 및 캔버스 적용
        await this.renderAndApplyToCanvas();
        
        console.log('[POSE WORKFLOW] ✅ Step 3 Complete: Modified pose processed');
    }

    /**
     * Step 4: 수정된 JSON → PNG 렌더링 → 캔버스 적용
     */
    async renderAndApplyToCanvas() {
        console.log('[POSE WORKFLOW] Step 4: Rendering skeleton and applying to canvas');
        
        try {
            // JSON 좌표를 PNG 스켈레톤으로 렌더링
            const skeletonImage = await this.renderSkeletonFromJSON(this.modifiedPoseData);
            
            // 메인 캔버스에 새 레이어로 추가
            await this.applyToMainCanvas(skeletonImage);
            
            // 워크플로우 완료
            this.closeWorkflowModal();
            
            if (this.onComplete) {
                this.onComplete({
                    originalPoseData: this.originalPoseData,
                    modifiedPoseData: this.modifiedPoseData,
                    skeletonImage: skeletonImage
                });
            }
            
            console.log('[POSE WORKFLOW] ✅ Step 4 Complete: Workflow finished successfully');
            
        } catch (error) {
            console.error('[POSE WORKFLOW] Error in step 4:', error);
            this.showError('스켈레톤 렌더링 중 오류: ' + error.message);
        }
    }

    /**
     * 워크플로우 모달 생성
     */
    createWorkflowModal() {
        // 백드롭 생성
        const backdrop = document.createElement('div');
        backdrop.className = 'pose-workflow-modal-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 3000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        // 모달 컨테이너
        const modal = document.createElement('div');
        modal.className = 'pose-workflow-modal';
        modal.style.cssText = `
            background: #2a2d3a;
            border-radius: 16px;
            width: 95%;
            max-width: 1400px;
            height: 90%;
            max-height: 900px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.7);
            display: flex;
            flex-direction: column;
        `;

        // 헤더
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 20px 30px;
            background: linear-gradient(135deg, #3a3d4a, #2a2d3a);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        const title = document.createElement('h2');
        title.textContent = '🎭 포즈 에디터 - JSON 기반 워크플로우';
        title.style.cssText = `
            color: #e8eaed;
            font-size: 20px;
            font-weight: 600;
            margin: 0;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #999;
            font-size: 28px;
            cursor: pointer;
            padding: 5px;
            line-height: 1;
            transition: color 0.2s;
        `;
        closeBtn.addEventListener('click', () => this.closeWorkflowModal());

        header.appendChild(title);
        header.appendChild(closeBtn);

        // 콘텐츠 영역
        const content = document.createElement('div');
        content.className = 'workflow-content';
        content.style.cssText = `
            flex: 1;
            display: flex;
            overflow: hidden;
        `;

        // 왼쪽: Konva 캔버스 영역
        const canvasArea = document.createElement('div');
        canvasArea.className = 'canvas-area';
        canvasArea.style.cssText = `
            flex: 1;
            padding: 30px;
            display: flex;
            flex-direction: column;
            align-items: center;
        `;

        // 오른쪽: 포즈 데이터 패널
        const dataPanel = document.createElement('div');
        dataPanel.className = 'data-panel';
        dataPanel.style.cssText = `
            width: 350px;
            padding: 30px;
            background: rgba(0, 0, 0, 0.3);
            border-left: 1px solid rgba(255, 255, 255, 0.1);
            overflow-y: auto;
        `;

        content.appendChild(canvasArea);
        content.appendChild(dataPanel);

        // 하단: 액션 버튼들
        const actions = document.createElement('div');
        actions.style.cssText = `
            padding: 20px 30px;
            background: rgba(0, 0, 0, 0.2);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            display: flex;
            gap: 15px;
            justify-content: flex-end;
        `;

        const resetBtn = this.createActionButton('🔄 Reset', 'secondary');
        const downloadBtn = this.createActionButton('📄 Download JSON', 'secondary');  
        const applyBtn = this.createActionButton('✅ Apply to Canvas', 'primary');
        const cancelBtn = this.createActionButton('❌ Cancel', 'secondary');

        // 버튼 이벤트 리스너
        resetBtn.addEventListener('click', () => this.resetPoseData());
        downloadBtn.addEventListener('click', () => this.downloadModifiedJSON());
        applyBtn.addEventListener('click', () => this.confirmApplyChanges());
        cancelBtn.addEventListener('click', () => this.closeWorkflowModal());

        actions.appendChild(resetBtn);
        actions.appendChild(downloadBtn);
        actions.appendChild(applyBtn);
        actions.appendChild(cancelBtn);

        modal.appendChild(header);
        modal.appendChild(content);
        modal.appendChild(actions);
        backdrop.appendChild(modal);

        document.body.appendChild(backdrop);

        return {
            element: backdrop,
            canvasArea: canvasArea,
            dataPanel: dataPanel,
            close: () => this.closeWorkflowModal()
        };
    }

    /**
     * 액션 버튼 생성 헬퍼
     */
    createActionButton(text, type) {
        const button = document.createElement('button');
        button.textContent = text;
        
        const styles = {
            primary: 'background: linear-gradient(135deg, #4a9eff, #0f7b0f); color: white;',
            secondary: 'background: rgba(255, 255, 255, 0.1); color: #e8eaed; border: 1px solid rgba(255, 255, 255, 0.2);'
        };
        
        button.style.cssText = `
            padding: 12px 20px;
            ${styles[type]}
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            font-size: 14px;
            transition: all 0.3s;
            min-width: 140px;
        `;
        
        return button;
    }

    /**
     * Konva 포즈 캔버스 초기화
     */
    async initializePoseCanvas() {
        // 원본 이미지 크기 정보 가져오기
        const originalWidth = this.getOriginalImageWidth();
        const originalHeight = this.getOriginalImageHeight();
        
        // 캔버스 크기 계산 (최대 800px, 비율 유지)
        const maxSize = 800;
        const aspectRatio = originalWidth / originalHeight;
        let canvasWidth, canvasHeight;
        
        if (aspectRatio > 1) {
            // 가로가 더 긴 경우
            canvasWidth = Math.min(maxSize, originalWidth);
            canvasHeight = canvasWidth / aspectRatio;
        } else {
            // 세로가 더 길거나 정사각형인 경우
            canvasHeight = Math.min(maxSize, originalHeight);
            canvasWidth = canvasHeight * aspectRatio;
        }
        
        console.log(`[POSE EDITOR] Canvas size: ${canvasWidth}x${canvasHeight} (original: ${originalWidth}x${originalHeight})`);
        
        // Konva 캔버스 컨테이너 생성
        const canvasContainer = document.createElement('div');
        canvasContainer.id = 'pose-editor-container';
        canvasContainer.style.cssText = `
            width: ${canvasWidth}px;
            height: ${canvasHeight}px;
            background: #1a1d2a;
            border: 2px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        `;
        
        // Konva 스테이지 생성
        this.konvaStage = new Konva.Stage({
            container: canvasContainer,
            width: canvasWidth,
            height: canvasHeight
        });
        
        // 캔버스 크기 저장 (스케일링에 사용)
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        
        // 배경 이미지 레이어 생성
        this.backgroundLayer = new Konva.Layer();
        this.konvaStage.add(this.backgroundLayer);
        
        // 포즈 레이어 생성
        this.poseLayer = new Konva.Layer();
        this.konvaStage.add(this.poseLayer);
        
        // 원본 이미지를 배경으로 추가
        await this.addBackgroundImage();
        
        // 포즈 데이터 초기화
        this.initializePoseKeypoints();
        
        // 캔버스를 모달에 추가
        this.workflowModal.canvasArea.appendChild(canvasContainer);
        
        console.log('[POSE EDITOR] Konva canvas initialized with', this.poseKeypoints.length, 'keypoints');
        
        // 포즈 데이터 패널 업데이트
        this.updateDataPanel();
    }

    /**
     * 배경 이미지 추가
     */
    async addBackgroundImage() {
        try {
            // 이미지 노드에서 src 가져오기
            const imageSrc = this.imageNode.attrs.image?.src;
            if (!imageSrc) {
                console.warn('[POSE EDITOR] No image source found');
                return;
            }
            
            // 새로운 이미지 객체 생성
            const imageObj = new Image();
            imageObj.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
                imageObj.onload = resolve;
                imageObj.onerror = reject;
                imageObj.src = imageSrc;
            });
            
            // Konva 이미지 생성
            const backgroundImage = new Konva.Image({
                x: 0,
                y: 0,
                image: imageObj,
                width: this.canvasWidth,
                height: this.canvasHeight,
                opacity: 0.8, // 살짝 투명하게 해서 키포인트가 잘 보이도록
                listening: false // 상호작용 불가능하게
            });
            
            this.backgroundLayer.add(backgroundImage);
            this.backgroundLayer.draw();
            
            console.log('[POSE EDITOR] Background image added');
            
        } catch (error) {
            console.warn('[POSE EDITOR] Failed to add background image:', error);
            // 배경 이미지 로딩 실패 시 그라데이션 배경 추가
            const background = new Konva.Rect({
                x: 0,
                y: 0,
                width: this.canvasWidth,
                height: this.canvasHeight,
                fillLinearGradientStartPoint: { x: 0, y: 0 },
                fillLinearGradientEndPoint: { x: this.canvasWidth, y: this.canvasHeight },
                fillLinearGradientColorStops: [0, '#1a1d2a', 0.5, '#2d3142', 1, '#1a1d2a']
            });
            this.backgroundLayer.add(background);
            this.backgroundLayer.draw();
        }
    }

    /**
     * 포즈 키포인트 초기화 및 Konva 객체 생성
     */
    initializePoseKeypoints() {
        console.log('[POSE EDITOR] Initializing pose keypoints');
        
        // 키포인트 배열 초기화
        this.poseKeypoints = [];
        this.skeletonConnections = [];
        
        // COCO 17-keypoint 논리적 연결 정의 (인체 구조)
        // 0:nose, 1:left_eye, 2:right_eye, 3:left_ear, 4:right_ear,
        // 5:left_shoulder, 6:right_shoulder, 7:left_elbow, 8:right_elbow,
        // 9:left_wrist, 10:right_wrist, 11:left_hip, 12:right_hip,
        // 13:left_knee, 14:right_knee, 15:left_ankle, 16:right_ankle
        this.keypointConnections = [
            // 머리 연결
            [0, 1], [0, 2],                    // nose -> eyes
            [1, 3], [2, 4],                    // left_eye->left_ear, right_eye->right_ear
            
            // 목 연결 (nose to shoulders for neck representation)
            [0, 5], [0, 6],                    // nose -> shoulders (목 대체)
            
            [5, 6],                            // left_shoulder -> right_shoulder
            
            // 상체 연결  
            [5, 7], [7, 9],                    // left_shoulder->left_elbow->left_wrist
            [6, 8], [8, 10],                   // right_shoulder->right_elbow->right_wrist
            [5, 11], [6, 12],                  // shoulders -> hips
            [11, 12],                          // left_hip -> right_hip
            
            // 하체 연결
            [11, 13], [13, 15],                // left_hip->left_knee->left_ankle  
            [12, 14], [14, 16]                 // right_hip->right_knee->right_ankle
        ];
        
        // 손 키포인트 연결 정의 (21개 키포인트 구조)
        this.handConnections = [
            // 손목에서 각 손가락으로
            [0, 1], [0, 5], [0, 9], [0, 13], [0, 17],  // 손목에서 각 손가락 시작점
            // 엄지 (Thumb)
            [1, 2], [2, 3], [3, 4],
            // 검지 (Index)
            [5, 6], [6, 7], [7, 8],
            // 중지 (Middle)
            [9, 10], [10, 11], [11, 12],
            // 약지 (Ring)
            [13, 14], [14, 15], [15, 16],
            // 새끼 (Pinky)
            [17, 18], [18, 19], [19, 20]
        ];
        
        // 손가락 그룹 정의 (21개 손 키포인트)
        this.fingerGroups = {
            // 각 손가락별 키포인트 인덱스 매핑
            thumb: [1, 2, 3, 4],      // 엄지: CMC, MCP, IP, Tip
            index: [5, 6, 7, 8],      // 검지: MCP, PIP, DIP, Tip  
            middle: [9, 10, 11, 12],  // 중지: MCP, PIP, DIP, Tip
            ring: [13, 14, 15, 16],   // 약지: MCP, PIP, DIP, Tip
            pinky: [17, 18, 19, 20]   // 새끼: MCP, PIP, DIP, Tip
        };
        
        // 편집 모드 (group | individual)
        this.editMode = 'group';
        
        // 키포인트 이름 (디버깅용)
        // COCO 17 키포인트 라벨 (0-based indexing)
        this.keypointNames = [
            'Nose',        // 0: nose
            'L_Eye',       // 1: left_eye  
            'R_Eye',       // 2: right_eye
            'L_Ear',       // 3: left_ear
            'R_Ear',       // 4: right_ear
            'L_Shoulder',  // 5: left_shoulder
            'R_Shoulder',  // 6: right_shoulder
            'L_Elbow',     // 7: left_elbow
            'R_Elbow',     // 8: right_elbow
            'L_Wrist',     // 9: left_wrist
            'R_Wrist',     // 10: right_wrist
            'L_Hip',       // 11: left_hip
            'R_Hip',       // 12: right_hip
            'L_Knee',      // 13: left_knee
            'R_Knee',      // 14: right_knee
            'L_Ankle',     // 15: left_ankle
            'R_Ankle'      // 16: right_ankle
        ];
        
        if (!this.originalPoseData?.people || this.originalPoseData.people.length === 0) {
            console.warn('[POSE EDITOR] No pose data available');
            return;
        }
        
        const person = this.originalPoseData.people[0];
        if (!person.pose_keypoints_2d) {
            console.warn('[POSE EDITOR] No keypoints available');
            return;
        }
        
        // 스켈레톤 연결선 먼저 그리기 (키포인트 뒤에 위치하도록)
        this.drawSkeletonConnections(person.pose_keypoints_2d);
        
        // Body 키포인트를 Konva 객체로 변환
        for (let i = 0; i < person.pose_keypoints_2d.length; i += 3) {
            const x = person.pose_keypoints_2d[i];
            const y = person.pose_keypoints_2d[i + 1];
            const confidence = person.pose_keypoints_2d[i + 2];
            
            // confidence가 너무 낮으면 키포인트 스킵 (무결성 개선)
            if (confidence < 0.3) continue;
            
            // 현재 키포인트 인덱스 계산 (0부터 시작)
            const keypointIndex = i / 3;
            
            // 캔버스 좌표로 스케일링 (원본 이미지 크기에서 현재 캔버스 크기로)
            const scaledX = (x / this.getOriginalImageWidth()) * this.canvasWidth;
            const scaledY = (y / this.getOriginalImageHeight()) * this.canvasHeight;
            
            // 디버깅: 키포인트 데이터 로깅
            console.log(`[POSE EDITOR] Creating keypoint ${keypointIndex} (${this.keypointNames[keypointIndex] || 'Unknown'}) at pixel(${x.toFixed(1)},${y.toFixed(1)}) → canvas(${scaledX.toFixed(1)},${scaledY.toFixed(1)}) conf=${confidence.toFixed(3)}`);
            
            // 키포인트 생성 (body는 빨간색) - keypointIndex 명확히 전달
            const keypoint = this.createInteractiveKeypoint(keypointIndex, scaledX, scaledY, confidence, 'red');
            this.poseKeypoints.push(keypoint);
            this.poseLayer.add(keypoint);
        }
        
        // ✅ Hand 키포인트 처리 재활성화 - 인덱스 문제 해결 후 복원
        // Left Hand와 Right Hand 키포인트 추가 처리
        
        // Left Hand 키포인트 추가 (녹색, 인덱스 L0-L20)
        if (person.hand_left_keypoints_2d && person.hand_left_keypoints_2d.length >= 63) {
            for (let i = 0; i < person.hand_left_keypoints_2d.length; i += 3) {
                const x = person.hand_left_keypoints_2d[i];
                const y = person.hand_left_keypoints_2d[i + 1];
                const confidence = person.hand_left_keypoints_2d[i + 2];
                
                if (confidence < 0.3) continue; // 무결성 개선: 통일된 confidence threshold
                
                const scaledX = (x / this.getOriginalImageWidth()) * this.canvasWidth;
                const scaledY = (y / this.getOriginalImageHeight()) * this.canvasHeight;
                
                // 손가락 키포인트 생성 (초록색, 작은 크기) - L0~L20 형태의 인덱스
                const handIndex = `L${i / 3}`;
                console.log(`[POSE EDITOR] Creating LEFT hand keypoint ${handIndex} at pixel(${x.toFixed(1)},${y.toFixed(1)}) → canvas(${scaledX.toFixed(1)},${scaledY.toFixed(1)}) conf=${confidence.toFixed(3)}`);
                const handKeypoint = this.createInteractiveKeypoint(handIndex, scaledX, scaledY, confidence, '#2196F3', 3);
                this.poseKeypoints.push(handKeypoint);
                this.poseLayer.add(handKeypoint);
            }
        }
        
        // Right Hand 키포인트 추가 (파란색, 인덱스 R0-R20)
        if (person.hand_right_keypoints_2d && person.hand_right_keypoints_2d.length >= 63) {
            for (let i = 0; i < person.hand_right_keypoints_2d.length; i += 3) {
                const x = person.hand_right_keypoints_2d[i];
                const y = person.hand_right_keypoints_2d[i + 1];
                const confidence = person.hand_right_keypoints_2d[i + 2];
                
                if (confidence < 0.3) continue;
                
                const scaledX = (x / this.getOriginalImageWidth()) * this.canvasWidth;
                const scaledY = (y / this.getOriginalImageHeight()) * this.canvasHeight;
                
                // 손가락 키포인트 생성 (파란색, 작은 크기) - R0~R20 형태의 인덱스
                const handIndex = `R${i / 3}`;
                console.log(`[POSE EDITOR] Creating RIGHT hand keypoint ${handIndex} at pixel(${x.toFixed(1)},${y.toFixed(1)}) → canvas(${scaledX.toFixed(1)},${scaledY.toFixed(1)}) conf=${confidence.toFixed(3)}`);
                const handKeypoint = this.createInteractiveKeypoint(handIndex, scaledX, scaledY, confidence, '#4CAF50', 3);
                this.poseKeypoints.push(handKeypoint);
                this.poseLayer.add(handKeypoint);
            }
        }
        
        // 레이어 다시 그리기
        this.poseLayer.draw();
        
        console.log(`[POSE EDITOR] Created ${this.poseKeypoints.length} interactive keypoints`);
    }

    /**
     * 상호작용 가능한 키포인트 생성
     */
    createInteractiveKeypoint(index, x, y, confidence, color = null, radius = null) {
        // 키포인트 그룹 생성 (원 + 텍스트)
        const group = new Konva.Group({
            x: x,
            y: y,
            draggable: true,
            keypointIndex: index,
            originalX: x,
            originalY: y,
            originalConfidence: confidence
        });
        
        // 키포인트 원
        const circle = new Konva.Circle({
            x: 0,
            y: 0,
            radius: radius || Math.max(4, confidence * 8), // 지정된 크기 또는 confidence에 따른 크기 조절
            fill: color || this.getKeypointColor(index, confidence), // 지정된 색상 또는 기본 색상
            stroke: '#ffffff',
            strokeWidth: 2,
            shadowColor: '#000000',
            shadowOffset: { x: 1, y: 1 },
            shadowOpacity: 0.8
        });
        
        // 키포인트 번호 텍스트
        const text = new Konva.Text({
            x: -6,
            y: -6,
            text: index.toString(),
            fontSize: 12,
            fontFamily: 'Arial',
            fill: '#ffffff',
            align: 'center',
            verticalAlign: 'middle'
        });
        
        group.add(circle);
        group.add(text);
        
        // 드래그 이벤트 설정
        this.setupKeypointDragEvents(group, index);
        
        // 마우스 오버 효과
        this.setupKeypointHoverEffects(group, circle, index);
        
        return group;
    }
    
    /**
     * 스켈레톤 연결선 그리기
     */
    drawSkeletonConnections(keypoints) {
        this.skeletonConnections = [];
        
        for (const [startIdx, endIdx] of this.keypointConnections) {
            const startX = keypoints[startIdx * 3];
            const startY = keypoints[startIdx * 3 + 1];
            const startConf = keypoints[startIdx * 3 + 2];
            
            const endX = keypoints[endIdx * 3];
            const endY = keypoints[endIdx * 3 + 1];
            const endConf = keypoints[endIdx * 3 + 2];
            
            // 양쪽 키포인트가 모두 유효하고 confidence 임계값 이상인 경우만 연결선 그리기
            if (startConf > 0.3 && endConf > 0.3 && 
                startX > 0 && startY > 0 && endX > 0 && endY > 0) {
                // 캔버스 좌표로 스케일링
                const scaledStartX = (startX / this.getOriginalImageWidth()) * this.canvasWidth;
                const scaledStartY = (startY / this.getOriginalImageHeight()) * this.canvasHeight;
                const scaledEndX = (endX / this.getOriginalImageWidth()) * this.canvasWidth;
                const scaledEndY = (endY / this.getOriginalImageHeight()) * this.canvasHeight;
                
                const line = new Konva.Line({
                    points: [scaledStartX, scaledStartY, scaledEndX, scaledEndY],
                    stroke: '#4a9eff',
                    strokeWidth: 2,
                    opacity: 0.7,
                    lineCap: 'round',
                    connectionStartIdx: startIdx,
                    connectionEndIdx: endIdx
                });
                
                this.skeletonConnections.push(line);
                this.poseLayer.add(line);
            }
        }
        
        // 손 스켈레톤 연결선 그리기
        this.drawHandSkeletonConnections();
    }
    
    /**
     * 손 스켈레톤 연결선 그리기
     */
    drawHandSkeletonConnections() {
        if (!this.originalPoseData?.people || this.originalPoseData.people.length === 0) {
            return;
        }
        
        const person = this.originalPoseData.people[0];
        
        // 왼손 연결선 그리기 (예외 처리 포함)
        if (person.hand_left_keypoints_2d && person.hand_left_keypoints_2d.length > 0) {
            this.drawSingleHandConnections(person.hand_left_keypoints_2d, 'L', '#2196F3'); // 파란색
            
            // 왼손목-손가락 연결 (손목과 손가락이 모두 유효할 때만)
            if (this.canConnectWristToHand('L')) {
                this.drawWristToHandConnection('L', '#2196F3');
            }
        }
        
        // 오른손 연결선 그리기 (예외 처리 포함)
        if (person.hand_right_keypoints_2d && person.hand_right_keypoints_2d.length > 0) {
            this.drawSingleHandConnections(person.hand_right_keypoints_2d, 'R', '#4CAF50'); // 초록색
            
            // 오른손목-손가락 연결 (손목과 손가락이 모두 유효할 때만)
            if (this.canConnectWristToHand('R')) {
                this.drawWristToHandConnection('R', '#4CAF50');
            }
        }
    }
    
    /**
     * 손목-손가락 연결 가능 여부 확인 (예외 처리)
     */
    canConnectWristToHand(handSide) {
        if (!this.originalPoseData?.people || this.originalPoseData.people.length === 0) {
            return false;
        }
        
        const person = this.originalPoseData.people[0];
        
        // 1. 손목 키포인트 확인
        const wristIndex = handSide === 'L' ? 7 : 4; // LWrist=7, RWrist=4
        const wristData = person.pose_keypoints_2d;
        if (!wristData || wristData.length <= wristIndex * 3 + 2) {
            console.log(`[POSE EDITOR] ${handSide} wrist keypoint data not available`);
            return false;
        }
        
        const wristX = wristData[wristIndex * 3];
        const wristY = wristData[wristIndex * 3 + 1];
        const wristConf = wristData[wristIndex * 3 + 2];
        
        // 손목 confidence 체크 (최소 0.3)
        if (wristConf < 0.3) {
            console.log(`[POSE EDITOR] ${handSide} wrist confidence too low: ${wristConf}`);
            return false;
        }
        
        // 손목이 유효한 범위에 있는지 체크 (정규화된 좌표 기준)
        if (wristX <= 0 || wristX >= 1 || wristY <= 0 || wristY >= 1) {
            console.log(`[POSE EDITOR] ${handSide} wrist out of bounds: ${wristX}, ${wristY}`);
            return false;
        }
        
        // 2. 손가락 키포인트 확인
        const handKeypoints = handSide === 'L' ? person.hand_left_keypoints_2d : person.hand_right_keypoints_2d;
        if (!handKeypoints || handKeypoints.length < 63) { // 21 keypoints * 3 = 63
            console.log(`[POSE EDITOR] ${handSide} hand keypoints not sufficient`);
            return false;
        }
        
        // 손목 키포인트(첫 번째 키포인트) confidence 체크
        const handWristConf = handKeypoints[2]; // 손가락 데이터의 첫 번째 키포인트는 손목
        if (handWristConf < 0.3) {
            console.log(`[POSE EDITOR] ${handSide} hand wrist confidence too low: ${handWristConf}`);
            return false;
        }
        
        // 3. 최소한의 손가락 키포인트들이 유효한지 체크
        let validFingerPoints = 0;
        for (let i = 1; i < 21; i++) { // 손목(0) 제외하고 손가락들만
            const conf = handKeypoints[i * 3 + 2];
            if (conf > 0.2) { // 낮은 threshold로 체크
                validFingerPoints++;
            }
        }
        
        if (validFingerPoints < 5) { // 최소 5개 이상의 손가락 키포인트 필요
            console.log(`[POSE EDITOR] ${handSide} hand insufficient valid finger points: ${validFingerPoints}`);
            return false;
        }
        
        console.log(`[POSE EDITOR] ${handSide} hand-wrist connection valid (wrist conf: ${wristConf.toFixed(2)}, finger points: ${validFingerPoints})`);
        return true;
    }
    
    /**
     * 손목과 손가락 사이의 연결선 그리기
     */
    drawWristToHandConnection(handSide, color) {
        const person = this.originalPoseData.people[0];
        
        // 1. 몸체 손목 키포인트 위치 가져오기
        const wristIndex = handSide === 'L' ? 7 : 4; // LWrist=7, RWrist=4
        const wristData = person.pose_keypoints_2d;
        const wristX = wristData[wristIndex * 3];
        const wristY = wristData[wristIndex * 3 + 1];
        
        // 2. 손가락 손목 키포인트 위치 가져오기 (인덱스 0)
        const handKeypoints = handSide === 'L' ? person.hand_left_keypoints_2d : person.hand_right_keypoints_2d;
        const handWristX = handKeypoints[0]; // 첫 번째 키포인트는 손목
        const handWristY = handKeypoints[1];
        
        // 3. 캔버스 좌표로 변환
        const scaledWristX = (wristX / this.getOriginalImageWidth()) * this.canvasWidth;
        const scaledWristY = (wristY / this.getOriginalImageHeight()) * this.canvasHeight;
        const scaledHandWristX = (handWristX / this.getOriginalImageWidth()) * this.canvasWidth;
        const scaledHandWristY = (handWristY / this.getOriginalImageHeight()) * this.canvasHeight;
        
        // 4. 연결선 그리기
        const line = new Konva.Line({
            points: [scaledWristX, scaledWristY, scaledHandWristX, scaledHandWristY],
            stroke: color,
            strokeWidth: 2.5, // 손목-손가락 연결은 조금 더 굵게
            opacity: 0.8,
            lineCap: 'round',
            dash: [5, 5], // 점선으로 표시하여 구분
            connectionStartIdx: wristIndex,
            connectionEndIdx: `${handSide}0`, // 손가락 데이터의 첫 번째 키포인트
            isWristConnection: true
        });
        
        this.skeletonConnections.push(line);
        this.poseLayer.add(line);
        
        console.log(`[POSE EDITOR] Drew ${handSide} wrist-hand connection: (${scaledWristX.toFixed(1)}, ${scaledWristY.toFixed(1)}) → (${scaledHandWristX.toFixed(1)}, ${scaledHandWristY.toFixed(1)})`);
    }
    
    /**
     * 개별 손의 스켈레톤 연결선 그리기
     */
    drawSingleHandConnections(handKeypoints, handPrefix, color) {
        for (const [startIdx, endIdx] of this.handConnections) {
            const startX = handKeypoints[startIdx * 3];
            const startY = handKeypoints[startIdx * 3 + 1];
            const startConf = handKeypoints[startIdx * 3 + 2];
            
            const endX = handKeypoints[endIdx * 3];
            const endY = handKeypoints[endIdx * 3 + 1];
            const endConf = handKeypoints[endIdx * 3 + 2];
            
            // 양쪽 키포인트가 모두 유효한 경우만 연결선 그리기
            if (startConf > 0 && endConf > 0) {
                // 캔버스 좌표로 스케일링
                const scaledStartX = (startX / this.getOriginalImageWidth()) * this.canvasWidth;
                const scaledStartY = (startY / this.getOriginalImageHeight()) * this.canvasHeight;
                const scaledEndX = (endX / this.getOriginalImageWidth()) * this.canvasWidth;
                const scaledEndY = (endY / this.getOriginalImageHeight()) * this.canvasHeight;
                
                const line = new Konva.Line({
                    points: [scaledStartX, scaledStartY, scaledEndX, scaledEndY],
                    stroke: color,
                    strokeWidth: 1.5, // 손은 좀 더 얇게
                    opacity: 0.6,
                    lineCap: 'round',
                    connectionStartIdx: `${handPrefix}${startIdx}`,
                    connectionEndIdx: `${handPrefix}${endIdx}`,
                    isHandConnection: true
                });
                
                this.skeletonConnections.push(line);
                this.poseLayer.add(line);
            }
        }
    }
    
    /**
     * 키포인트 드래그 이벤트 설정
     */
    setupKeypointDragEvents(group, index) {
        group.on('dragstart', () => {
            // 드래그 시작시 z-index 상승
            group.moveToTop();
            this.poseLayer.draw();
            
            // 그룹 편집 모드에서 손가락 그룹 드래그 시작
            if (this.editMode === 'group') {
                this.startFingerGroupDrag(group, index);
            }
        });
        
        group.on('dragmove', () => {
            // 그룹 편집 모드에서 손가락 그룹 이동
            if (this.editMode === 'group') {
                this.updateFingerGroupDrag(group, index);
            }
            
            // 실시간으로 연결선 업데이트
            this.updateSkeletonConnections();
            
            // 좌표 정보 업데이트 (디버그용) - keypointIndex 속성 사용
            const pos = group.position();
            const keypointIndex = group.getAttr('keypointIndex');
            const keypointName = (typeof keypointIndex === 'number' && this.keypointNames[keypointIndex]) ? 
                                 this.keypointNames[keypointIndex] : 
                                 (typeof keypointIndex === 'string' ? keypointIndex : 'Unknown');
            console.log(`[POSE EDITOR] Keypoint ${keypointIndex} (${keypointName}) moved to: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}`);
        });
        
        group.on('dragend', () => {
            // 그룹 편집 모드에서 그룹 드래그 종료 처리
            if (this.editMode === 'group') {
                this.endFingerGroupDrag();
            }
            
            // 드래그 완료시 JSON 데이터 업데이트
            this.updatePoseDataFromKeypoints();
            
            // 데이터 패널 새로고침
            this.updateDataPanel();
        });
    }
    
    /**
     * 키포인트 마우스 오버 효과 설정
     */
    setupKeypointHoverEffects(group, circle, index) {
        group.on('mouseenter', () => {
            // 호버시 크기 증가 및 색상 변경
            circle.radius(circle.radius() * 1.3);
            circle.stroke('#ffff00'); // 노란색 강조
            circle.strokeWidth(3);
            
            // 그룹 편집 모드에서 그룹 미리보기
            if (this.editMode === 'group') {
                this.showGroupPreview(index);
            }
            
            
            document.body.style.cursor = 'move';
            this.poseLayer.draw();
        });
        
        group.on('mouseleave', () => {
            // 호버 해제시 원래 크기와 색상으로 복원
            circle.radius(circle.radius() / 1.3);
            circle.stroke('#ffffff');
            circle.strokeWidth(2);
            
            // 그룹 편집 모드에서 그룹 미리보기 해제
            if (this.editMode === 'group') {
                this.hideGroupPreview();
            }
            
            
            document.body.style.cursor = 'default';
            this.poseLayer.draw();
        });
    }
    
    /**
     * 스켈레톤 연결선 업데이트
     */
    updateSkeletonConnections() {
        for (const line of this.skeletonConnections) {
            const startIdx = line.attrs.connectionStartIdx;
            const endIdx = line.attrs.connectionEndIdx;
            
            // 해당하는 키포인트 찾기
            const startKeypoint = this.poseKeypoints.find(kp => kp.attrs.keypointIndex === startIdx);
            const endKeypoint = this.poseKeypoints.find(kp => kp.attrs.keypointIndex === endIdx);
            
            if (startKeypoint && endKeypoint) {
                const startPos = startKeypoint.position();
                const endPos = endKeypoint.position();
                
                line.points([startPos.x, startPos.y, endPos.x, endPos.y]);
            }
        }
        
        this.poseLayer.draw();
    }
    
    /**
     * 키포인트로부터 JSON 데이터 업데이트
     */
    updatePoseDataFromKeypoints() {
        if (!this.originalPoseData?.people || this.originalPoseData.people.length === 0) {
            return;
        }
        
        // 수정된 포즈 데이터 복사 생성
        this.modifiedPoseData = JSON.parse(JSON.stringify(this.originalPoseData));
        const person = this.modifiedPoseData.people[0];
        
        // 각 키포인트의 현재 위치를 JSON에 반영
        for (const keypoint of this.poseKeypoints) {
            const index = keypoint.attrs.keypointIndex;
            const pos = keypoint.position();
            
            // 캔버스 좌표를 원본 이미지 좌표로 역변환
            const originalX = (pos.x / this.canvasWidth) * this.getOriginalImageWidth();
            const originalY = (pos.y / this.canvasHeight) * this.getOriginalImageHeight();
            
            // 인덱스 타입에 따라 적절한 데이터 배열 업데이트
            if (typeof index === 'number') {
                // Body 키포인트 (숫자 인덱스)
                person.pose_keypoints_2d[index * 3] = originalX;
                person.pose_keypoints_2d[index * 3 + 1] = originalY;
                // confidence는 그대로 유지
            } else if (typeof index === 'string') {
                // Hand 키포인트 (L0-L20, R0-R20 형태)
                const handSide = index.charAt(0); // 'L' or 'R'
                const pointIndex = parseInt(index.substring(1)); // 0-20
                
                if (handSide === 'L' && person.hand_left_keypoints_2d) {
                    person.hand_left_keypoints_2d[pointIndex * 3] = originalX;
                    person.hand_left_keypoints_2d[pointIndex * 3 + 1] = originalY;
                } else if (handSide === 'R' && person.hand_right_keypoints_2d) {
                    person.hand_right_keypoints_2d[pointIndex * 3] = originalX;
                    person.hand_right_keypoints_2d[pointIndex * 3 + 1] = originalY;
                }
            }
        }
        
        console.log('[POSE EDITOR] JSON data updated from keypoint positions');
    }
    
    /**
     * 키포인트 색상 결정 (신체 부위별)
     */
    getKeypointColor(index, confidence) {
        // 신뢰도에 따른 투명도
        const alpha = Math.max(0.6, confidence);
        
        // 신체 부위별 색상 구분
        if (index === 0) return `rgba(255, 100, 100, ${alpha})`; // 코 - 빨강
        if (index >= 15 && index <= 18) return `rgba(255, 150, 100, ${alpha})`; // 얼굴 - 주황
        if (index >= 1 && index <= 7) return `rgba(100, 255, 100, ${alpha})`; // 상체 - 초록
        if (index >= 8 && index <= 14) return `rgba(100, 150, 255, ${alpha})`; // 하체 - 파랑
        if (index >= 19 && index <= 24) return `rgba(255, 100, 255, ${alpha})`; // 발 - 마젠타
        
        return `rgba(255, 255, 255, ${alpha})`; // 기본 - 흰색
    }
    
    
    /**
     * 원본 이미지 크기 추정 (스케일링용)
     */
    getOriginalImageWidth() {
        // 이미지 노드에서 원본 크기 가져오기
        if (this.imageNode && this.imageNode.image()) {
            return this.imageNode.image().naturalWidth;
        }
        return 512; // 기본값
    }
    
    getOriginalImageHeight() {
        // 이미지 노드에서 원본 크기 가져오기
        if (this.imageNode && this.imageNode.image()) {
            return this.imageNode.image().naturalHeight;
        }
        return 512; // 기본값
    }

    /**
     * 포즈 데이터 패널 업데이트 (실시간 피드백 포함)
     */
    updateDataPanel() {
        const panel = this.workflowModal.dataPanel;
        const currentData = this.modifiedPoseData || this.originalPoseData;
        const hasModifications = !!this.modifiedPoseData;
        
        panel.innerHTML = `
            <h3 style="color: #4a9eff; margin: 0 0 20px 0; font-size: 18px;">📊 포즈 에디터</h3>
            
            ${hasModifications ? `
            <!-- 수정된 상태 표시 -->
            <div style="background: rgba(255, 193, 7, 0.2); padding: 10px; border-radius: 8px; margin-bottom: 20px; 
                        border-left: 4px solid #ffc107;">
                <p style="color: #ffc107; margin: 0; font-weight: bold;">⚠️ 수정됨</p>
                <small style="color: #ccc;">키포인트가 수정되었습니다</small>
            </div>
            ` : ''}
            
            <!-- 통계 정보 -->
            <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 8px; flex: 1;">
                    <h4 style="color: #e8eaed; margin: 0 0 5px 0; font-size: 14px;">키포인트</h4>
                    <p style="color: #4a9eff; margin: 0; font-size: 20px; font-weight: bold;">
                        ${this.getKeypointCount()}개
                    </p>
                </div>
                <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 8px; flex: 1;">
                    <h4 style="color: #e8eaed; margin: 0 0 5px 0; font-size: 14px;">평균 신뢰도</h4>
                    <p style="color: #28a745; margin: 0; font-size: 16px; font-weight: bold;">
                        ${this.calculateAverageConfidence()}%
                    </p>
                </div>
            </div>
            
            <!-- 편집 모드 토글 -->
            <div style="background: rgba(0, 0, 0, 0.3); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="color: #e8eaed; margin: 0 0 10px 0; font-size: 14px;">✋ 편집 모드</h4>
                <div style="display: flex; gap: 10px;">
                    <button id="groupEditBtn" style="
                        flex: 1; padding: 8px; border: none; border-radius: 6px; cursor: pointer;
                        background: ${this.editMode === 'group' ? '#4a9eff' : 'rgba(255,255,255,0.1)'};
                        color: ${this.editMode === 'group' ? 'white' : '#ccc'};
                        font-size: 12px; font-weight: bold;
                    ">그룹 편집</button>
                    <button id="individualEditBtn" style="
                        flex: 1; padding: 8px; border: none; border-radius: 6px; cursor: pointer;
                        background: ${this.editMode === 'individual' ? '#4a9eff' : 'rgba(255,255,255,0.1)'};
                        color: ${this.editMode === 'individual' ? 'white' : '#ccc'};
                        font-size: 12px; font-weight: bold;
                    ">개별 편집</button>
                </div>
                <small style="color: #999; margin-top: 8px; display: block;">
                    ${this.editMode === 'group' ? '손가락을 드래그하면 해당 손가락 전체가 함께 움직입니다' : '각 키포인트를 개별적으로 편집할 수 있습니다'}
                </small>
            </div>
            
            <!-- 도움말 -->
            <div style="background: rgba(0, 123, 255, 0.1); padding: 10px; border-radius: 8px; border: 1px solid rgba(74, 158, 255, 0.3);">
                <h4 style="color: #4a9eff; margin: 0 0 8px 0; font-size: 14px;">💡 사용법</h4>
                <ul style="color: #ccc; margin: 0; padding-left: 15px; font-size: 12px; line-height: 1.4;">
                    <li>키포인트를 드래그하여 위치 조정</li>
                    <li>마우스 호버로 키포인트 정보 확인</li>
                    <li>"Apply to Canvas"로 메인 캔버스에 적용</li>
                </ul>
            </div>
        `;
        
        // 편집 모드 토글 버튼 이벤트 리스너 추가
        const groupEditBtn = document.getElementById('groupEditBtn');
        const individualEditBtn = document.getElementById('individualEditBtn');
        
        if (groupEditBtn) {
            groupEditBtn.addEventListener('click', () => {
                this.setEditMode('group');
            });
        }
        
        if (individualEditBtn) {
            individualEditBtn.addEventListener('click', () => {
                this.setEditMode('individual');
            });
        }
    }

    /**
     * 키포인트 목록 생성 (실시간 좌표 표시)
     */
    generateKeypointsList() {
        if (!this.poseKeypoints || this.poseKeypoints.length === 0) {
            return '<p style="color: #666; font-style: italic;">키포인트가 없습니다</p>';
        }
        
        let listHTML = '';
        
        this.poseKeypoints.forEach((keypoint, idx) => {
            const index = keypoint.attrs.keypointIndex;
            const pos = keypoint.position();
            const confidence = keypoint.attrs.confidence;
            const color = this.getKeypointColor(index, confidence);
            
            // 원본 이미지 좌표로 변환
            const originalX = Math.round((pos.x / this.canvasWidth) * this.getOriginalImageWidth());
            const originalY = Math.round((pos.y / this.canvasHeight) * this.getOriginalImageHeight());
            
            listHTML += `
                <div style="display: flex; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="color: #e8eaed; font-size: 12px; font-weight: 500;">
                            ${index}. ${this.keypointNames[index]}
                        </div>
                        <div style="color: #999; font-size: 11px; font-family: monospace;">
                            (${originalX}, ${originalY}) · ${(confidence * 100).toFixed(0)}%
                        </div>
                    </div>
                </div>
            `;
        });
        
        return listHTML;
    }

    /**
     * 유틸리티 함수들
     */
    async getImageAsBase64(imageNode) {
        // Konva 이미지 노드를 base64로 변환
        const image = imageNode.image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        ctx.drawImage(image, 0, 0);
        
        return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    }

    getKeypointCount() {
        if (!this.originalPoseData?.people || this.originalPoseData.people.length === 0) {
            return 0;
        }
        
        const person = this.originalPoseData.people[0];
        if (!person.pose_keypoints_2d) {
            return 0;
        }
        
        return person.pose_keypoints_2d.length / 3; // x, y, confidence
    }

    calculateAverageConfidence() {
        if (!this.originalPoseData?.people || this.originalPoseData.people.length === 0) {
            return '0';
        }
        
        const person = this.originalPoseData.people[0];
        if (!person.pose_keypoints_2d) {
            return '0';
        }
        
        // OpenPose 형식: [x1, y1, c1, x2, y2, c2, ...]에서 confidence만 추출
        const confidences = [];
        for (let i = 2; i < person.pose_keypoints_2d.length; i += 3) {
            const confidence = person.pose_keypoints_2d[i];
            if (confidence > 0) {
                confidences.push(confidence);
            }
        }
            
        if (confidences.length === 0) return '0';
        
        const average = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        return Math.round(average * 100);
    }

    downloadPoseJSON(poseData) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `pose_keypoints_${timestamp}.json`;
        
        const jsonBlob = new Blob([JSON.stringify(poseData, null, 2)], { 
            type: 'application/json' 
        });
        const url = URL.createObjectURL(jsonBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        console.log(`[POSE WORKFLOW] 💾 JSON Downloaded: ${filename}`);
    }

    async renderSkeletonFromJSON(poseData) {
        console.log('[POSE WORKFLOW] Rendering skeleton from JSON');
        
        try {
            // 원본 이미지 크기 정보 가져오기
            const originalWidth = this.getOriginalImageWidth();
            const originalHeight = this.getOriginalImageHeight();
            
            console.log('[POSE WORKFLOW] Using original image dimensions:', { originalWidth, originalHeight });
            
            const requestData = {
                pose_data: poseData,
                image_width: originalWidth,
                image_height: originalHeight,
                line_width: 2,
                point_radius: 4,
                background_color: [0, 0, 0],  // 검은색 배경
                skeleton_color: [255, 255, 255]  // 흰색 스켈레톤
            };

            const response = await fetch('/api/pose/render', {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`Render API 요청 실패: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            if (!result.skeleton_image) {
                throw new Error('스켈레톤 이미지를 생성할 수 없습니다');
            }

            return result.skeleton_image;
            
        } catch (error) {
            console.error('[POSE WORKFLOW] Skeleton rendering failed:', error);
            throw new Error(`스켈레톤 렌더링 실패: ${error.message}`);
        }
    }

    async applyToMainCanvas(skeletonImage) {
        try {
            console.log('[POSE WORKFLOW] Applying skeleton image to main canvas');
            
            // 캔버스 레이어 직접 접근 (동적 import 대신)
            const layer = window.canvasInstance && window.canvasInstance.getLayer ? 
                         window.canvasInstance.getLayer() : 
                         null;
            if (!layer) {
                throw new Error('캔버스 레이어를 찾을 수 없습니다');
            }

            // base64 데이터를 Image 객체로 변환
            const img = new window.Image();
            
            return new Promise((resolve, reject) => {
                img.onload = () => {
                    try {
                        // 원본 이미지와 같은 위치에 배치할 좌표 계산 (다른 전처리 이미지들과 동일한 방식)
                        const originalX = this.imageNode.x();
                        const originalY = this.imageNode.y();
                        const originalWidth = this.imageNode.width();
                        const originalHeight = this.imageNode.height();
                        const originalScaleX = this.imageNode.scaleX();
                        const originalScaleY = this.imageNode.scaleY();
                        const originalRotation = this.imageNode.rotation();
                        console.log(`📍 Original image position: (${originalX.toFixed(1)}, ${originalY.toFixed(1)})`);
                        
                        // Konva Image 노드 생성 (preprocessed image 형태로)
                        const skeletonImageNode = new window.Konva.Image({
                            image: img,
                            x: originalX,
                            y: originalY,
                            width: originalWidth,
                            height: originalHeight,
                            scaleX: originalScaleX,
                            scaleY: originalScaleY,
                            rotation: originalRotation,
                            draggable: true,
                            name: 'pose-skeleton-image',
                            // 커스텀 속성들 (preprocessing manager와 동일한 패턴)
                            imageType: 'preproc', // 전처리된 이미지 타입
                            processingSource: 'pose_processing', // 포즈 처리 소스
                            originalImageId: this.originalImageData?.id || null, // 원본 이미지 ID
                            createdAt: new Date().toISOString(), // 생성 시간
                            processingParams: {
                                type: 'pose',
                                processor: 'openpose',
                                modified: true,
                                workflow: 'pose_editor'
                            }
                        });
                        
                        // 이미지 중심을 좌표 중심에 맞춤
                        skeletonImageNode.offsetX(img.width / 2);
                        skeletonImageNode.offsetY(img.height / 2);
                        
                        // 레이어에 추가
                        layer.add(skeletonImageNode);
                        layer.batchDraw();
                        
                        // 다른 전처리 이미지들과 동일하게 transformer 활성화
                        // Canvas와 transformer 모듈 직접 호출 (동적 import 대신)
                        if (window.canvasInstance && window.canvasInstance.setSelectedImage) {
                            window.canvasInstance.setSelectedImage(skeletonImageNode);
                            console.log('🎯 Selected OpenPose skeleton image');
                        }
                        
                        // Transform 모드는 더블클릭으로 활성화하도록 안내
                        console.log('💡 Double-click the skeleton image to activate transform mode');
                        
                        console.log('[POSE WORKFLOW] ✅ Skeleton image successfully added to canvas');
                        console.log('[POSE WORKFLOW] Image properties:', {
                            width: img.width,
                            height: img.height,
                            position: { x: originalX, y: originalY },
                            imageType: 'preproc'
                        });
                        
                        resolve(skeletonImageNode);
                        
                    } catch (error) {
                        console.error('[POSE WORKFLOW] Error creating Konva image:', error);
                        reject(error);
                    }
                };
                
                img.onerror = () => {
                    const error = new Error('스켈레톤 이미지 로드 실패');
                    console.error('[POSE WORKFLOW] Image load failed');
                    reject(error);
                };
                
                // 이미지 로드 시작 - base64 데이터를 올바른 data URL 형식으로 변환
                if (skeletonImage.startsWith('data:')) {
                    // 이미 data URL 형식인 경우
                    img.src = skeletonImage;
                } else {
                    // base64 문자열인 경우 data URL로 변환
                    img.src = `data:image/png;base64,${skeletonImage}`;
                }
            });
            
        } catch (error) {
            console.error('[POSE WORKFLOW] Failed to apply skeleton to canvas:', error);
            throw new Error(`캔버스 적용 실패: ${error.message}`);
        }
    }

    resetPoseData() {
        console.log('[POSE WORKFLOW] Resetting pose data to original');
        this.modifiedPoseData = { ...this.originalPoseData };
        this.updateDataPanel();
    }

    downloadModifiedJSON() {
        const dataToDownload = this.modifiedPoseData || this.originalPoseData;
        this.downloadPoseJSON(dataToDownload);
    }

    async confirmApplyChanges() {
        const modifiedData = this.modifiedPoseData || this.originalPoseData;
        await this.handleModifiedPose(modifiedData);
    }

    closeWorkflowModal() {
        if (this.workflowModal?.element) {
            document.body.removeChild(this.workflowModal.element);
            this.workflowModal = null;
        }
    }

    showError(message) {
        // 간단한 에러 표시
        alert(`포즈 워크플로우 오류: ${message}`);
    }
    
    /**
     * 손가락 그룹 드래그 시작 - 상대 위치 저장 및 시각적 피드백
     */
    startFingerGroupDrag(draggedGroup, draggedIndex) {
        const fingerGroup = this.getFingerGroupFromIndex(draggedIndex);
        if (!fingerGroup) return; // 손가락 키포인트가 아니면 개별 편집
        
        // 현재 드래그 중인 그룹 정보 저장
        this.currentDragGroup = fingerGroup;
        
        // 드래그되는 키포인트의 현재 위치
        const draggedPos = draggedGroup.position();
        
        // 해당 손가락 그룹의 모든 키포인트들과의 상대 위치 저장
        this.fingerGroupOffsets = [];
        
        // 그룹 키포인트들 시각적 하이라이트
        for (const groupIndex of fingerGroup.indices) {
            const groupKeypoint = this.findKeypointByIndex(groupIndex);
            if (groupKeypoint) {
                // 드래그 중인 키포인트가 아닌 경우 상대 위치 저장
                if (groupIndex !== draggedIndex) {
                    const groupPos = groupKeypoint.position();
                    this.fingerGroupOffsets.push({
                        keypoint: groupKeypoint,
                        offsetX: groupPos.x - draggedPos.x,
                        offsetY: groupPos.y - draggedPos.y
                    });
                }
                
                // 그룹 전체를 시각적으로 강조
                const circle = groupKeypoint.findOne('Circle');
                if (circle) {
                    circle.stroke('#ffff00'); // 노란색 테두리
                    circle.strokeWidth(3);
                    circle.opacity(0.9);
                }
            }
        }
        
        
        this.poseLayer.draw();
        console.log(`[POSE EDITOR] Started finger group drag for ${fingerGroup.hand} ${fingerGroup.name} (${this.fingerGroupOffsets.length} linked points)`);
    }
    
    /**
     * 손가락 그룹 드래그 업데이트 - 연관 키포인트들 이동
     */
    updateFingerGroupDrag(draggedGroup, draggedIndex) {
        if (!this.fingerGroupOffsets || this.fingerGroupOffsets.length === 0) return;
        
        const draggedPos = draggedGroup.position();
        
        // 저장된 상대 위치를 기반으로 연관 키포인트들 이동
        for (const offset of this.fingerGroupOffsets) {
            offset.keypoint.position({
                x: draggedPos.x + offset.offsetX,
                y: draggedPos.y + offset.offsetY
            });
        }
        
        
        // 실시간 스켈레톤 연결선 업데이트
        this.updateSkeletonConnections();
        this.poseLayer.draw();
    }
    
    /**
     * 손가락 그룹 드래그 종료 - 하이라이트 제거
     */
    endFingerGroupDrag() {
        if (!this.currentDragGroup) return;
        
        // 그룹 하이라이트 제거
        for (const groupIndex of this.currentDragGroup.indices) {
            const groupKeypoint = this.findKeypointByIndex(groupIndex);
            if (groupKeypoint) {
                // 원래 스타일로 복원
                const circle = groupKeypoint.findOne('Circle');
                if (circle) {
                    circle.stroke('#4a9eff');
                    circle.strokeWidth(2);
                    circle.opacity(0.8);
                }
            }
        }
        
        
        // 상태 초기화
        this.currentDragGroup = null;
        this.fingerGroupOffsets = [];
        
        this.poseLayer.draw();
        console.log('[POSE EDITOR] Ended finger group drag');
    }
    
    /**
     * 키포인트 인덱스에서 손가락 그룹 정보 가져오기
     */
    getFingerGroupFromIndex(index) {
        // 손 키포인트인지 확인 (L0-L20, R0-R20)
        if (typeof index !== 'string' || (!index.startsWith('L') && !index.startsWith('R'))) {
            return null; // 몸체 키포인트는 그룹 편집 안함
        }
        
        const hand = index.charAt(0); // 'L' or 'R'
        const pointIndex = parseInt(index.substring(1)); // 0-20
        
        // 손목(0)은 그룹 편집 안함
        if (pointIndex === 0) return null;
        
        // 어떤 손가락 그룹에 속하는지 확인
        for (const [groupName, indices] of Object.entries(this.fingerGroups)) {
            if (indices.includes(pointIndex)) {
                return {
                    name: groupName,
                    hand: hand,
                    indices: indices.map(i => `${hand}${i}`) // L1, L2, ... 형태로 변환
                };
            }
        }
        
        return null;
    }
    
    /**
     * 인덱스로 키포인트 찾기
     */
    findKeypointByIndex(index) {
        return this.poseKeypoints.find(kp => kp.attrs.keypointIndex === index);
    }
    
    
    /**
     * 그룹 미리보기 표시 (호버시)
     */
    showGroupPreview(hoveredIndex) {
        const fingerGroup = this.getFingerGroupFromIndex(hoveredIndex);
        if (!fingerGroup) return;
        
        // 이미 미리보기 중이면 초기화
        this.hideGroupPreview();
        
        this.groupPreviewKeypoints = [];
        
        // 그룹의 모든 키포인트에 미리보기 효과 적용
        for (const groupIndex of fingerGroup.indices) {
            const groupKeypoint = this.findKeypointByIndex(groupIndex);
            if (groupKeypoint && groupIndex !== hoveredIndex) {
                // Group 내부의 Circle 객체에 접근
                const circle = groupKeypoint.findOne('Circle');
                if (circle) {
                    // 원래 스타일 저장
                    const originalStroke = circle.stroke();
                    const originalStrokeWidth = circle.strokeWidth();
                    const originalOpacity = circle.opacity();
                    
                    this.groupPreviewKeypoints.push({
                        keypoint: groupKeypoint,
                        circle: circle,
                        originalStroke,
                        originalStrokeWidth,
                        originalOpacity
                    });
                    
                    // 미리보기 스타일 적용 (연한 노란색)
                    circle.stroke('#ffff88');
                    circle.strokeWidth(2.5);
                    circle.opacity(0.7);
                }
            }
        }
        
        this.poseLayer.draw();
    }
    
    /**
     * 그룹 미리보기 숨기기
     */
    hideGroupPreview() {
        if (!this.groupPreviewKeypoints) return;
        
        // 원래 스타일로 복원
        for (const preview of this.groupPreviewKeypoints) {
            if (preview.circle) {
                preview.circle.stroke(preview.originalStroke);
                preview.circle.strokeWidth(preview.originalStrokeWidth);
                preview.circle.opacity(preview.originalOpacity);
            }
        }
        
        this.groupPreviewKeypoints = [];
        this.poseLayer.draw();
    }
    
    /**
     * 편집 모드 변경
     */
    setEditMode(mode) {
        this.editMode = mode;
        console.log(`[POSE EDITOR] Edit mode changed to: ${mode}`);
        
        // UI 업데이트
        this.updateDataPanel();
        
        // 시각적 피드백 (선택적)
        if (mode === 'group') {
            console.log('[POSE EDITOR] Group editing enabled: 손가락을 드래그하면 해당 손가락 전체가 함께 움직입니다');
        } else {
            console.log('[POSE EDITOR] Individual editing enabled: 각 키포인트를 개별적으로 편집할 수 있습니다');
        }
    }
}

/**
 * 전역 헬퍼 함수 - 기존 코드와의 호환성
 */
export async function startPoseWorkflow(imageNode, processor, parameters) {
    const workflow = new PoseWorkflowManager(imageNode);
    await workflow.startWorkflow(processor, parameters);
    return workflow;
}