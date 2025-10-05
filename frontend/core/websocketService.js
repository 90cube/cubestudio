// core/websocketService.js

/**
 * WebSocket Service for Real-Time Communication
 * Handles WebSocket connections for image generation progress updates
 */

import pathConfig from './pathConfig.js';

class WebSocketService {
    constructor() {
        this.ws = null;
        this.clientId = this.generateClientId();
        this.messageHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.isConnecting = false;
        this.shouldReconnect = true;
    }

    /**
     * Generate unique client ID
     * @returns {string} Unique client identifier
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Connect to WebSocket server
     * @param {string} endpoint - WebSocket endpoint path
     * @returns {Promise<void>}
     */
    async connect(endpoint = '/ws/generate') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('✅ WebSocket already connected');
            return Promise.resolve();
        }

        if (this.isConnecting) {
            console.log('⏳ WebSocket connection in progress...');
            return this.waitForConnection();
        }

        // Close any existing connection
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        // Generate new client ID for this connection
        this.clientId = this.generateClientId();
        this.isConnecting = true;

        return new Promise((resolve, reject) => {
            try {
                const wsUrl = pathConfig.backendUrl.replace('http', 'ws') + `/api${endpoint}/${this.clientId}`;
                console.log('🔌 Connecting to WebSocket:', wsUrl);

                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('✅ WebSocket connected:', this.clientId);
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Failed to parse WebSocket message:', error);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.isConnecting = false;
                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket closed:', event.code, event.reason);
                    this.isConnecting = false;

                    // Attempt reconnection if not manually closed
                    if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.attemptReconnect(endpoint);
                    } else {
                        console.log('WebSocket connection closed permanently');
                        this.notifyHandlers({
                            type: 'error',
                            error: 'WebSocket connection closed'
                        });
                    }
                };

                // Timeout for connection
                setTimeout(() => {
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 10000); // 10 seconds timeout

            } catch (error) {
                this.isConnecting = false;
                reject(error);
            }
        });
    }

    /**
     * Wait for connection to complete
     * @returns {Promise<void>}
     */
    waitForConnection() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!this.isConnecting) {
                    clearInterval(checkInterval);
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        resolve();
                    }
                }
            }, 100);
        });
    }

    /**
     * Attempt to reconnect to WebSocket
     * @param {string} endpoint - WebSocket endpoint path
     */
    attemptReconnect(endpoint) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);

        setTimeout(() => {
            this.connect(endpoint).catch((error) => {
                console.error('Reconnection failed:', error);
            });
        }, delay);
    }

    /**
     * Send data to WebSocket server
     * @param {Object} data - Data to send
     * @returns {Promise<void>}
     */
    async send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not connected');
        }

        return new Promise((resolve, reject) => {
            try {
                this.ws.send(JSON.stringify(data));
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle incoming WebSocket message
     * @param {Object} message - Received message
     */
    handleMessage(message) {
        console.log('📨 WebSocket message:', message.type);

        // Notify all registered handlers
        this.notifyHandlers(message);
    }

    /**
     * Register message handler
     * @param {string} handlerId - Unique handler identifier
     * @param {Function} handler - Handler function (receives message)
     */
    on(handlerId, handler) {
        this.messageHandlers.set(handlerId, handler);
        console.log(`✅ Registered WebSocket handler: ${handlerId}`);
    }

    /**
     * Unregister message handler
     * @param {string} handlerId - Handler identifier to remove
     */
    off(handlerId) {
        this.messageHandlers.delete(handlerId);
        console.log(`❌ Unregistered WebSocket handler: ${handlerId}`);
    }

    /**
     * Notify all message handlers
     * @param {Object} message - Message to distribute
     */
    notifyHandlers(message) {
        this.messageHandlers.forEach((handler, id) => {
            try {
                handler(message);
            } catch (error) {
                console.error(`Error in handler ${id}:`, error);
            }
        });
    }

    /**
     * Close WebSocket connection
     * @param {boolean} permanent - If true, don't attempt reconnection
     */
    close(permanent = true) {
        this.shouldReconnect = !permanent;

        if (this.ws) {
            console.log('Closing WebSocket connection...');
            this.ws.close();
            this.ws = null;
        }

        // Clear all handlers
        this.messageHandlers.clear();
    }

    /**
     * Check if WebSocket is connected
     * @returns {boolean}
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Get connection state
     * @returns {string} Connection state
     */
    getState() {
        if (!this.ws) return 'CLOSED';

        switch (this.ws.readyState) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'OPEN';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'CLOSED';
            default: return 'UNKNOWN';
        }
    }
}

// Global instance
const websocketService = new WebSocketService();

export default websocketService;
