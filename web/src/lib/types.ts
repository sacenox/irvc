export interface User {
  id: number;
  username: string;
  createdAt: number;
}

export interface UserSummary {
  id: number;
  username: string;
}

export interface Channel {
  id: number;
  type: "text" | "voice";
  name: string;
  position: number;
}

export interface Message {
  id: number;
  channelId: number;
  userId: number;
  username: string;
  body: string;
  createdAt: number;
  editedAt?: number;
}

export interface WSEvent {
  type: "message" | "message_edit" | "message_delete" | "presence" | "pong";
  message?: Message;
  users?: string[];
  roster?: UserSummary[];
  voice?: Record<string, string[]>;
}
