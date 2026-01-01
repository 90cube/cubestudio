# Cubestudio Project Guide

## 1. Project Overview

**Cubestudio** is a sophisticated web-based application for AI image generation and manipulation. It combines a rich, Photoshop-like frontend interface with a powerful Python-based backend handling AI model inference.

### Key Features
*   **Advanced UI:** Floating panel system, layer management, and responsive layout.
*   **AI Generation:** Real-time image generation using Stable Diffusion pipelines.
*   **ControlNet Integration:** Comprehensive preprocessing (Canny, Depth, Pose, etc.) and model selection.
*   **Creative Tools:** Painting/brush tools, text tools, and canvas manipulation.
*   **Advanced AI:** Image-to-Image (I2I), Inpainting, Outpainting, and AI Detailers (YOLO-based).
*   **Real-time Communication:** WebSocket-based updates for generation progress.

## 2. Architecture

### Frontend
*   **Tech Stack:** Vanilla JavaScript, HTML5, CSS3.
*   **Serving:** `live-server` (via Node.js).
*   **Entry Point:** `index.html`
*   **Structure:**
    *   `frontend/components/`: Modular UI components (Canvas, Layers, Panels).
    *   `frontend/assets/`: Static resources.
    *   `frontend/core/`: Core application logic.

### Backend
*   **Tech Stack:** Python 3, FastAPI, Uvicorn, PyTorch, Diffusers.
*   **Entry Point:** `backend/main.py`
*   **Structure:**
    *   `backend/api/`: FastAPI route handlers (Routes).
    *   `backend/services/`: Business logic and model orchestration (Service Layer).
    *   `backend/models/`: Data models and configuration management.
    *   `models/`: Directory for storing AI model weights (Checkpoints, LoRAs, VAES, etc.).

## 3. Getting Started

### Prerequisites
*   **Python:** 3.10 or higher.
*   **Node.js:** Required for `live-server` (frontend).
*   **CUDA:** Recommended for GPU acceleration (PyTorch).

### Installation
1.  **Backend Setup:**
    ```bash
    python -m venv .venv
    .venv\Scripts\activate
    pip install -r requirements.txt
    ```
2.  **Frontend Setup:**
    ```bash
    npm install
    ```

### Running the Application

*   **One-Click Start (Windows):**
    Run `run_all.bat` to launch both backend and frontend services.

*   **Manual Start:**
    *   **Backend:**
        ```bash
        # Port: 8080
        .venv\Scripts\activate
        python -m backend.main
        ```
    *   **Frontend:**
        ```bash
        # Port: 9000
        npm run dev
        ```

## 4. Configuration

*   **Main Config:** `config.yaml`
    *   Defines paths for models (`checkpoints`, `loras`, etc.).
    *   Server settings (host, port).
    *   Output directories.

## 5. Directory Structure

```
D:\Cube_Project\Cubestudio\
├── .venv/                 # Python virtual environment
├── backend/               # Backend source code
│   ├── api/               # API endpoints
│   ├── models/            # Pydantic models & config
│   ├── services/          # Core logic (Pipelines, Image processing)
│   └── main.py            # App entry point
├── frontend/              # Frontend source code
│   ├── components/        # UI Components
│   └── index.html         # Main entry file
├── models/                # AI Model weights (Checkpoints, LoRAs)
├── output/                # Generated images
├── docs/                  # Documentation
├── config.yaml            # Main configuration file
└── run_all.bat            # Startup script
```

## 6. Development Conventions

*   **Backend:** Follows Modular Monolith pattern. Logic should be placed in `services/`, not directly in `api/` routes.
*   **Frontend:** Component-based vanilla JS.
*   **Git:**
    *   **Ignored:** Model weights (`*.safetensors`, `*.pth`), `node_modules`, `.venv`, `output/`, `logs/`.
    *   **Committing:** Ensure no large binary files are staged.
*   **Code Style:**
    *   **Python:** PEP 8 recommended.
    *   **JS:** Modern ES6+ syntax.

## 7. Troubleshooting

*   **Backend Port Conflict:** Check if port 8080 is in use. Modify `config.yaml` or `backend/main.py`.
*   **Frontend Connection:** Ensure the frontend is proxying requests to `http://127.0.0.1:8080` correctly (configured in `bs-config.js` or via CORS).
*   **Missing Models:** Ensure model files are placed in the correct subdirectories within `models/` as defined in `config.yaml`.
