// ws-utils.js
// Shared WebSocket utilities for the Dawanji project

/**
 * Unified function to check WebSocket connection status with retry logic
 * @param {WebSocket} ws - WebSocket client
 * @param {number} maxAttempts - Maximum retry attempts (default 3)
 * @param {number} delayMs - Delay between retries in milliseconds (default 500)
 * @returns {Promise<boolean>} - True if connected, false if failed after retries
 */
export async function checkAndSendMessage(ws, message, maxAttempts = 3, delayMs = 500) {
  let attempts = 0;

  const attemptSend = () => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send message:', error);
        return false;
      }
    }
    return false;
  };

  while (attempts < maxAttempts) {
    if (attemptSend()) {
      return true;
    }

    attempts++;
    if (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.warn(`Failed to send message after ${maxAttempts} attempts. ReadyState: ${ws.readyState}`);
  return false;
}

/**
 * Clean up WebSocket resources
 * @param {Map} histories - Map of client histories
 * @param {Map} lastReplies - Map of last AI replies
 * @param {any} clientId - Client identifier
 */
export function cleanupClientResources(histories, lastReplies, clientId) {
  histories.delete(clientId);
  lastReplies.delete(clientId);
}