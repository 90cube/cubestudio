#!/usr/bin/env python3
"""
DEPRECATED: This file is deprecated. Use 'python -m backend.main' instead.

This file is kept for backward compatibility and will redirect to the new modularized backend.
"""

import warnings
import sys
import os

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    """Main function with deprecation warning"""
    
    warnings.warn(
        "unified_backend_service.py is deprecated. Use 'python -m backend.main' instead.",
        DeprecationWarning,
        stacklevel=2
    )
    
    print("="*60)
    print("WARNING: DEPRECATION WARNING")
    print("="*60)
    print("unified_backend_service.py is deprecated.")
    print("Please use: python -m backend.main")
    print("")
    print("Redirecting to new modularized backend...")
    print("="*60)
    print("")
    
    # Import and run the new backend
    try:
        from backend.main import main as new_main
        new_main()
    except ImportError as e:
        print(f"Error importing new backend: {e}")
        print("Please ensure backend modules are properly installed.")
        sys.exit(1)
    except Exception as e:
        print(f"Error running new backend: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()