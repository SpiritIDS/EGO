import {
  tasks, userProgress, badges, userBadges, recurringTasks, badHabits, badHabitLogs, focusSessions, journalEntries,
  type Task, type InsertTask, type UpdateTask, type UserProgress, type Badge, type UserBadge,
  type RecurringTask, type InsertRecurringTask,
  type BadHabit, type InsertBadHabit, type BadHabitLog,
  type JournalEntry, type InsertJournalEntry,
} from "@shared/schema";
import { type User, type UpsertUser } from "@shared/models/auth";
import { db } from "./db";
import { eq, and, desc, sql, count } from "drizzle-orm";

export interface IStorage {
  getTasks(userId: string, date?: string): Promise<Task[]>;
  createTask(userId: string, task: InsertTask): Promise<Task>;
  updateTask(userId: string, taskId: number, data: UpdateTask): Promise<Task | undefined>;
  completeTask(userId: string, taskId: number): Promise<Task>;
  uncompleteTask(userId: string, taskId: number): Promise<Task>;
  failTask(userId: string, taskId: number): Promise<Task | null>;
  unfailTask(userId: string, taskId: number): Promise<Task | null>;
  deleteTask(userId: string, taskId: number): Promise<void>;
  getUserProgress(userId: string): Promise<UserProgress>;
  initUserProgress(userId: string): Promise<UserProgress>;
  addXp(userId: string, xp: number, countAsTask?: boolean): Promise<UserProgress>;
  removeXp(userId: string, xp: number, decrementTasks?: boolean): Promise<UserProgress>;
  updateStreak(userId: string): Promise<UserProgress>;
  getAllBadges(): Promise<Badge[]>;
  getUserBadges(userId: string): Promise<(UserBadge & { badge: Badge })[]>;
  checkAndAwardBadges(userId: string): Promise<Badge[]>;
  getActivityHeatmap(userId: string): Promise<{ date: string; count: number }[]>;
  getXpHistory(userId: string): Promise<{ date: string; xp: number; level: number }[]>;
  getTaskStats(userId: string): Promise<{ category: string; count: number }[]>;
  getRecurringTasks(userId: string): Promise<RecurringTask[]>;
  createRecurringTask(userId: string, task: InsertRecurringTask): Promise<RecurringTask>;
  deleteRecurringTask(userId: string, id: number): Promise<void>;
  spawnRecurringTasks(userId: string, date: string): Promise<Task[]>;
  carryOverTasks(userId: string, date: string): Promise<Task[]>;
  getBadHabits(userId: string): Promise<BadHabit[]>;
  createBadHabit(userId: string, habit: InsertBadHabit): Promise<BadHabit>;
  updateBadHabit(userId: string, id: number, habit: Partial<InsertBadHabit>): Promise<BadHabit | undefined>;
  deleteBadHabit(userId: string, id: number): Promise<void>;
  logBadHabit(userId: string, badHabitId: number): Promise<{ log: BadHabitLog; progress: UserProgress }>;
  getBadHabitLogsToday(userId: string, date?: string): Promise<(BadHabitLog & { badHabit: BadHabit })[]>;
  recordFocusSession(userId: string, duration: number, xpGained: number): Promise<void>;
  getMilestones(userId: string): Promise<{ type: string; date: string; title: string; description: string; icon: string; value?: number }[]>;
  getJournalEntries(userId: string): Promise<JournalEntry[]>;
  getJournalEntry(userId: string, date: string): Promise<JournalEntry | undefined>;
  upsertJournalEntry(userId: string, entry: InsertJournalEntry): Promise<{ entry: JournalEntry; isNew: boolean }>;
  markJournalXpAwarded(entryId: number): Promise<void>;
  getJournalInsights(userId: string): Promise<{ date: string; mood: number; energy: number }[]>;
}

function calculateLevel(xp: number): number {
  return Math.floor(1 + Math.sqrt(xp / 100));
}

function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 100;
}

