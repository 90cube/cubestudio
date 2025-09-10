"""
DWPose Detection Preprocessor for CUBE Studio
Enhanced pose detection with DWPose implementation using relative paths.
"""

import os
import logging
from typing import Any, Dict, Optional, List, Tuple
import numpy as np
import cv2

from .base_preprocessor import BasePreprocessor, ModelLoadError, ProcessingError

logger = logging.getLogger(__name__)


class DWPosePreprocessor(BasePreprocessor):
    """Enhanced DWPose detection preprocessor with relative path support."""
    
    def __init__(self, processor_id: str, model_path: Optional[str] = None, **kwargs):
        """
        Initialize DWPose preprocessor.
        
        Args:
            processor_id: Processor identifier (e.g., 'dwpose', 'dwpose_wholebody')
            model_path: Relative path to model weights file from project root
        """
        super().__init__(processor_id, model_path, **kwargs)
        
        # DWPose-specific settings
        self.pose_type = self._determine_pose_type()
        self.joint_connections = self._get_joint_connections()
        self.model_files = self._get_required_model_files()
        
    def _get_required_model_files(self) -> Dict[str, str]:
        """Get required model files with relative paths."""
        return {
            'det_model': 'models/preprocessors/yolox_l.onnx',
            'pose_model': 'models/preprocessors/dw-ll_ucoco_384.onnx'
        }
        
    def _determine_pose_type(self) -> str:
        """Determine pose detection type from processor_id."""
        if 'wholebody' in self.processor_id.lower():
            return 'wholebody'
        elif 'body' in self.processor_id.lower():
            return 'body'
        elif 'hand' in self.processor_id.lower():
            return 'hand'
        elif 'face' in self.processor_id.lower():
            return 'face'
        else:
            return 'wholebody'  # Default to full body detection
    
    def _get_joint_connections(self) -> List[Tuple[int, int]]:
        """Get joint connections for drawing skeleton."""
        if self.pose_type in ['body', 'wholebody']:
            # DWPose body model connections (17 keypoints)
            return [
                # Head
                (0, 1), (0, 2), (1, 3), (2, 4),
                # Torso
                (5, 6), (5, 7), (6, 8), (7, 9), (8, 10),
                (5, 11), (6, 12), (11, 12), (11, 13), (12, 14), (13, 15), (14, 16)
            ]
        elif self.pose_type == 'hand':
            # Hand connections (21 points per hand)
            connections = []
            # Thumb (0-4)
            for i in range(4):
                connections.append((i, i+1))
            # Index finger (5-8)
            for i in range(5, 8):
                connections.append((i, i+1))
            connections.append((0, 5))
            # Middle finger (9-12)
            for i in range(9, 12):
                connections.append((i, i+1))
            connections.append((0, 9))
            # Ring finger (13-16)
            for i in range(13, 16):
                connections.append((i, i+1))
            connections.append((0, 13))
            # Pinky (17-20)
            for i in range(17, 20):
                connections.append((i, i+1))
            connections.append((0, 17))
            return connections
        else:
            return []  # Face connections would be more complex
    
    def get_default_parameters(self) -> Dict[str, Any]:
        """Get default parameters for DWPose detection."""
        base_params = {
            'threshold': 0.3,         # 0.0 to 1.0
            'line_width': 2,          # 1 to 10
            'point_radius': 4,        # 1 to 10
            'detect_body': True,      # True/False
            'detect_hand': True,      # True/False
            'detect_face': False,     # True/False
            'draw_skeleton': True,    # True/False
            'draw_points': True,      # True/False
            'skeleton_color': 'white',   # 'white', 'black', 'red', 'green', 'blue'
            'point_color': 'red',     # 'white', 'black', 'red', 'green', 'blue'
            'background_color': 'black',  # 'black', 'white', 'transparent'
            'output_format': 'image'  # 'image', 'json', 'both'
        }
        
        # Type-specific parameters
        if self.pose_type in ['body', 'wholebody']:
            base_params.update({
                'body_threshold': 0.3,    # 0.1 to 1.0
                'min_keypoints': 5        # 1 to 17
            })
        if self.pose_type in ['hand', 'wholebody']:
            base_params.update({
                'hand_threshold': 0.3,    # 0.1 to 1.0
                'min_hand_keypoints': 8   # 1 to 21
            })
        if self.pose_type in ['face', 'wholebody']:
            base_params.update({
                'face_threshold': 0.3,    # 0.1 to 1.0
                'min_face_keypoints': 10  # 1 to 68
            })
        
        return base_params
    
    def get_parameter_schema(self) -> Dict[str, Dict[str, Any]]:
        """Get parameter validation schema."""
        base_schema = {
            'threshold': {
                'type': 'float',
                'min': 0.0,
                'max': 1.0,
                'default': 0.3,
                'description': 'Overall confidence threshold for pose detection'
            },
            'line_width': {
                'type': 'int',
                'min': 1,
                'max': 10,
                'default': 2,
                'description': 'Width of skeleton lines'
            },
            'point_radius': {
                'type': 'int',
                'min': 1,
                'max': 10,
                'default': 4,
                'description': 'Radius of joint points'
            },
            'detect_body': {
                'type': 'bool',
                'default': True,
                'description': 'Detect body poses'
            },
            'detect_hand': {
                'type': 'bool',
                'default': True,
                'description': 'Detect hand poses'
            },
            'detect_face': {
                'type': 'bool',
                'default': False,
                'description': 'Detect facial keypoints'
            },
            'draw_skeleton': {
                'type': 'bool',
                'default': True,
                'description': 'Draw skeleton connections'
            },
            'draw_points': {
                'type': 'bool',
                'default': True,
                'description': 'Draw joint points'
            },
            'skeleton_color': {
                'type': 'str',
                'default': 'white',
                'description': 'Color for skeleton lines'
            },
            'point_color': {
                'type': 'str',
                'default': 'red',
                'description': 'Color for joint points'
            },
            'background_color': {
                'type': 'str',
                'default': 'black',
                'description': 'Background color for pose output'
            },
            'output_format': {
                'type': 'str',
                'default': 'image',
                'description': 'Output format: image, json, or both'
            }
        }
        
        return base_schema
    
    def _load_model_impl(self) -> Any:
        """Load the DWPose model."""
        try:
            # Get project root directory
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            
            # Check if ONNX models are available
            det_model_path = os.path.join(project_root, self.model_files['det_model'])
            pose_model_path = os.path.join(project_root, self.model_files['pose_model'])
            
            if not os.path.exists(det_model_path) or not os.path.exists(pose_model_path):
                logger.warning(f"DWPose ONNX models not found, using fallback implementation")
                return None
                
            # Try to load ONNX runtime if available
            try:
                import onnxruntime as ort
                
                # Create ONNX sessions with relative paths
                det_session = ort.InferenceSession(det_model_path)
                pose_session = ort.InferenceSession(pose_model_path)
                
                logger.info(f"DWPose ONNX models loaded successfully from {det_model_path} and {pose_model_path}")
                return {
                    'det_session': det_session,
                    'pose_session': pose_session,
                    'type': 'onnx'
                }
                
            except ImportError:
                logger.warning("ONNX Runtime not available, using fallback implementation")
                return None
                
        except Exception as e:
            logger.warning(f"Failed to load DWPose model: {e}, using fallback")
            return None
    
    def _get_color(self, color_name: str) -> Tuple[int, int, int]:
        """Convert color name to RGB tuple."""
        color_map = {
            'white': (255, 255, 255),
            'black': (0, 0, 0),
            'red': (255, 0, 0),
            'green': (0, 255, 0),
            'blue': (0, 0, 255),
            'yellow': (255, 255, 0),
            'cyan': (0, 255, 255),
            'magenta': (255, 0, 255)
        }
        return color_map.get(color_name.lower(), (255, 255, 255))
    
    def _process_impl(self, image: np.ndarray, params: Dict[str, Any]) -> Any:
        """Main DWPose detection implementation."""
        try:
            output_format = params.get('output_format', 'image')
            
            if self.model is not None and self.model.get('type') == 'onnx':
                # Use ONNX model for pose detection
                pose_data = self._process_onnx_pose(image, params)
            else:
                # Use built-in fallback
                pose_data = self._process_builtin_pose(image, params)
            
            # Return based on output format
            if output_format == 'json':
                return pose_data
            elif output_format == 'both':
                skeleton_image = self._render_skeleton_from_data(image, pose_data, params)
                return {
                    'image': skeleton_image,
                    'json': pose_data
                }
            else:  # 'image' (default)
                return self._render_skeleton_from_data(image, pose_data, params)
                
        except Exception as e:
            raise ProcessingError(f"DWPose detection failed: {e}")
    
    def _process_onnx_pose(self, image: np.ndarray, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process pose using ONNX model."""
        # TODO: Implement actual ONNX inference
        logger.warning("ONNX pose processing not yet implemented, using fallback")
        return self._process_builtin_pose(image, params)
    
    def _process_builtin_pose(self, image: np.ndarray, params: Dict[str, Any]) -> Dict[str, Any]:
        """Process pose using built-in algorithm (simplified for JSON output)."""
        height, width = image.shape[:2]
        
        # Simple pose estimation using edge detection and contour analysis
        # Convert to grayscale for analysis
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        else:
            gray = image
        
        # Detect edges and find contours
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Create JSON pose data structure
        pose_data = {
            'people': [],
            'canvas_width': width,
            'canvas_height': height,
            'version': '1.0'
        }
        
        if len(contours) > 0:
            # Find the largest contour (likely the main subject)
            largest_contour = max(contours, key=cv2.contourArea)
            
            if cv2.contourArea(largest_contour) > 1000:  # Minimum area threshold
                # Generate simplified keypoints from contour
                keypoints = self._generate_keypoints_from_contour(largest_contour, width, height)
                
                person = {
                    'person_id': 0,
                    'pose_keypoints_2d': keypoints,
                    'hand_left_keypoints_2d': [],
                    'hand_right_keypoints_2d': [],
                    'face_keypoints_2d': [],
                    'pose_score': 0.8  # Confidence score
                }
                
                pose_data['people'].append(person)
        
        return pose_data
    
    def _generate_keypoints_from_contour(self, contour, width: int, height: int) -> List[float]:
        """Generate keypoints from contour approximation."""
        # Approximate contour to get key points
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        
        # Create 17 keypoints for body pose (COCO format)
        keypoints = []
        
        if len(approx) >= 4:
            points = [(float(p[0][0]), float(p[0][1])) for p in approx]
            
            # Map approximated points to standard pose keypoints
            # This is a very simplified mapping - real implementation would use trained models
            for i in range(17):  # COCO has 17 keypoints
                if i < len(points):
                    x, y = points[i]
                    # Normalize coordinates
                    x_norm = x / width
                    y_norm = y / height
                    confidence = 0.8  # Simplified confidence
                    keypoints.extend([x_norm, y_norm, confidence])
                else:
                    keypoints.extend([0.0, 0.0, 0.0])  # No detection
        else:
            # No valid keypoints found
            keypoints = [0.0, 0.0, 0.0] * 17
        
        return keypoints
    
    def _render_skeleton_from_data(self, image: np.ndarray, pose_data: Dict[str, Any], params: Dict[str, Any]) -> np.ndarray:
        """Render skeleton image from pose data."""
        height, width = image.shape[:2]
        
        # Create output canvas
        background_color = params.get('background_color', 'black')
        if background_color == 'transparent':
            output = np.zeros((height, width, 4), dtype=np.uint8)  # RGBA
        else:
            bg_color = self._get_color(background_color)
            output = np.full((height, width, 3), bg_color, dtype=np.uint8)
        
        # Draw poses
        skeleton_color = self._get_color(params.get('skeleton_color', 'white'))
        point_color = self._get_color(params.get('point_color', 'red'))
        line_width = params.get('line_width', 2)
        point_radius = params.get('point_radius', 4)
        
        for person in pose_data.get('people', []):
            keypoints = person.get('pose_keypoints_2d', [])
            
            if len(keypoints) >= 51:  # 17 keypoints * 3 (x, y, confidence)
                # Extract points
                points = []
                for i in range(0, len(keypoints), 3):
                    x_norm, y_norm, conf = keypoints[i:i+3]
                    if conf > params.get('threshold', 0.3):
                        x = int(x_norm * width)
                        y = int(y_norm * height)
                        points.append((x, y))
                    else:
                        points.append(None)
                
                # Draw skeleton connections
                if params.get('draw_skeleton', True):
                    for connection in self.joint_connections:
                        idx1, idx2 = connection
                        if idx1 < len(points) and idx2 < len(points):
                            p1, p2 = points[idx1], points[idx2]
                            if p1 is not None and p2 is not None:
                                cv2.line(output, p1, p2, skeleton_color, line_width)
                
                # Draw keypoints
                if params.get('draw_points', True):
                    for point in points:
                        if point is not None:
                            cv2.circle(output, point, point_radius, point_color, -1)
        
        return output
    
    def _fallback_process(self, image: np.ndarray, params: Dict[str, Any]) -> Any:
        """Fallback pose processing using built-in algorithm."""
        logger.info(f"Using fallback pose processing for {self.processor_id}")
        return self._process_builtin_pose(image, params)
    
    def postprocess_image(self, result: Any, params: Dict[str, Any]) -> Any:
        """Post-process pose output."""
        output_format = params.get('output_format', 'image')
        
        if output_format == 'json':
            return result
        elif output_format == 'both':
            # Ensure image is RGB format
            if 'image' in result:
                image = result['image']
                if len(image.shape) == 4:  # RGBA
                    # Convert RGBA to RGB with background
                    alpha = image[:, :, 3:4] / 255.0
                    rgb = image[:, :, :3]
                    background = np.full_like(rgb, self._get_color(params.get('background_color', 'black')))
                    image = (rgb * alpha + background * (1 - alpha)).astype(np.uint8)
                    result['image'] = image
            return result
        else:  # 'image'
            # Ensure RGB format
            if len(result.shape) == 4:  # RGBA
                # Convert RGBA to RGB with background
                alpha = result[:, :, 3:4] / 255.0
                rgb = result[:, :, :3]
                background = np.full_like(rgb, self._get_color(params.get('background_color', 'black')))
                result = (rgb * alpha + background * (1 - alpha)).astype(np.uint8)
            
            return super().postprocess_image(result, params)


class DWPoseWholeBodyPreprocessor(DWPosePreprocessor):
    """Specialized DWPose whole body detection preprocessor."""
    
    def __init__(self, processor_id='dwpose_wholebody', model_path: Optional[str] = None, **kwargs):
        super().__init__(processor_id, model_path, **kwargs)


class DWPoseBuiltinPreprocessor(DWPosePreprocessor):
    """Built-in DWPose detection preprocessor (fallback implementation)."""
    
    def __init__(self, processor_id='dwpose_builtin', **kwargs):
        super().__init__(processor_id, None, **kwargs)