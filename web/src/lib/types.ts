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
  type: "text" | "voice" | "dm";
  name: string;
  position: number;
  permanent: boolean;
  unread?: number;
}

export type Reaction = "+1" | "-1" | "heart" | "laugh";

export interface Message {
  id: number;
  channelId: number;
  userId: number;
  username: string;
  body: string;
  createdAt: number;
  editedAt?: number;
  reactions?: Partial<Record<Reaction, string[]>>;
}

export interface Gif {
  url: string;
  preview: string;
}

export interface WSEvent {
  type:
    | "message"
    | "message_edit"
    | "message_delete"
    | "presence"
    | "pong"
    | "channel"
    | "channel_delete";
  message?: Message;
  users?: string[];
  roster?: UserSummary[];
  voice?: Record<string, string[]>;
  channel?: Channel;
  channelId?: number;
}
