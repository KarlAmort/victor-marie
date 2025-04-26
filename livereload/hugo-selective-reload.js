/**
 * Hugo Selective Reload Plugin for LiveReload
 *
 * This plugin enhances the standard livereload functionality by:
 * 1. Receiving HTML updates via XHR instead of full page reloads
 * 2. Finding the lowest node in the DOM tree that contains all changes
 * 3. Replacing only the changed portion of the document
 * 4. Scrolling the change into view with highlight animation
 */

(function() {
    'use strict';

    // Plugin configuration
    const HIGHLIGHT_DURATION = 5000; // 5 seconds
    const HIGHLIGHT_COLOR = '#ffff00'; // Yellow
    const SCROLL_BEHAVIOR = 'smooth';

    class HugoSelectiveReload {
        constructor() {
            this.isInitialized = false;
            this.currentUrl = window.location.href;
            this.originalReloadHandler = null;
            this.init();
        }

        init() {
            if (this.isInitialized) return;

            // Wait for LiveReload to be available
            if (typeof window.LiveReload === 'undefined') {
                setTimeout(() => this.init(), 100);
                return;
            }

            this.hijackLiveReload();
            this.isInitialized = true;
            console.log('Hugo Selective Reload plugin initialized');
        }

        hijackLiveReload() {
            const originalLiveReload = window.LiveReload;

            // Store original reload handler
            if (originalLiveReload && originalLiveReload.reloader) {
                this.originalReloadHandler = originalLiveReload.reloader.reload.bind(originalLiveReload.reloader);

                // Override the reload method
                originalLiveReload.reloader.reload = (path, options) => {
                    this.handleReload(path, options);
                };
            }

            // Hook into WebSocket message handling for custom commands
            this.hookWebSocketMessages();
        }

        hookWebSocketMessages() {
            // Wait for WebSocket connection to be established
            const checkConnection = () => {
                if (window.LiveReload && window.LiveReload.connector && window.LiveReload.connector.socket) {
                    this.interceptWebSocketMessages();
                } else {
                    setTimeout(checkConnection, 100);
                }
            };
            checkConnection();
        }

        interceptWebSocketMessages() {
            const socket = window.LiveReload.connector.socket;
            const originalOnMessage = socket.onmessage;

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.command === 'hugo_selective_reload') {
                        console.log('Received Hugo selective reload command:', data);
                        this.handleSelectiveReload(data.path, data);
                        return; // Don't call original handler
                    }
                } catch (e) {
                    // Not JSON or not our command, pass through
                }

                // Call original handler for standard commands
                if (originalOnMessage) {
                    originalOnMessage.call(socket, event);
                }
            };
        }

        async handleSelectiveReload(path, options = {}) {
            console.log('Hugo Selective Reload: Handling selective reload for path:', path);

            // Check if we're already on the target page
            const targetUrl = this.resolveUrl(path);
            if (this.isSamePage(targetUrl)) {
                console.log('Same page detected, performing selective update');
                await this.performSelectiveUpdate(targetUrl);
            } else {
                console.log('Different page, performing navigation');
                await this.handleNavigation(targetUrl);
            }
        }

        async handleReload(path, options = {}) {
            console.log('Hugo Selective Reload: Handling reload for path:', path);

            // Check if this is a navigation request (starts with __hugo_navigate)
            if (path && path.startsWith('__hugo_navigate')) {
                const targetPath = path.replace('__hugo_navigate', '');
                await this.handleNavigation(targetPath);
                return;
            }

            // Check if we're already on the target page
            const targetUrl = this.resolveUrl(path);
            if (this.isSamePage(targetUrl)) {
                console.log('Same page detected, performing selective update');
                await this.performSelectiveUpdate(targetUrl);
            } else {
                console.log('Different page, performing navigation');
                await this.handleNavigation(targetUrl);
            }
        }

        async handleNavigation(targetPath) {
            const targetUrl = this.resolveUrl(targetPath);

            // Update browser history and navigate
            if (targetUrl !== window.location.href) {
                window.location.href = targetUrl;
            }
        }

        async performSelectiveUpdate(targetUrl) {
            try {
                // Fetch the updated HTML
                const response = await fetch(targetUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const newHtml = await response.text();
                const newDoc = this.parseHtml(newHtml);

                // Find and apply changes
                const changedElement = this.findLowestChangedNode(document, newDoc);
                if (changedElement) {
                    this.replaceElement(changedElement.current, changedElement.new);
                    this.scrollToAndHighlight(changedElement.current);
                } else {
                    console.log('No changes detected, falling back to full reload');
                    this.fallbackToFullReload();
                }

            } catch (error) {
                console.error('Selective update failed:', error);
                this.fallbackToFullReload();
            }
        }

        parseHtml(htmlString) {
            const parser = new DOMParser();
            return parser.parseFromString(htmlString, 'text/html');
        }

        findLowestChangedNode(currentDoc, newDoc) {
            const currentBody = currentDoc.body;
            const newBody = newDoc.body;

            if (!currentBody || !newBody) {
                return null;
            }

            // Start comparison from body
            const result = this.findLowestChangedNodeRecursive(currentBody, newBody);
            return result;
        }

        findLowestChangedNodeRecursive(currentNode, newNode) {
            // If nodes are significantly different, this is our change point
            if (!this.nodesAreEquivalent(currentNode, newNode)) {
                return {
                    current: currentNode,
                    new: newNode
                };
            }

            // Check children for more specific changes
            const currentChildren = Array.from(currentNode.children);
            const newChildren = Array.from(newNode.children);

            // If different number of children, return current level
            if (currentChildren.length !== newChildren.length) {
                return {
                    current: currentNode,
                    new: newNode
                };
            }

            // Recursively check each child
            for (let i = 0; i < currentChildren.length; i++) {
                const childResult = this.findLowestChangedNodeRecursive(
                    currentChildren[i],
                    newChildren[i]
                );

                if (childResult) {
                    return childResult;
                }
            }

            // Check if text content differs
            if (this.getTextContent(currentNode) !== this.getTextContent(newNode)) {
                return {
                    current: currentNode,
                    new: newNode
                };
            }

            return null;
        }

        nodesAreEquivalent(node1, node2) {
            if (!node1 || !node2) return false;
            if (node1.tagName !== node2.tagName) return false;
            if (node1.id !== node2.id) return false;
            if (node1.className !== node2.className) return false;

            return true;
        }

        getTextContent(node) {
            if (!node) return '';

            // Get only direct text content, not from children
            let textContent = '';
            for (const child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    textContent += child.textContent;
                }
            }
            return textContent.trim();
        }

        replaceElement(currentElement, newElement) {
            if (!currentElement || !newElement) return;

            try {
                // Clone the new element to ensure it's properly imported
                const importedElement = document.importNode(newElement, true);

                // Store scroll position
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

                // Replace the element
                currentElement.parentNode.replaceChild(importedElement, currentElement);

                // Restore scroll position
                window.scrollTo(0, scrollTop);

                console.log('Element replaced successfully');

            } catch (error) {
                console.error('Error replacing element:', error);
                this.fallbackToFullReload();
            }
        }

        scrollToAndHighlight(element) {
            if (!element) return;

            // Scroll element into view
            element.scrollIntoView({
                behavior: SCROLL_BEHAVIOR,
                block: 'center',
                inline: 'nearest'
            });

            // Add highlight animation
            this.addHighlight(element);
        }

        addHighlight(element) {
            if (!element) return;

            // Store original styles
            const originalBackground = element.style.backgroundColor;
            const originalTransition = element.style.transition;

            // Apply highlight
            element.style.transition = 'background-color 0.3s ease-in-out';
            element.style.backgroundColor = HIGHLIGHT_COLOR;

            // Create fading animation
            let opacity = 1;
            const fadeStep = 0.02;
            const fadeInterval = HIGHLIGHT_DURATION / (1 / fadeStep);

            const fadeTimer = setInterval(() => {
                opacity -= fadeStep;
                if (opacity <= 0) {
                    // Restore original styles
                    element.style.backgroundColor = originalBackground;
                    element.style.transition = originalTransition;
                    clearInterval(fadeTimer);
                } else {
                    // Apply fading yellow
                    const fadeColor = this.hexToRgba(HIGHLIGHT_COLOR, opacity);
                    element.style.backgroundColor = fadeColor;
                }
            }, fadeInterval);
        }

        hexToRgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        resolveUrl(path) {
            if (!path) return window.location.href;

            // If path is absolute, return as-is
            if (path.startsWith('http://') || path.startsWith('https://')) {
                return path;
            }

            // If path starts with /, it's relative to origin
            if (path.startsWith('/')) {
                return window.location.origin + path;
            }

            // Otherwise, resolve relative to current page
            const currentPath = window.location.pathname;
            const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
            return window.location.origin + basePath + path;
        }

        isSamePage(targetUrl) {
            const current = new URL(window.location.href);
            const target = new URL(targetUrl);

            return current.origin === target.origin &&
                   current.pathname === target.pathname;
        }

        fallbackToFullReload() {
            console.log('Falling back to full page reload');
            if (this.originalReloadHandler) {
                this.originalReloadHandler();
            } else {
                window.location.reload();
            }
        }
    }

    // Initialize the plugin when DOM is ready
    function initPlugin() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                new HugoSelectiveReload();
            });
        } else {
            new HugoSelectiveReload();
        }
    }

    // Auto-initialize
    initPlugin();

    // Expose for manual initialization if needed
    window.HugoSelectiveReload = HugoSelectiveReload;

})();