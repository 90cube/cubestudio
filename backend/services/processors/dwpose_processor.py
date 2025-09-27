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
from .dwpose_easy_adapter import DWPoseEasyAdapter
from ..vendors.easy_dwpose.draw.openpose import draw_pose as draw_openpose
from ...models.config_manager import get_config_manager

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
        self._adapter = None
        
    def _get_required_model_files(self) -> Dict[str, str]:
        """Get required model files with relative paths."""
        return {
            'det_model': 'models/preprocessors/DWPose/yolox_l.onnx',
            'pose_model': 'models/preprocessors/DWPose/dw-ll_ucoco_384.onnx'
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
            'detect_resolution': 512,  # detection input resolution
            'detect_body': True,      # True/False
            'detect_hand': False,     # True/False (use detect_hands; kept for compatibility)
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
            # Get project root directory (go up 3 levels from processors)
            project_root = os.path.abspath(os.path.join(
                os.path.dirname(__file__), '..', '..', '..'
            ))

            # Check if ONNX models are available
            det_model_path = os.path.join(project_root, self.model_files['det_model'])
            pose_model_path = os.path.join(project_root, self.model_files['pose_model'])

            logger.info(f"Looking for models at: {det_model_path}, {pose_model_path}")
            
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
    
    def _get_adapter(self) -> DWPoseEasyAdapter:
        if self._adapter is None:
            config = get_config_manager()
            models_dir = os.path.join(str(config.preprocessors_path), 'DWPose')
            device = 'auto' if self.device in ('cuda', 'auto') else 'cpu'
            self._adapter = DWPoseEasyAdapter(models_dir=models_dir, device=device)
        return self._adapter

    # Compatibility entry: some call sites expect a .process(image, params)
    def process(self, image: np.ndarray, params: Dict[str, Any]) -> Any:
        # Light parameter aliasing for backward compatibility
        params = dict(params or {})
        if 'confidence_threshold' in params and 'threshold' not in params:
            params['threshold'] = params['confidence_threshold']
        if 'detect_hands' in params and 'detect_hand' not in params:
            params['detect_hand'] = params['detect_hands']
        return self._process_impl(image, params)

    def _process_impl(self, image: np.ndarray, params: Dict[str, Any]) -> Any:
        """Main DWPose detection implementation using easy_dwpose adapter."""
        try:
            output_format = params.get('output_format', 'image')
            detect_res = int(params.get('detect_resolution', 512))
            include_face = bool(params.get('detect_face', False))
            include_hands = bool(params.get('detect_hands', params.get('detect_hand', False)))

            adapter = self._get_adapter()
            result = adapter.detect(
                image_rgb=image,
                detect_resolution=detect_res,
                output_format='json' if output_format in ('json', 'both') else 'image',
                include_face=include_face,
                include_hands=include_hands,
            )

            if output_format == 'json':
                return result
            elif output_format == 'both':
                # Render image from pose json
                if isinstance(result, dict):
                    skeleton_image = self._render_skeleton_from_vendor_data(image, result, params)
                    return {'image': skeleton_image, 'json': result}
                else:
                    # Already an image; also try to get json in a second pass
                    pose_json = adapter.detect(
                        image_rgb=image,
                        detect_resolution=detect_res,
                        output_format='json',
                        include_face=include_face,
                        include_hands=include_hands,
                    )
                    return {'image': result, 'json': pose_json}
            else:
                # image
                if isinstance(result, dict):
                    return self._render_skeleton_from_vendor_data(image, result, params)
                return result

        except Exception as e:
            raise ProcessingError(f"DWPose detection failed: {e}")
    
    def _process_onnx_pose(self, image: np.ndarray, params: Dict[str, Any]) -> Dict[str, Any]:
        """Deprecated path: retained for compatibility, now uses adapter."""
        output_format = params.get('output_format', 'json')
        detect_res = int(params.get('detect_resolution', 512))
        include_face = bool(params.get('detect_face', False))
        include_hands = bool(params.get('detect_hand', True))
        adapter = self._get_adapter()
        result = adapter.detect(
            image_rgb=image,
            detect_resolution=detect_res,
            output_format='json' if output_format != 'image' else 'image',
            include_face=include_face,
            include_hands=include_hands,
        )
        if isinstance(result, dict):
            return result
        # If image was returned but json expected, run json pass
        return adapter.detect(
            image_rgb=image,
            detect_resolution=detect_res,
            output_format='json',
            include_face=include_face,
            include_hands=include_hands,
        )
    
    def _process_builtin_pose(self, image: np.ndarray, params: Dict[str, Any]) -> Dict[str, Any]:
        """Use adapter path for built-in as well (unified behavior)."""
        return self._process_onnx_pose(image, params)
    
    
    def _render_skeleton_from_data(self, image: np.ndarray, pose_data: Dict[str, Any], params: Dict[str, Any]) -> np.ndarray:
        """Render skeleton image from legacy COCO-style pose data (people list)."""
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
                    xv, yv, conf = keypoints[i:i+3]
                    if conf > params.get('threshold', 0.3):
                        # Support both normalized [0..1] and absolute pixel coords
                        if xv > 1.0 or yv > 1.0:
                            x = int(np.clip(xv, 0, width - 1))
                            y = int(np.clip(yv, 0, height - 1))
                        else:
                            x = int(xv * width)
                            y = int(yv * height)
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

    def _render_skeleton_from_vendor_data(self, image: np.ndarray, pose_data: Dict[str, Any], params: Dict[str, Any]) -> np.ndarray:
        """Render skeleton image from easy_dwpose vendor pose dict (bodies/hands/faces)."""
        height, width = image.shape[:2]
        include_face = bool(params.get('detect_face', False))
        include_hands = bool(params.get('detect_hands', params.get('detect_hand', False)))
        # Vendor renderer draws on normalized coords; ensure keys exist
        safe_pose = {
            'bodies': pose_data.get('bodies', []),
            'body_scores': pose_data.get('body_scores', []),
            'hands': pose_data.get('hands', []),
            'faces': pose_data.get('faces', []),
        }
        rendered = draw_openpose(safe_pose, height=height, width=width, include_face=include_face, include_hands=include_hands)
        return rendered
    
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

    def process(self, image: np.ndarray, params: Dict[str, Any]) -> Any:
        """Process method for compatibility with image_utils."""
        try:
            # Use the inherited _process_impl method
            result = self._process_impl(image, params)
            return result
        except Exception as e:
            raise ProcessingError(f"DWPose processing failed: {e}")
