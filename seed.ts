import { db } from "./db";
import { badges } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedBadges() {
  const existing = await db.select().from(badges);
  if (existing.length > 0) return;

  await db.insert(badges).values([
    { name: "First Blood", description: "Complete your first task", icon: "sword", requirement: "tasks_completed", threshold: 1, xpBonus: 50 },
    { name: "Getting Started", description: "Complete 5 tasks", icon: "rocket", requirement: "tasks_completed", threshold: 5, xpBonus: 100 },
    { name: "Grinder", description: "Complete 25 tasks", icon: "flame", requirement: "tasks_completed", threshold: 25, xpBonus: 250 },
    { name: "Centurion", description: "Complete 100 tasks", icon: "crown", requirement: "tasks_completed", threshold: 100, xpBonus: 500 },
    { name: "Legend", description: "Complete 500 tasks", icon: "trophy", requirement: "tasks_completed", threshold: 500, xpBonus: 1000 },
    { name: "On Fire", description: "3-day streak", icon: "zap", requirement: "streak", threshold: 3, xpBonus: 75 },
    { name: "Unstoppable", description: "7-day streak", icon: "shield", requirement: "streak", threshold: 7, xpBonus: 200 },
    { name: "Iron Will", description: "30-day streak", icon: "gem", requirement: "streak", threshold: 30, xpBonus: 1000 },
    { name: "XP Hunter", description: "Earn 500 XP", icon: "star", requirement: "xp", threshold: 500, xpBonus: 100 },
    { name: "XP Master", description: "Earn 2000 XP", icon: "sparkles", requirement: "xp", threshold: 2000, xpBonus: 300 },
    { name: "XP Legend", description: "Earn 10000 XP", icon: "medal", requirement: "xp", threshold: 10000, xpBonus: 1000 },
    { name: "Level 5", description: "Reach level 5", icon: "target", requirement: "level", threshold: 5, xpBonus: 200 },
    { name: "Level 10", description: "Reach level 10", icon: "swords", requirement: "level", threshold: 10, xpBonus: 500 },
    { name: "Level 20", description: "Reach level 20", icon: "skull", requirement: "level", threshold: 20, xpBonus: 1000 },
  ]);
}
