const express = require('express');
const { getDb } = require('../database');
const { verifyTask } = require('../services/taskVerifier');
const { completeTaskTransaction } = require('../services/taskCompleter');

const router = express.Router();

/**
 * GET /api/tasks
 * Список доступных заданий для пользователя
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;

    // Regular admin tasks
    let tasks = await db.all(`
      SELECT t.*, 
        CASE WHEN tc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed,
        0 as is_ad
      FROM tasks t
      LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
      WHERE t.is_active = 1
      ORDER BY t.sort_order ASC, t.created_at DESC
    `, userId);

    // Advertiser tasks (active, not own, not completed, not maxed out)
    let adTasks = [];
    try {
      adTasks = await db.all(`
        SELECT at2.id, at2.type, at2.title, at2.description, at2.reward, 
          at2.url as target_url, at2.url as target_id,
          '📢' as icon, 999 as sort_order, 1 as is_active,
          at2.max_completions, at2.current_completions, at2.created_at,
          at2.image_url,
          CASE WHEN atc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed,
          1 as is_ad, at2.advertiser_id,
          CASE WHEN at2.advertiser_id = ? THEN 1 ELSE 0 END as is_own
        FROM ad_tasks at2
        LEFT JOIN ad_task_completions atc ON atc.task_id = at2.id AND atc.user_id = ?
        WHERE at2.status = 'active' 
          AND at2.current_completions < at2.max_completions
        ORDER BY at2.created_at DESC
      `, userId, userId);
    } catch (adErr) {
      console.error('Ad tasks query error:', adErr);
    }

    console.log(`Tasks for user ${userId}: ${tasks.length} regular, ${adTasks.length} ad`);

    // Override reward for display — all tasks show ad_user_reward (actual user payout)
    const userRewardRow = await db.get("SELECT value FROM settings WHERE key = 'ad_user_reward'");
    const displayReward = parseFloat(userRewardRow?.value) || 10;
    tasks = tasks.map(t => ({ ...t, reward: displayReward }));
    adTasks = adTasks.map(t => ({ ...t, reward: displayReward }));

    // Get penalty and obligation settings
    const penaltyRow = await db.get("SELECT value FROM settings WHERE key = 'unsub_penalty'");
    const unsub_penalty = parseFloat(penaltyRow?.value) || 0;
    const checkHoursRow = await db.get("SELECT value FROM settings WHERE key = 'sub_check_hours'");
    const sub_check_hours = parseFloat(checkHoursRow?.value) || 72;

    // Filter by enabled task sub-modules
    const subModules = await db.all("SELECT key, value FROM settings WHERE key LIKE 'module_tasks_%'");
    const typeMap = { module_tasks_subscribe: 'subscribe_channel', module_tasks_bot: 'start_bot', module_tasks_link: 'visit_link' };
    const disabledTypes = subModules.filter(r => r.value === '0').map(r => typeMap[r.key]).filter(Boolean);
    
    const allTasks = [...tasks, ...adTasks].filter(t => !disabledTypes.includes(t.type));

    res.json({ tasks: allTasks, unsub_penalty, sub_check_hours, disabled_types: disabledTypes });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/tasks/:id
 * Одно задание
 */
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    const task = await db.get(`
      SELECT t.*, 
        CASE WHEN tc.id IS NOT NULL THEN 1 ELSE 0 END as is_completed
      FROM tasks t
      LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = ?
      WHERE t.id = ?
    `, userId, taskId);

    if (!task) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/tasks/:id/complete
 * Выполнить задание
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    // Check task exists and is active
    const task = await db.get('SELECT * FROM tasks WHERE id = ? AND is_active = 1', taskId);
    if (!task) {
      return res.status(404).json({ error: 'Задание не найдено или неактивно' });
    }

    // Check if already completed
    const existing = await db.get('SELECT id FROM task_completions WHERE user_id = ? AND task_id = ?', userId, taskId);
    if (existing) {
      return res.status(400).json({ error: 'Задание уже выполнено' });
    }

    // Check max completions
    if (task.max_completions > 0 && task.current_completions >= task.max_completions) {
      return res.status(400).json({ error: 'Лимит выполнений достигнут' });
    }

    // Verify task completion
    const verified = await verifyTask(task, userId);
    if (!verified) {
      return res.status(400).json({ error: 'Проверка не пройдена. Сначала выполните задание.' });
    }

    // Complete the task using shared service
    const updatedUser = await completeTaskTransaction({
      userId,
      taskId,
      taskType: 'admin',
      taskReward: parseFloat(task.reward),
      taskChannelType: task.type,
      channelId: task.target_id || null,
    });

    res.json({
      success: true,
      reward: updatedUser._actualReward,
      balance: updatedUser.balance,
      total_earned: updatedUser.total_earned,
      tasks_completed: updatedUser.tasks_completed,
    });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/tasks/:id/complete-ad
 * Выполнить рекламное задание
 */
router.post('/:id/complete-ad', async (req, res) => {
  try {
    const db = getDb();
    const userId = req.telegramUser.id;
    const taskId = parseInt(req.params.id);

    // Check ad task exists and is active
    const task = await db.get("SELECT * FROM ad_tasks WHERE id = ? AND status = 'active'", taskId);
    if (!task) {
      return res.status(404).json({ error: 'Рекламное задание не найдено или неактивно' });
    }

    // Cannot complete own task
    if (task.advertiser_id === userId) {
      return res.status(400).json({ error: 'Нельзя выполнить своё задание' });
    }

    // Check if already completed
    const existing = await db.get('SELECT id FROM ad_task_completions WHERE user_id = ? AND task_id = ?', userId, taskId);
    if (existing) {
      return res.status(400).json({ error: 'Задание уже выполнено' });
    }

    // Check max completions
    if (task.current_completions >= task.max_completions) {
      return res.status(400).json({ error: 'Лимит выполнений достигнут' });
    }

    // Extract channel identifier from URL for verification
    let channelId = task.url;
    const tmeMatch = task.url.match(/t\.me\/([^/?]+)/);
    if (tmeMatch) {
      channelId = '@' + tmeMatch[1];
    } else if (/^@/.test(task.url)) {
      channelId = task.url;
    }

    // Verify task completion
    const verifyData = { type: task.type, target_url: task.url, target_id: channelId };
    const verified = await verifyTask(verifyData, userId);
    if (!verified) {
      return res.status(400).json({ error: 'Проверка не пройдена. Сначала выполните задание.' });
    }

    // Complete the task using shared service
    const updatedUser = await completeTaskTransaction({
      userId,
      taskId,
      taskType: 'ad',
      taskReward: parseFloat(task.reward),
      taskChannelType: task.type,
      channelId,
    });

    res.json({
      success: true,
      reward: updatedUser._actualReward,
      balance: updatedUser.balance,
      total_earned: updatedUser.total_earned,
      tasks_completed: updatedUser.tasks_completed,
    });
  } catch (error) {
    console.error('Complete ad task error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;
