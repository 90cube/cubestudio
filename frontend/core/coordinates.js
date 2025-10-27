// core/coordinates.js

/**
 * Coordinate System Utility
 * A centralized place to handle conversions between different coordinate spaces
 * (e.g., screen-space, stage-space).
 */

let stage;

/**
 * Initializes the coordinate utility with the main stage.
 * This must be called once at application startup.
 * @param {Konva.Stage} konvaStage The main application stage.
 */
export function init(konvaStage) {
    stage = konvaStage;
}

/**
 * Converts a point from screen-space (e.g., mouse event) to stage-space.
 * @param {{x: number, y: number}} point The screen-space point.
 * @returns {{x: number, y: number}} The point in stage-space coordinates.
 */
export function screenToStage(point) {
    if (!stage) {
        console.error('Coordinate system not initialized.');
        return point;
    }
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point(point);
}

/**
 * Gets the bounding box of a node in stage-space coordinates.
 * This is the correct way to get a bounding box for positioning other Konva shapes.
 * @param {Konva.Node} node The node to measure.
 * @returns {{x: number, y: number, width: number, height: number}} The bounding box in stage-space.
 */
export function getNodeRect(node) {
    if (!stage) {
        console.error('Coordinate system not initialized.');
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    const clientRect = node.getClientRect();
    const topLeft = screenToStage({ x: clientRect.x, y: clientRect.y });

    return {
        x: topLeft.x,
        y: topLeft.y,
        width: clientRect.width / stage.scaleX(),
        height: clientRect.height / stage.scaleY()
    };
}

/**
 * Converts a screen point to canvas coordinates.
 * This helper consolidates the repeated pattern of:
 * 1. Getting canvas container rect
 * 2. Converting to stage-space
 * 3. Applying inverse transform
 *
 * @param {{x: number, y: number}} screenPoint - Screen coordinates (e.g., from mouse event)
 * @param {string} containerId - Canvas container ID (default: 'canvas-container')
 * @returns {{x: number, y: number}} Canvas coordinates
 */
export function screenToCanvas(screenPoint, containerId = 'canvas-container') {
    if (!stage) {
        console.error('Coordinate system not initialized.');
        return screenPoint;
    }

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Canvas container #${containerId} not found.`);
        return screenPoint;
    }

    const rect = container.getBoundingClientRect();
    const stageX = screenPoint.x - rect.left;
    const stageY = screenPoint.y - rect.top;

    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();

    return transform.point({ x: stageX, y: stageY });
}
