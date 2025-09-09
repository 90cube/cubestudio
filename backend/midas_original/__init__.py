# backend/midas_original/__init__.py
"""
원본 MiDaS 모듈 - 공식 MiDaS 구현
Intel ISL의 MiDaS를 프로젝트에 통합
"""

from .model_loader import load_model
from .midas_net import MidasNet

__all__ = ['load_model', 'MidasNet']