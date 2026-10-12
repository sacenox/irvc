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
}

export interface WSEvent {
  type: "message" | "presence";
  message?: Message;
  users?: string[];
  roster?: UserSummary[];
  voice?: Record<string, string[]>;
}