export class DatabaseStorage implements IStorage {
  async getTasks(userId: string, date?: string): Promise<Task[]> {
    const targetDate = date || new Date().toISOString().split("T")[0];
    return db.select().from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.date, targetDate), eq(tasks.deleted, false)))
      .orderBy(desc(tasks.createdAt));
  }

  async createTask(userId: string, task: InsertTask): Promise<Task> {
    const [created] = await db.insert(tasks)
      .values({ ...task, userId })
      .returning();
    return created;
  }

  async updateTask(userId: string, taskId: number, data: UpdateTask): Promise<Task | undefined> {
    const [updated] = await db.update(tasks)
      .set(data)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.deleted, false)))
      .returning();
    return updated;
  }

  async completeTask(userId: string, taskId: number): Promise<Task> {
    const [updated] = await db.update(tasks)
      .set({ completed: true, completedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.deleted, false)))
      .returning();
    return updated;
  }

  async uncompleteTask(userId: string, taskId: number): Promise<Task> {
    const [updated] = await db.update(tasks)
      .set({ completed: false, completedAt: null })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.deleted, false)))
      .returning();
    return updated;
  }

  async failTask(userId: string, taskId: number): Promise<Task | null> {
    const [existing] = await db.select().from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.deleted, false)));
    if (!existing || existing.failed || existing.completed) return null;
    const [updated] = await db.update(tasks)
      .set({ failed: true, failedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.deleted, false)))
      .returning();
    return updated;
  }

  async unfailTask(userId: string, taskId: number): Promise<Task | null> {
    const [existing] = await db.select().from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.deleted, false)));
    if (!existing || !existing.failed) return null;
    const [updated] = await db.update(tasks)
      .set({ failed: false, failedAt: null })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), eq(tasks.deleted, false)))
      .returning();
    return updated;
  }

  async deleteTask(userId: string, taskId: number): Promise<void> {
    await db.update(tasks)
      .set({ deleted: true, deletedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  }

  async getUserProgress(userId: string): Promise<UserProgress> {
    const [progress] = await db.select().from(userProgress)
      .where(eq(userProgress.userId, userId));
    if (!progress) {
      return this.initUserProgress(userId);
    }
    return progress;
  }

  async initUserProgress(userId: string): Promise<UserProgress> {
    const [progress] = await db.insert(userProgress)
      .values({ userId, totalXp: 0, level: 1, currentStreak: 0, longestStreak: 0, tasksCompleted: 0 })
      .onConflictDoNothing()
      .returning();
    if (!progress) {
      const [existing] = await db.select().from(userProgress)
        .where(eq(userProgress.userId, userId));
      return existing;
    }
    return progress;
  }

  async addXp(userId: string, xp: number, countAsTask: boolean = true): Promise<UserProgress> {
    const current = await this.getUserProgress(userId);
    const newXp = current.totalXp + xp;
    const newLevel = calculateLevel(newXp);
    const [updated] = await db.update(userProgress)
      .set({
        totalXp: newXp,
        level: newLevel,
        tasksCompleted: countAsTask ? current.tasksCompleted + 1 : current.tasksCompleted,
      })
      .where(eq(userProgress.userId, userId))
      .returning();
    return updated;
  }

  async removeXp(userId: string, xp: number, decrementTasks: boolean = true): Promise<UserProgress> {
    const current = await this.getUserProgress(userId);
    const newXp = Math.max(0, current.totalXp - xp);
    const newLevel = calculateLevel(newXp);
    const [updated] = await db.update(userProgress)
      .set({
        totalXp: newXp,
        level: newLevel,
        tasksCompleted: decrementTasks ? Math.max(0, current.tasksCompleted - 1) : current.tasksCompleted,
      })
      .where(eq(userProgress.userId, userId))
      .returning();
    return updated;
  }

  async updateStreak(userId: string): Promise<UserProgress> {
    const current = await this.getUserProgress(userId);
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    let newStreak = current.currentStreak;
    if (current.lastActiveDate === yesterday) {
      newStreak += 1;
    } else if (current.lastActiveDate !== today) {
      newStreak = 1;
    }

    const longestStreak = Math.max(current.longestStreak, newStreak);
    const [updated] = await db.update(userProgress)
      .set({
        currentStreak: newStreak,
        longestStreak,
        lastActiveDate: today,
      })
      .where(eq(userProgress.userId, userId))
      .returning();
    return updated;
  }

  async getAllBadges(): Promise<Badge[]> {
    return db.select().from(badges);
  }

  async getUserBadges(userId: string): Promise<(UserBadge & { badge: Badge })[]> {
    const result = await db.select({
      id: userBadges.id,
      userId: userBadges.userId,
      badgeId: userBadges.badgeId,
      unlockedAt: userBadges.unlockedAt,
      badge: badges,
    }).from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .where(eq(userBadges.userId, userId));
    return result as any;
  }

  async checkAndAwardBadges(userId: string): Promise<Badge[]> {
    const progress = await this.getUserProgress(userId);
    const allBadges = await this.getAllBadges();
    const existingBadges = await this.getUserBadges(userId);
    const existingBadgeIds = new Set(existingBadges.map(b => b.badgeId));
    const newBadges: Badge[] = [];

    for (const badge of allBadges) {
      if (existingBadgeIds.has(badge.id)) continue;
      let earned = false;
      switch (badge.requirement) {
        case "tasks_completed":
          earned = progress.tasksCompleted >= badge.threshold;
          break;
        case "streak":
          earned = progress.currentStreak >= badge.threshold;
          break;
        case "xp":
          earned = progress.totalXp >= badge.threshold;
          break;
        case "level":
          earned = progress.level >= badge.threshold;
          break;
      }
      if (earned) {
        await db.insert(userBadges).values({ userId, badgeId: badge.id });
        if (badge.xpBonus > 0) {
          await this.addXp(userId, badge.xpBonus, false);
        }
        newBadges.push(badge);
      }
    }
    return newBadges;
  }

  async getActivityHeatmap(userId: string): Promise<{ date: string; count: number }[]> {
    const result = await db.select({
      date: tasks.date,
      count: count(),
    }).from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.completed, true), eq(tasks.deleted, false)))
      .groupBy(tasks.date)
      .orderBy(tasks.date);
    return result.map(r => ({ date: r.date, count: Number(r.count) }));
  }

  async getXpHistory(userId: string): Promise<{ date: string; xp: number; level: number }[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];

    const [priorGained] = await db.select({
      xp: sql<number>`COALESCE(SUM(${tasks.xpReward}), 0)`,
    }).from(tasks)
      .where(and(
        eq(tasks.userId, userId),
        eq(tasks.completed, true),
        eq(tasks.deleted, false),
        sql`${tasks.date} < ${startDate}`
      ));

    const [priorLost] = await db.select({
      xp: sql<number>`COALESCE(SUM(${badHabitLogs.xpLost}), 0)`,
    }).from(badHabitLogs)
      .where(and(
        eq(badHabitLogs.userId, userId),
        sql`${badHabitLogs.date} < ${startDate}`
      ));

    const baselineXp = Math.max(0, Number(priorGained.xp) - Number(priorLost.xp));

    const xpGained = await db.select({
      date: tasks.date,
      xp: sql<number>`COALESCE(SUM(${tasks.xpReward}), 0)`,
    }).from(tasks)
      .where(and(
        eq(tasks.userId, userId),
        eq(tasks.completed, true),
        eq(tasks.deleted, false),
        sql`${tasks.date} >= ${startDate}`
      ))
      .groupBy(tasks.date);

    const xpLost = await db.select({
      date: badHabitLogs.date,
      xp: sql<number>`COALESCE(SUM(${badHabitLogs.xpLost}), 0)`,
    }).from(badHabitLogs)
      .where(and(
        eq(badHabitLogs.userId, userId),
        sql`${badHabitLogs.date} >= ${startDate}`
      ))
      .groupBy(badHabitLogs.date);

    const gainedMap = new Map(xpGained.map(r => [r.date, Number(r.xp)]));
    const lostMap = new Map(xpLost.map(r => [r.date, Number(r.xp)]));

    const today = new Date();
    const result: { date: string; xp: number; level: number }[] = [];
    let cumulativeXp = baselineXp;

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const earned = gainedMap.get(dateStr) || 0;
      const lost = lostMap.get(dateStr) || 0;
      cumulativeXp = Math.max(0, cumulativeXp + earned - lost);
      result.push({ date: dateStr, xp: cumulativeXp, level: calculateLevel(cumulativeXp) });
    }

    return result;
  }

  async getTaskStats(userId: string): Promise<{ category: string; count: number }[]> {
    const result = await db.select({
      category: tasks.category,
      count: count(),
    }).from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.completed, true), eq(tasks.deleted, false)))
      .groupBy(tasks.category);
    return result.map(r => ({ category: r.category, count: Number(r.count) }));
  }

  async getRecurringTasks(userId: string): Promise<RecurringTask[]> {
    return db.select().from(recurringTasks)
      .where(and(eq(recurringTasks.userId, userId), eq(recurringTasks.active, true)))
      .orderBy(desc(recurringTasks.createdAt));
  }

  async createRecurringTask(userId: string, task: InsertRecurringTask): Promise<RecurringTask> {
    const [created] = await db.insert(recurringTasks)
      .values({ ...task, userId })
      .returning();
    return created;
  }

  async deleteRecurringTask(userId: string, id: number): Promise<void> {
    await db.delete(recurringTasks)
      .where(and(eq(recurringTasks.id, id), eq(recurringTasks.userId, userId)));
  }

  async spawnRecurringTasks(userId: string, date: string): Promise<Task[]> {
    const recurring = await this.getRecurringTasks(userId);
    if (recurring.length === 0) return [];

    const dayOfWeek = new Date(date + "T12:00:00").getDay().toString();

    const allTasksForDate = await db.select().from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.date, date)));
    const existingTitles = new Set(allTasksForDate.map(t => t.title));

    const toSpawn = recurring.filter(rt => {
      if (existingTitles.has(rt.title)) return false;
      if (rt.daysOfWeek && rt.daysOfWeek.length > 0) {
        return rt.daysOfWeek.includes(dayOfWeek);
      } else if (rt.daysOfWeek && rt.daysOfWeek.length === 0) {
        return false;
      }
      return true;
    });
    if (toSpawn.length === 0) return [];

    const uniqueTitles = new Set<string>();
    const deduped = toSpawn.filter(rt => {
      if (uniqueTitles.has(rt.title)) return false;
      uniqueTitles.add(rt.title);
      return true;
    });

    const spawned = await db.insert(tasks)
      .values(deduped.map(rt => ({
        userId,
        title: rt.title,
        category: rt.category,
        xpReward: rt.xpReward,
        date,
      })))
      .returning();
    return spawned;
  }

  async carryOverTasks(userId: string, date: string): Promise<Task[]> {
    const yesterday = new Date(date + "T12:00:00");
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const incompleteTasks = await db.select().from(tasks)
      .where(and(
        eq(tasks.userId, userId),
        eq(tasks.date, yesterdayStr),
        eq(tasks.completed, false),
        eq(tasks.failed, false),
        eq(tasks.deleted, false),
      ));

    if (incompleteTasks.length === 0) return [];

    const todayTasks = await db.select().from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.date, date)));
    const todayTitles = new Set(todayTasks.map(t => t.title));

    const toCarry = incompleteTasks.filter(t => !todayTitles.has(t.title));
    if (toCarry.length === 0) return [];

    const carried: Task[] = [];
    for (const t of toCarry) {
      await db.update(tasks)
        .set({ deleted: true, deletedAt: new Date() })
        .where(eq(tasks.id, t.id));

      const [newTask] = await db.insert(tasks)
        .values({
          userId,
          title: t.title,
          category: t.category,
          xpReward: t.xpReward,
          date,
        })
        .returning();
      carried.push(newTask);
    }

    return carried;
  }

  async getBadHabits(userId: string): Promise<BadHabit[]> {
    return db.select().from(badHabits)
      .where(eq(badHabits.userId, userId))
      .orderBy(desc(badHabits.createdAt));
  }

  async createBadHabit(userId: string, habit: InsertBadHabit): Promise<BadHabit> {
    const [created] = await db.insert(badHabits)
      .values({ ...habit, userId })
      .returning();
    return created;
  }

  async updateBadHabit(userId: string, id: number, habit: Partial<InsertBadHabit>): Promise<BadHabit | undefined> {
    const [updated] = await db.update(badHabits)
      .set(habit)
      .where(and(eq(badHabits.id, id), eq(badHabits.userId, userId)))
      .returning();
    return updated;
  }

  async deleteBadHabit(userId: string, id: number): Promise<void> {
    await db.delete(badHabitLogs)
      .where(and(eq(badHabitLogs.badHabitId, id), eq(badHabitLogs.userId, userId)));
    await db.delete(badHabits)
      .where(and(eq(badHabits.id, id), eq(badHabits.userId, userId)));
  }

  async logBadHabit(userId: string, badHabitId: number): Promise<{ log: BadHabitLog; progress: UserProgress }> {
    const [habit] = await db.select().from(badHabits)
      .where(and(eq(badHabits.id, badHabitId), eq(badHabits.userId, userId)));
    if (!habit) throw new Error("Bad habit not found");

    const today = new Date().toISOString().split("T")[0];
    const [log] = await db.insert(badHabitLogs)
      .values({ userId, badHabitId, xpLost: habit.xpPenalty, date: today })
      .returning();

    const current = await this.getUserProgress(userId);
    const newXp = Math.max(0, current.totalXp - habit.xpPenalty);
    const newLevel = calculateLevel(newXp);
    const [progress] = await db.update(userProgress)
      .set({ totalXp: newXp, level: newLevel })
      .where(eq(userProgress.userId, userId))
      .returning();

    return { log, progress };
  }

  async getBadHabitLogsToday(userId: string, date?: string): Promise<(BadHabitLog & { badHabit: BadHabit })[]> {
    const targetDate = date || new Date().toISOString().split("T")[0];
    const result = await db.select({
      id: badHabitLogs.id,
      userId: badHabitLogs.userId,
      badHabitId: badHabitLogs.badHabitId,
      xpLost: badHabitLogs.xpLost,
      date: badHabitLogs.date,
      createdAt: badHabitLogs.createdAt,
      badHabit: badHabits,
    }).from(badHabitLogs)
      .innerJoin(badHabits, eq(badHabitLogs.badHabitId, badHabits.id))
      .where(and(eq(badHabitLogs.userId, userId), eq(badHabitLogs.date, targetDate)))
      .orderBy(desc(badHabitLogs.createdAt));
    return result as any;
  }

  async recordFocusSession(userId: string, duration: number, xpGained: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    await db.insert(focusSessions).values({
      userId,
      duration,
      xpGained,
      date: today,
    });
  }

  async getMilestones(userId: string): Promise<{ type: string; date: string; title: string; description: string; icon: string; value?: number }[]> {
    const milestones: { type: string; date: string; title: string; description: string; icon: string; value?: number }[] = [];

    const ub = await db.select({
      id: userBadges.id,
      unlockedAt: userBadges.unlockedAt,
      badge: badges,
    }).from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .where(eq(userBadges.userId, userId));

    for (const b of ub) {
      const d = b.unlockedAt ? new Date(b.unlockedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      milestones.push({
        type: "badge",
        date: d,
        title: `Badge: ${b.badge.name}`,
        description: b.badge.description,
        icon: b.badge.icon,
      });
    }

    const activity = await this.getActivityHeatmap(userId);
    const sortedByCount = [...activity].sort((a, b) => b.count - a.count);
    const topDays = sortedByCount.filter(d => d.count >= 3).slice(0, 10);
    for (const day of topDays) {
      milestones.push({
        type: "productive_day",
        date: day.date,
        title: `Journée productive`,
        description: `${day.count} tâches complétées en une journée`,
        icon: "fire",
        value: day.count,
      });
    }

    const allCompleted = await db.select({
      date: tasks.date,
      xpReward: tasks.xpReward,
      completedAt: tasks.completedAt,
    }).from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.completed, true), eq(tasks.deleted, false)))
      .orderBy(tasks.completedAt);

    const allHabitLoss = await db.select({
      date: badHabitLogs.date,
      xpLost: badHabitLogs.xpLost,
    }).from(badHabitLogs)
      .where(eq(badHabitLogs.userId, userId));

    const badgeBonuses = ub
      .filter(b => b.badge.xpBonus > 0)
      .map(b => ({
        date: b.unlockedAt ? new Date(b.unlockedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        xp: b.badge.xpBonus,
      }));

    const allFocus = await db.select({
      date: focusSessions.date,
      xpGained: focusSessions.xpGained,
    }).from(focusSessions)
      .where(eq(focusSessions.userId, userId));

    const dailyNet = new Map<string, number>();
    for (const t of allCompleted) {
      dailyNet.set(t.date, (dailyNet.get(t.date) || 0) + t.xpReward);
    }
    for (const h of allHabitLoss) {
      dailyNet.set(h.date, (dailyNet.get(h.date) || 0) - h.xpLost);
    }
    for (const b of badgeBonuses) {
      dailyNet.set(b.date, (dailyNet.get(b.date) || 0) + b.xp);
    }
    for (const f of allFocus) {
      dailyNet.set(f.date, (dailyNet.get(f.date) || 0) + f.xpGained);
    }

    const sortedDays = [...dailyNet.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let cumulXp = 0;
    let currentLevel = 1;
    for (const [dayDate, net] of sortedDays) {
      cumulXp = Math.max(0, cumulXp + net);
      const newLevel = calculateLevel(cumulXp);
      while (currentLevel < newLevel) {
        currentLevel++;
        milestones.push({
          type: "level_up",
          date: dayDate,
          title: `Niveau ${currentLevel}`,
          description: `Atteint le niveau ${currentLevel} avec ${cumulXp} XP`,
          icon: "arrow-up",
          value: currentLevel,
        });
      }
      if (newLevel < currentLevel) {
        currentLevel = newLevel;
      }
    }

    const progress = await this.getUserProgress(userId);
    if (progress.longestStreak >= 3) {
      milestones.push({
        type: "streak_record",
        date: progress.lastActiveDate || new Date().toISOString().split("T")[0],
        title: `Record de streak`,
        description: `${progress.longestStreak} jours consécutifs`,
        icon: "flame",
        value: progress.longestStreak,
      });
    }

    milestones.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return milestones;
  }

  async getJournalEntries(userId: string): Promise<JournalEntry[]> {
    return db.select().from(journalEntries)
      .where(eq(journalEntries.userId, userId))
      .orderBy(desc(journalEntries.date));
  }

  async getJournalEntry(userId: string, date: string): Promise<JournalEntry | undefined> {
    const [entry] = await db.select().from(journalEntries)
      .where(and(eq(journalEntries.userId, userId), eq(journalEntries.date, date)));
    return entry;
  }

  async upsertJournalEntry(userId: string, entry: InsertJournalEntry): Promise<{ entry: JournalEntry; isNew: boolean }> {
    const targetDate = entry.date || new Date().toISOString().split("T")[0];
    const existing = await this.getJournalEntry(userId, targetDate);

    if (existing) {
      const [updated] = await db.update(journalEntries)
        .set({
          content: entry.content,
          mood: entry.mood,
          energy: entry.energy,
          updatedAt: new Date(),
        })
        .where(and(eq(journalEntries.userId, userId), eq(journalEntries.date, targetDate)))
        .returning();
      return { entry: updated, isNew: false };
    }

    try {
      const [created] = await db.insert(journalEntries)
        .values({
          userId,
          content: entry.content,
          mood: entry.mood,
          energy: entry.energy,
          date: targetDate,
          xpAwarded: false,
        })
        .returning();
      return { entry: created, isNew: true };
    } catch (e: any) {
      if (e.code === "23505") {
        const [updated] = await db.update(journalEntries)
          .set({
            content: entry.content,
            mood: entry.mood,
            energy: entry.energy,
            updatedAt: new Date(),
          })
          .where(and(eq(journalEntries.userId, userId), eq(journalEntries.date, targetDate)))
          .returning();
        return { entry: updated, isNew: false };
      }
      throw e;
    }
  }

  async markJournalXpAwarded(entryId: number): Promise<void> {
    await db.update(journalEntries)
      .set({ xpAwarded: true })
      .where(eq(journalEntries.id, entryId));
  }

  async getJournalInsights(userId: string): Promise<{ date: string; mood: number; energy: number }[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const startDate = thirtyDaysAgo.toISOString().split("T")[0];

    const entries = await db.select({
      date: journalEntries.date,
      mood: journalEntries.mood,
      energy: journalEntries.energy,
    }).from(journalEntries)
      .where(and(
        eq(journalEntries.userId, userId),
        sql`${journalEntries.date} >= ${startDate}`
      ))
      .orderBy(journalEntries.date);

    return entries;
  }
}

export const storage = new DatabaseStorage();
