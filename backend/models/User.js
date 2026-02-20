/**
 * User Model
 * 简单的用户数据模型（如果需要存储用户偏好或会话数据）
 */
export class User {
  constructor(id, name, preferences = {}) {
    this.id = id;
    this.name = name;
    this.preferences = preferences;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  updatePreferences(newPreferences) {
    this.preferences = { ...this.preferences, ...newPreferences };
    this.updatedAt = new Date();
  }
}

/**
 * Conversation Model
 * 会话数据模型（如果需要持久化对话历史）
 */
export class Conversation {
  constructor(userId, sessionId) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.messages = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  addMessage(role, content) {
    const message = {
      id: this.messages.length + 1,
      role,
      content,
      timestamp: new Date()
    };
    this.messages.push(message);
    this.updatedAt = new Date();
  }
}