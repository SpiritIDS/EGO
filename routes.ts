import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { insertTaskSchema, updateTaskSchema, insertRecurringTaskSchema, insertBadHabitSchema, insertJournalEntrySchema } from "@shared/schema";
import { seedBadges } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  await seedBadges();

  app.get("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const date = req.query.date as string | undefined;
      const targetDate = date || new Date().toISOString().split("T")[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      const todayStr = new Date().toISOString().split("T")[0];
      if (targetDate === todayStr) {
        await storage.carryOverTasks(userId, targetDate);
      }
      if (targetDate <= todayStr) {
        await storage.spawnRecurringTasks(userId, targetDate);
      }
      const tasks = await storage.getTasks(userId, targetDate);
      res.json(tasks);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tasks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const parsed = insertTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const task = await storage.createTask(userId, parsed.data);
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tasks/:id/complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) return res.status(400).json({ message: "Invalid task ID" });

      const task = await storage.completeTask(userId, taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });

      await storage.addXp(userId, task.xpReward);
      await storage.updateStreak(userId);
      const newBadges = await storage.checkAndAwardBadges(userId);
      const progress = await storage.getUserProgress(userId);
      res.json({ task, progress, newBadges });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tasks/:id/uncomplete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) return res.status(400).json({ message: "Invalid task ID" });

      const task = await storage.uncompleteTask(userId, taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });

      await storage.removeXp(userId, task.xpReward);
      const progress = await storage.getUserProgress(userId);
      res.json({ task, progress });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) return res.status(400).json({ message: "Invalid task ID" });
      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const task = await storage.updateTask(userId, taskId, parsed.data);
      if (!task) return res.status(404).json({ message: "Task not found" });
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tasks/:id/fail", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) return res.status(400).json({ message: "Invalid task ID" });

      const task = await storage.failTask(userId, taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });

      await storage.removeXp(userId, task.xpReward, false);
      const progress = await storage.getUserProgress(userId);
      res.json({ task, progress });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tasks/:id/unfail", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) return res.status(400).json({ message: "Invalid task ID" });

      const task = await storage.unfailTask(userId, taskId);
      if (!task) return res.status(404).json({ message: "Task not found or not failed" });

      await storage.addXp(userId, task.xpReward, false);
      const progress = await storage.getUserProgress(userId);
      res.json({ task, progress });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/tasks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const taskId = parseInt(req.params.id);
      if (isNaN(taskId)) return res.status(400).json({ message: "Invalid task ID" });
      await storage.deleteTask(userId, taskId);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/progress", isAuthenticated, async (req: any, res) => {
    const userId = req.session.userId;
    const progress = await storage.getUserProgress(userId);
    res.json(progress);
  });

  app.get("/api/badges", isAuthenticated, async (req: any, res) => {
    const allBadges = await storage.getAllBadges();
    res.json(allBadges);
  });

  app.get("/api/badges/mine", isAuthenticated, async (req: any, res) => {
    const userId = req.session.userId;
    const userBadges = await storage.getUserBadges(userId);
    res.json(userBadges);
  });

  app.get("/api/activity", isAuthenticated, async (req: any, res) => {
    const userId = req.session.userId;
    const heatmap = await storage.getActivityHeatmap(userId);
    res.json(heatmap);
  });

  app.get("/api/xp-history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const history = await storage.getXpHistory(userId);
      res.json(history);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/stats", isAuthenticated, async (req: any, res) => {
    const userId = req.session.userId;
    const stats = await storage.getTaskStats(userId);
    res.json(stats);
  });

  app.get("/api/stats/categories", isAuthenticated, async (req: any, res) => {
    const userId = req.session.userId;
    const stats = await storage.getTaskStats(userId);
    res.json(stats);
  });

  app.get("/api/recurring", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const recurring = await storage.getRecurringTasks(userId);
      res.json(recurring);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/recurring", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const parsed = insertRecurringTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const recurring = await storage.createRecurringTask(userId, parsed.data);
      res.json(recurring);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/recurring/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteRecurringTask(userId, id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/focus/complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const { duration } = req.body;
      if (!duration || typeof duration !== "number" || duration < 60) {
        return res.status(400).json({ message: "Invalid duration" });
      }
      await storage.recordFocusSession(userId, duration, 25);
      const progress = await storage.addXp(userId, 25, false);
      const newBadges = await storage.checkAndAwardBadges(userId);
      res.json({ progress, newBadges, xpGained: 25 });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/milestones", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const milestones = await storage.getMilestones(userId);
      res.json(milestones);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/bad-habits", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const habits = await storage.getBadHabits(userId);
      res.json(habits);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/bad-habits", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const parsed = insertBadHabitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const habit = await storage.createBadHabit(userId, parsed.data);
      res.json(habit);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/bad-habits/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const parsed = insertBadHabitSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const habit = await storage.updateBadHabit(userId, id, parsed.data);
      if (!habit) return res.status(404).json({ message: "Bad habit not found" });
      res.json(habit);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/bad-habits/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteBadHabit(userId, id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/bad-habits/:id/log", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const result = await storage.logBadHabit(userId, id);
      res.json(result);
    } catch (e: any) {
      if (e.message === "Bad habit not found") {
        return res.status(404).json({ message: e.message });
      }
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/bad-habit-logs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const date = req.query.date as string | undefined;
      const logs = await storage.getBadHabitLogsToday(userId, date);
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/journal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const entries = await storage.getJournalEntries(userId);
      res.json(entries);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/journal/insights", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const insights = await storage.getJournalInsights(userId);
      res.json(insights);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/journal/:date", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const date = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      const entry = await storage.getJournalEntry(userId, date);
      res.json(entry || null);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/journal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const parsed = insertJournalEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const todayStr = new Date().toISOString().split("T")[0];
      const submittedDate = parsed.data.date || todayStr;
      const { entry, isNew } = await storage.upsertJournalEntry(userId, { ...parsed.data, date: submittedDate });
      let progress = await storage.getUserProgress(userId);
      let xpGained = 0;
      if (isNew && submittedDate === todayStr && !entry.xpAwarded) {
        progress = await storage.addXp(userId, 15, false);
        xpGained = 15;
        await storage.markJournalXpAwarded(entry.id);
      }
      res.json({ entry, progress, xpGained });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
