import argparse
import os
import sys
import logging
from pathlib import Path
from typing import Optional

import torch
from safetensors.torch import load_file, save_file

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def convert_to_safetensors(pt_path: str, output_path: str, delete_original: bool = False):
    """
    Convert a PyTorch model (.pt/.pth) to SafeTensors format.
    
    Args:
        pt_path: Path to the source .pt/.pth file
        output_path: Path to save the .safetensors file
        delete_original: Whether to delete the source file after successful conversion
    """
    try:
        logger.info(f"Processing: {pt_path}")
        
        # Load the PyTorch model
        # map_location='cpu' prevents OOM errors on GPU during conversion
        # weights_only=True is safer but might fail for complex pickled objects. 
        # Try with weights_only=True first, fallback if needed.
        try:
            state_dict = torch.load(pt_path, map_location='cpu', weights_only=True)
        except Exception:
            logger.warning(f"Loading {pt_path} with weights_only=True failed, retrying without it...")
            state_dict = torch.load(pt_path, map_location='cpu')

        # Save as SafeTensors
        save_file(state_dict, output_path)
        logger.info(f"Successfully saved to: {output_path}")

        # Verify loading (optional but recommended sanity check)
        try:
            _ = load_file(output_path, device='cpu')
            logger.info("Verification: File loaded successfully.")
        except Exception as e:
            logger.error(f"Verification failed for {output_path}: {e}")
            return

        if delete_original:
            os.remove(pt_path)
            logger.info(f"Deleted original file: {pt_path}")

    except Exception as e:
        logger.error(f"Error converting {pt_path}: {e}")

def scan_and_convert(directory: str, recursive: bool = True, delete_original: bool = False):
    """
    Scan a directory for .pt/.pth files and convert them to .safetensors.
    """
    root_path = Path(directory)
    if not root_path.exists():
        logger.error(f"Directory not found: {directory}")
        return

    logger.info(f"Scanning directory: {directory} (Recursive: {recursive})")

    patterns = ["*.pt", "*.pth"]
    files_to_process = []

    if recursive:
        for pattern in patterns:
            files_to_process.extend(root_path.rglob(pattern))
    else:
        for pattern in patterns:
            files_to_process.extend(root_path.glob(pattern))

    if not files_to_process:
        logger.info("No .pt or .pth files found.")
        return

    logger.info(f"Found {len(files_to_process)} files.")

    for file_path in files_to_process:
        # Determine output path
        safetensors_path = file_path.with_suffix('.safetensors')
        
        # Skip if destination exists
        if safetensors_path.exists():
            logger.info(f"Skipping {file_path.name} (Target already exists)")
            continue
            
        convert_to_safetensors(str(file_path), str(safetensors_path), delete_original)

def main():
    parser = argparse.ArgumentParser(description="Convert PyTorch models (.pt/.pth) to SafeTensors format.")
    parser.add_argument("directory", nargs="?", default=".", help="Directory to scan for models")
    parser.add_argument("--recursive", "-r", action="store_true", default=True, help="Scan subdirectories recursively (default: True)")
    parser.add_argument("--delete", "-d", action="store_true", help="Delete original files after successful conversion")
    parser.add_argument("--file", "-f", help="Convert a specific file instead of a directory")

    args = parser.parse_args()

    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            logger.error(f"File not found: {file_path}")
            return
        output_path = file_path.with_suffix('.safetensors')
        convert_to_safetensors(str(file_path), str(output_path), args.delete)
    else:
        scan_and_convert(args.directory, args.recursive, args.delete)

if __name__ == "__main__":
    main()
