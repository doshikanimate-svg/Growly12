export enum QuestType {
  ONE_TIME = "one-time",
  DAILY = "daily",
  WEEKLY = "weekly",
}

export enum QuestStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  EXPIRED = "expired",
}

export interface UserProfile {
  id: string;
  displayName: string;
  xp: number;
  level: number;
  streakCount: number;
  lastStreakUpdate?: string;
  telegramId?: string;
  settings: {
    timezone: string;
    notificationsEnabled: boolean;
    notifyBeforeDeadline: number; // minutes
    theme?: ThemeMode;
    badgeStyle?: BadgeStyle;
    profileStyle?: ProfileStyle;
    premiumCosmeticsUnlocked?: boolean;
    subscriptionPlan?: "free" | "pro";
    subscriptionUntil?: string;
    freezesUsedThisMonth?: number;
    lastFreezeMonth?: string;
    pendingLostStreak?: number;
    soundPack?: SoundPack;
  };
  createdAt: string;
  updatedAt?: string;
}

export type ThemeMode = "light" | "dark" | "ocean";
export type BadgeStyle = "none" | "bronze" | "silver" | "gold" | "crown";
export type ProfileStyle = "default" | "glass" | "neon" | "cyberpunk" | "midnight" | "sunset";
export type SoundPack = "default" | "mario" | "zelda" | "gta";

export interface Quest {
  id: string;
  userId: string;
  title: string;
  description: string;
  xpReward: number;
  type: QuestType;
  recurringDays: number[]; // 0-6 (Sun-Sat)
  deadline?: string;
  localTime?: string; // "HH:mm" for recurring quests
  notifyAdvance?: number; // minutes before deadline
  notified?: boolean;
  status: QuestStatus;
  category: string;
  createdAt: string;
  completedAt?: string;
  updatedAt?: string;
}

export interface Achievement {
  id: string;
  userId: string;
  title: string;
  description: string;
  unlockedAt: string;
}

export function calculateLevel(xp: number): number {
  // Simple formula: Level = floor(sqrt(xp / 100)) + 1
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function xpForNextLevel(level: number): number {
  return Math.pow(level, 2) * 100;
}
