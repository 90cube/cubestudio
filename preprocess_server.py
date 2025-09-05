#!/usr/bin/env python3
"""
ControlNet 전처리기 백엔드 서버
실시간 미리보기를 위한 경량 API 서버
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
import io
from PIL import Image
import os
import json

app = Flask(__name__)
CORS(app)  # 모든 도메인에서 접근 허용

# 모델 경로
MODELS_DIR = "./models/preprocessors"

class PreprocessorManager:
    """전처리기 모델 매니저"""
    
    def __init__(self):
        self.models = {}
        self.load_models()
    
    def load_models(self):
        """사용 가능한 모델들 로드"""
        model_configs = {
            'builtin': {'name': '내장 알고리즘 (JavaScript)', 'type': 'builtin'},
            'opencv_canny': {'name': 'OpenCV Canny', 'type': 'opencv'},
            'network-bsds500': {'name': 'HED Edge Detection', 'type': 'model', 'file': 'network-bsds500.pth'},
            'table5_pidinet': {'name': 'PiDiNet Edge Detection', 'type': 'model', 'file': 'table5_pidinet.pth'},
            'ControlNetHED': {'name': 'ControlNet HED', 'type': 'model', 'file': 'ControlNetHED.pth'},
            'dpt_hybrid-midas': {'name': 'MiDaS Depth', 'type': 'model', 'file': 'dpt_hybrid-midas-501f0c75.pt'},
            'midas_v21_384': {'name': 'MiDaS v2.1', 'type': 'model', 'file': 'midas_v21_384.pt'},
            'ZoeD_M12_N': {'name': 'ZoeDepth', 'type': 'model', 'file': 'ZoeD_M12_N.pt'},
        }
        
        for model_id, config in model_configs.items():
            if config['type'] in ['builtin', 'opencv']:
                self.models[model_id] = config
            else:
                # 실제 모델 파일이 존재하는지 확인
                model_path = os.path.join(MODELS_DIR, config['file'])
                if os.path.exists(model_path):
                    config['path'] = model_path
                    self.models[model_id] = config
                else:
                    print(f"Model file not found: {model_path}")
    
    def process_image(self, image_data, model_id, params=None):
        """이미지 전처리 실행"""
        if model_id not in self.models:
            raise ValueError(f"Unknown model: {model_id}")
        
        model = self.models[model_id]
        
        # Base64 이미지를 numpy 배열로 변환
        image_array = self.decode_image(image_data)
        
        # 모델 타입에 따라 처리
        if model_id == 'opencv_canny':
            result = self.process_opencv_canny(image_array, params or {})
        elif model['type'] == 'model':
            # 실제 모델은 플레이스홀더로 처리 (실제 구현에서는 모델 로드 필요)
            result = self.process_placeholder(image_array, model['name'])
        else:
            raise ValueError(f"Unsupported model type: {model['type']}")
        
        # 결과를 Base64로 인코딩하여 반환
        return self.encode_image(result)
    
    def decode_image(self, base64_data):
        """Base64 이미지를 numpy 배열로 변환"""
        # data:image/png;base64, 제거
        if 'base64,' in base64_data:
            base64_data = base64_data.split('base64,')[1]
        
        # Base64 디코딩
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # RGB로 변환하고 numpy 배열로 변환
        if image.mode == 'RGBA':
            image = image.convert('RGB')
        
        return np.array(image)
    
    def encode_image(self, image_array):
        """numpy 배열을 Base64 이미지로 변환"""
        # numpy 배열을 PIL 이미지로 변환
        if len(image_array.shape) == 3:
            image = Image.fromarray(image_array.astype(np.uint8))
        else:
            # 그레이스케일인 경우
            image = Image.fromarray(image_array.astype(np.uint8), mode='L')
        
        # Base64로 인코딩
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)
        
        return base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    def process_opencv_canny(self, image, params):
        """OpenCV Canny 엣지 검출"""
        # RGB를 그레이스케일로 변환
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        # 파라미터 추출
        low_threshold = params.get('lowThreshold', 100)
        high_threshold = params.get('highThreshold', 200)
        
        # Canny 엣지 검출
        edges = cv2.Canny(gray, low_threshold, high_threshold)
        
        # 3채널로 변환 (흰색 엣지, 검은색 배경)
        result = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        
        return result
    
    def process_placeholder(self, image, model_name):
        """플레이스홀더 처리 (실제 모델 구현 예정)"""
        height, width = image.shape[:2]
        result = np.zeros((height, width, 3), dtype=np.uint8)
        
        # 플레이스홀더 텍스트 그리기
        result.fill(50)  # 어두운 배경
        
        # OpenCV로 텍스트 그리기
        font = cv2.FONT_HERSHEY_SIMPLEX
        text = f"TODO: {model_name}"
        text_size = cv2.getTextSize(text, font, 0.7, 2)[0]
        text_x = (width - text_size[0]) // 2
        text_y = (height + text_size[1]) // 2
        
        cv2.putText(result, text, (text_x, text_y), font, 0.7, (100, 150, 255), 2)
        
        return result

# 전처리기 매니저 초기화
preprocessor = PreprocessorManager()

@app.route('/api/preprocessors', methods=['GET'])
def get_preprocessors():
    """사용 가능한 전처리기 목록 반환"""
    models_list = []
    for model_id, config in preprocessor.models.items():
        models_list.append({
            'id': model_id,
            'name': config['name'],
            'type': config['type'],
            'file': config.get('file', ''),
            'available': True
        })
    
    return jsonify(models_list)

@app.route('/api/preprocess', methods=['POST'])
def preprocess_image():
    """이미지 전처리 실행"""
    try:
        data = request.get_json()
        
        if not data or 'image' not in data or 'model' not in data:
            return jsonify({'error': 'Missing required fields: image, model'}), 400
        
        image_data = data['image']
        model_id = data['model']
        params = data.get('params', {})
        
        # 전처리 실행
        processed_image = preprocessor.process_image(image_data, model_id, params)
        
        return jsonify({
            'success': True,
            'processed_image': f'data:image/png;base64,{processed_image}',
            'model_used': model_id
        })
        
    except Exception as e:
        print(f"Preprocessing error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'status': 'healthy',
        'models_loaded': len(preprocessor.models),
        'available_models': list(preprocessor.models.keys())
    })

if __name__ == '__main__':
    print("🎛️  ControlNet 전처리기 서버 시작...")
    print(f"📁 모델 디렉토리: {MODELS_DIR}")
    print(f"🎯 로드된 모델: {len(preprocessor.models)}개")
    
    for model_id, config in preprocessor.models.items():
        print(f"   - {model_id}: {config['name']}")
    
    app.run(host='0.0.0.0', port=5000, debug=True)