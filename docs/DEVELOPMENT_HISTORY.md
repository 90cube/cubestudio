# Cubestudio Development History

This document outlines the development milestones and feature implementations of the Cubestudio project, based on the commit history from September 2025 to November 2025.

## 📅 Development Timeline

### Phase 1: Foundation & UI Architecture (Early September 2025)
**Key Focus:** Establishing the core UI, floating panels, and basic editor tools.

*   **Initial Setup:** Project initialization and basic structure.
*   **UI System:** Implementation of a comprehensive UI component system featuring floating panels with state restoration (saving position/size).
*   **Layout & Performance:** Optimization of floating panel layouts, symmetric designs, and performance tuning.
*   **Basic Tools:**
    *   Crop functionality (Lasso tool with FOV coordinate system).
    *   Elements Menu implementation.
    *   Canvas interaction improvements (double-click handling).
    *   Text tool implementation with TTF font support.
*   **UX Improvements:** Context menu simplified to single-action buttons, vertical slider panels for adjustments.

### Phase 2: AI Preprocessing & ControlNet Integration (Mid September 2025)
**Key Focus:** Integrating AI preprocessing capabilities and control mechanisms.

*   **ControlNet System:**
    *   Implementation of ControlNet preprocessing (Canny edge detection).
    *   Real-time preprocessor model selection.
    *   Client-side preprocessing logic (moved from Python to JS for performance).
    *   Comprehensive preprocessor system supporting 32+ models.
    *   Professional 5-tab ControlNet transformation system.
*   **Depth & Edge Detection:**
    *   Integration of MiDaS depth preprocessing with parameter post-processing.
    *   OpenCV Canny edge detection.
    *   **Depth Anything V2** model integration.
*   **Backend Architecture:** Modularization of the backend to support various processors and clean separation of concerns.

### Phase 3: Layer System & Creative Tools (Late September 2025)
**Key Focus:** Enhancing the editor with Photoshop-like layer management and painting tools.

*   **Layer Management:**
    *   Complete layer panel system with real-time canvas integration.
    *   Drag-and-drop layer reordering.
    *   Layer visibility and type toggling.
*   **Painting System:**
    *   Comprehensive painting system with brush tools.
    *   Layer separation for selective erasing.
*   **Session Management:** Background server management and session continuity features.
*   **Pose Estimation:** Integration of **DWPose (ONNX)** for advanced pose detection (replacing heavier dependencies).

### Phase 4: Real-time Generation & Infrastructure (October 2025)
**Key Focus:** Improving generation speed, communication protocols, and stability.

*   **Communication Protocols:**
    *   Transition to WebSocket for real-time generation updates.
    *   Fallback/Restoration of robust fetch API mechanisms where necessary.
    *   Fixes for proxy issues using absolute URLs.
*   **Project Hygiene:** Comprehensive `.gitignore` updates and removal of temporary/backup files.
*   **LoRA Support:**
    *   Fixes for multiple LoRA activation bugs.
    *   Improved ComfyUI LoRA handling and checkpoint loading.
*   **UI Scaling:** Implementation of a responsive UI scaling system with slider controls.

### Phase 5: Advanced AI Capabilities (Late October - November 2025)
**Key Focus:** Adding sophisticated AI generation features like Inpainting/Outpainting and Detailers.

*   **AI Detailer System:** Implementation of an AI-powered Detailer using YOLO detection (likely for face/hand correction).
*   **Image-to-Image (I2I):** Implementation of Image-to-Image generation with canvas selection support.
*   **Performance Tuning:**
    *   ControlNet loading optimizations.
    *   Pipeline path checks and model loading improvements.
    *   Diagnostics for timing and loading freezes.

## 🛠 Key Technical Achievements

1.  **Hybrid Architecture:** Successfully moved heavy preprocessing logic to client-side JS where possible, while keeping heavy model inference on the Python backend.
2.  **Modular Backend:** Refactored monolithic backend into a modular service-based architecture (Services, Models, API).
3.  **Complex UI State:** Managed complex state for floating panels, layers, and canvas objects using a custom restoration system.
4.  **Real-time Interactivity:** Achieved seamless interaction between the canvas (frontend) and AI generation (backend) via WebSockets/API.
