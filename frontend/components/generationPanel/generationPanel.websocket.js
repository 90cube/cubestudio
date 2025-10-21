// generationPanel.websocket.js
// WebSocket integration module for GenerationPanel

import websocketService from '../../core/websocketService.js';

/**
 * WebSocket-based generation handler
 */
export class WebSocketGenerationHandler {
    constructor(generationPanel) {
        this.panel = generationPanel;
        this.handlerId = null;
        this.images = [];
        this.completionPromise = null;
        this.resolveCompletion = null;
        this.rejectCompletion = null;
    }

    /**
     * Generate images using WebSocket
     * Returns a Promise that resolves when generation is complete
     */
    async generate(requestData) {
        // Create completion promise
        this.completionPromise = new Promise((resolve, reject) => {
            this.resolveCompletion = resolve;
            this.rejectCompletion = reject;
        });

        try {
            // Reset state
            this.images = [];
            this.handlerId = `generation_${Date.now()}`;

            // Force close existing connection and create new one
            websocketService.close(false); // Close but allow reconnection
            await websocketService.connect('/ws/generate');

            // Register message handler AFTER connection
            websocketService.on(this.handlerId, (message) => this.handleMessage(message));

            // Send generation request
            await websocketService.send(requestData);

            // Wait for completion
            return await this.completionPromise;

        } catch (error) {
            console.error('❌ WebSocket generation error:', error);
            this.cleanup();

            // Update UI
            this.panel.state.generation.isGenerating = false;
            this.panel.updateGenerateButtons();
            this.panel.updateInfinityButtons();

            // Show error
            if (window.showNotification) {
                window.showNotification('error', `Generation failed: ${error.message}`);
            }

            throw error;
        }
    }

    /**
     * Handle WebSocket messages
     */
    handleMessage(message) {
        switch (message.type) {
            case 'status':
                this.handleStatus(message);
                break;

            case 'progress':
                this.handleProgress(message);
                break;

            case 'image':
                this.handleImage(message);
                break;

            case 'complete':
                this.handleComplete(message);
                break;

            case 'error':
                this.handleError(message);
                break;

            case 'image_updated':
                this.handleImageUpdated(message);
                break;

            case 'warning':
                this.handleWarning(message);
                break;

            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    /**
     * Handle status updates
     */
    handleStatus(message) {
        const statusMsg = message.message || 'Processing...';
        const stage = message.stage || 'unknown';

        // Update UI with status
        if (this.panel.updateProgressUI) {
            this.panel.updateProgressUI(statusMsg, stage);
        }

        // Show notification for important stages
        if (stage === 'model_loading') {
            if (window.showNotification) {
                window.showNotification('info', 'Loading model...');
            }
        }
    }

    /**
     * Handle progress updates
     */
    handleProgress(message) {
        const current = message.current || 0;
        const total = message.total || 100;
        const percent = message.percent || Math.floor((current / total) * 100);

        // Update UI with progress
        if (this.panel.updateProgressUI) {
            this.panel.updateProgressUI(
                `Generating... ${current}/${total} steps (${percent}%)`,
                'generating',
                percent
            );
        }
    }

    /**
     * Handle image received
     */
    handleImage(message) {
        const index = message.index;
        const imageData = message.data;

        // Store image
        this.images.push(imageData);

        // Update UI
        if (this.panel.updateProgressUI) {
            this.panel.updateProgressUI(
                `Image ${index + 1} received`,
                'image_received'
            );
        }
    }

    /**
     * Handle image updated (after detailer processing)
     */
    handleImageUpdated(message) {
        const index = message.index;
        const imageData = message.data;

        // Update stored image
        if (index < this.images.length) {
            this.images[index] = imageData;
        }

        // Show notification
        if (window.showNotification) {
            window.showNotification('info', `Detailer applied to image ${index + 1}`);
        }
    }

    /**
     * Handle warning messages
     */
    handleWarning(message) {
        const warningMsg = message.message || 'Warning occurred';
        console.warn('⚠️ Warning:', warningMsg);

        if (window.showNotification) {
            window.showNotification('warning', warningMsg);
        }
    }

    /**
     * Handle generation complete
     */
    async handleComplete(message) {
        try {
            const images = message.images || this.images;
            const metadata = message.metadata || {};

            // Update UI
            if (this.panel.updateProgressUI) {
                this.panel.updateProgressUI(
                    `Complete! Generated ${images.length} image(s)`,
                    'complete',
                    100
                );
            }

            // Add images to canvas
            await this.addImagesToCanvas(images);

            // Show success notification
            if (window.showNotification) {
                window.showNotification('success', `Generated ${images.length} image(s) successfully!`);
            }

            // Resolve completion promise
            if (this.resolveCompletion) {
                this.resolveCompletion({ success: true, images, metadata });
            }

        } catch (error) {
            console.error('Error processing completion:', error);
            if (window.showNotification) {
                window.showNotification('error', `Error processing images: ${error.message}`);
            }

            // Reject completion promise
            if (this.rejectCompletion) {
                this.rejectCompletion(error);
            }
        } finally {
            // Clean up
            this.cleanup();
        }
    }

    /**
     * Handle errors
     */
    handleError(message) {
        const error = message.error || 'Unknown error';

        console.error('Generation error:', error);

        // Update UI
        if (this.panel.updateProgressUI) {
            this.panel.updateProgressUI('Generation failed', 'error');
        }

        // Show error notification
        if (window.showNotification) {
            window.showNotification('error', `Generation failed: ${error}`);
        }

        // Reject completion promise
        if (this.rejectCompletion) {
            this.rejectCompletion(new Error(error));
        }

        // Clean up
        this.cleanup();
    }

    /**
     * Add images to canvas
     */
    async addImagesToCanvas(images) {
        if (!images || images.length === 0) {
            return;
        }

        // Calculate viewport center
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;

        // Process each image
        for (let i = 0; i < images.length; i++) {
            await this.addSingleImageToCanvas(images[i], i, viewportCenterX, viewportCenterY);
        }
    }

    /**
     * Add single image to canvas
     */
    async addSingleImageToCanvas(imageDataUri, index, centerX, centerY) {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                try {
                    // Add to canvas with slight offset for multiple images
                    if (window.addImageToCanvasFromElementsMenu) {
                        const offsetX = centerX + (index * 20);
                        const offsetY = centerY + (index * 20);
                        window.addImageToCanvasFromElementsMenu(img, offsetX, offsetY);
                    }
                    resolve();
                } catch (error) {
                    console.error(`Failed to add image to canvas:`, error);
                    reject(error);
                }
            };

            img.onerror = (error) => {
                console.error(`Failed to load image:`, error);
                reject(error);
            };

            img.src = imageDataUri;
        });
    }

    /**
     * Clean up WebSocket handler
     */
    cleanup() {
        if (this.handlerId) {
            websocketService.off(this.handlerId);
            this.handlerId = null;
        }
        this.images = [];
    }
}

export default WebSocketGenerationHandler;
