export const SUPPORT_CARD_TYPE_VALUES = [
  "identity",
  "principle",
  "quote",
  "anti_tilt",
  "advice",
  "checklist",
  "mindset",
  "study_rule",
  "tournament",
  "note"
];

export const SUPPORT_CARD_CATEGORY_VALUES = [
  "vision",
  "discipline",
  "emotional_control",
  "study_process",
  "tournament_strength",
  "confidence",
  "recovery",
  "other"
];

export const SUPPORT_PRIORITY_VALUES = ["low", "normal", "high", "critical"];

export const GOAL_TYPE_VALUES = [
  "ultimate",
  "annual",
  "quarterly",
  "monthly",
  "rating",
  "tournament",
  "book",
  "process",
  "mindset",
  "custom"
];

export const GOAL_STATUS_VALUES = ["not_started", "active", "paused", "achieved", "abandoned"];

export const REMINDER_TYPE_VALUES = ["goal", "book", "tournament", "admin", "mindset", "review", "custom"];
export const REMINDER_REPEAT_VALUES = ["none", "daily", "weekly", "monthly", "custom_days"];
export const REMINDER_STATUS_VALUES = ["active", "done", "snoozed", "archived"];
export const REMINDER_WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const BOOK_FORMAT_VALUES = ["book", "pdf", "course", "video_series", "article", "website", "other"];
export const BOOK_STATUS_VALUES = ["want_to_read", "currently_reading", "paused", "finished", "dropped", "reference"];
export const BOOK_AREA_VALUES = [
  "opening",
  "middlegame",
  "endgame",
  "tactics",
  "calculation",
  "strategy",
  "game_collection",
  "psychology",
  "tournament_play",
  "biography",
  "general",
  "other"
];

export const TOURNAMENT_STATUS_VALUES = ["planned", "active", "completed", "cancelled"];
export const QUICK_IDEA_TYPE_VALUES = ["general", "opening", "training", "book", "mindset", "tournament", "app_improvement", "other"];
export const QUICK_IDEA_STATUS_VALUES = ["inbox", "converted", "archived"];

export const priorityRank = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateFromKey(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setMonth(next.getMonth() + amount);
  return next;
}

export function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

export function parseTagsInput(text) {
  return String(text || "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
}

export function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function compareDateKeys(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

export function isPastDate(dateKey) {
  return Boolean(dateKey) && compareDateKeys(dateKey, todayKey()) < 0;
}

export function isToday(dateKey) {
  return Boolean(dateKey) && compareDateKeys(dateKey, todayKey()) === 0;
}

export function isWithinDays(dateKey, days) {
  if (!dateKey) return false;
  const target = dateFromKey(dateKey);
  if (!target) return false;
  const today = dateFromKey(todayKey());
  if (!today) return false;
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);
  return diffDays >= 0 && diffDays <= days;
}

export function formatDateLabel(dateKey) {
  const date = dateFromKey(dateKey);
  if (!date) return "No date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function computeGoalProgress(goal) {
  const current = Number(goal?.current_value);
  const target = Number(goal?.target_value);

  if (Number.isFinite(current) && Number.isFinite(target) && target > 0) {
    return clampPercent((current / target) * 100);
  }

  if (goal?.manual_progress_percent !== null && goal?.manual_progress_percent !== undefined && goal?.manual_progress_percent !== "") {
    return clampPercent(goal.manual_progress_percent);
  }

  return 0;
}

export function computeBookProgress(book) {
  const currentPage = Number(book?.current_page);
  const totalPages = Number(book?.total_pages);

  if (Number.isFinite(currentPage) && Number.isFinite(totalPages) && totalPages > 0) {
    return clampPercent((currentPage / totalPages) * 100);
  }

  if (book?.progress_percent !== null && book?.progress_percent !== undefined && book?.progress_percent !== "") {
    return clampPercent(book.progress_percent);
  }

  return 0;
}

export function reminderVisibility(reminder) {
  const today = todayKey();

  if (reminder.status === "active" && reminder.due_date) {
    if (compareDateKeys(reminder.due_date, today) < 0) return "overdue";
    if (compareDateKeys(reminder.due_date, today) === 0) return "today";
    return "upcoming";
  }

  if (reminder.status === "snoozed" && reminder.snooze_until) {
    if (compareDateKeys(reminder.snooze_until, today) <= 0) return "today";
    return "snoozed";
  }

  if ((reminder.status === "active" || reminder.status === "snoozed") && !reminder.due_date) {
    return "no_date";
  }

  return reminder.status || "other";
}

export function isReminderDue(reminder) {
  const visibility = reminderVisibility(reminder);
  return visibility === "overdue" || visibility === "today";
}

export function nextDueDate(currentDate, repeatRule, repeatInterval = 1, repeatDays = []) {
  const safeInterval = Math.max(1, Number.parseInt(repeatInterval, 10) || 1);
  const base = dateFromKey(currentDate) || dateFromKey(todayKey());
  if (!base) return "";

  if (repeatRule === "daily") {
    return toDateKey(addDays(base, safeInterval));
  }

  if (repeatRule === "weekly") {
    return toDateKey(addDays(base, safeInterval * 7));
  }

  if (repeatRule === "monthly") {
    return toDateKey(addMonths(base, safeInterval));
  }

  if (repeatRule === "custom_days") {
    const dayIndexes = repeatDays
      .map(day => REMINDER_WEEKDAYS.indexOf(day))
      .filter(index => index >= 0)
      .sort((left, right) => left - right);

    if (!dayIndexes.length) return toDateKey(addDays(base, safeInterval));

    for (let offset = 1; offset <= 21; offset += 1) {
      const candidate = addDays(base, offset);
      if (dayIndexes.includes(candidate.getDay())) {
        return toDateKey(candidate);
      }
    }

    return toDateKey(addDays(base, 7));
  }

  return currentDate || "";
}

export function sortByPriorityThenUpdated(left, right) {
  const priorityDiff = (priorityRank[right?.priority] || 0) - (priorityRank[left?.priority] || 0);
  if (priorityDiff !== 0) return priorityDiff;
  return String(right?.updated_at || "").localeCompare(String(left?.updated_at || ""));
}

export function sortSupportCards(cards) {
  return [...cards].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    return sortByPriorityThenUpdated(left, right);
  });
}

export function supportCommandItems({ supportCards = [], goals = [], reminders = [], books = [] }) {
  const items = [];

  reminders
    .filter(reminder => reminderVisibility(reminder) === "overdue")
    .sort((left, right) => compareDateKeys(left.due_date, right.due_date))
    .forEach(reminder => {
      items.push({
        kind: "reminder",
        urgency: 0,
        title: reminder.title || "Untitled reminder",
        meta: reminder.due_date ? `Due ${formatDateLabel(reminder.due_date)}` : "No date",
        actionLabel: "Mark done",
        action: "mark-reminder-done",
        id: reminder.id
      });
    });

  reminders
    .filter(reminder => reminderVisibility(reminder) === "today")
    .sort((left, right) => compareDateKeys(left.due_date, right.due_date))
    .forEach(reminder => {
      items.push({
        kind: "reminder",
        urgency: 1,
        title: reminder.title || "Untitled reminder",
        meta: reminder.due_date ? `Due ${formatDateLabel(reminder.due_date)}` : "Due today",
        actionLabel: "Mark done",
        action: "mark-reminder-done",
        id: reminder.id
      });
    });

  sortSupportCards(supportCards.filter(card => card.status === "active" && card.pinned)).forEach(card => {
    items.push({
      kind: "card",
      urgency: 2,
      title: card.title || "Untitled support card",
      meta: card.category ? `${card.card_type} • ${card.category}` : card.card_type,
      actionLabel: "Open/edit",
      action: "edit-card",
      id: card.id
    });
  });

  goals
    .filter(goal => goal.status === "active" && goal.target_date && (isWithinDays(goal.target_date, 14) || isPastDate(goal.target_date)))
    .sort((left, right) => compareDateKeys(left.target_date, right.target_date))
    .forEach(goal => {
      items.push({
        kind: "goal",
        urgency: isPastDate(goal.target_date) ? 2 : 3,
        title: goal.title || "Untitled goal",
        meta: `Target ${formatDateLabel(goal.target_date)}`,
        actionLabel: "Open/edit",
        action: "edit-goal",
        id: goal.id
      });
    });

  books
    .filter(book => book.status === "currently_reading" && book.target_finish_date && (isWithinDays(book.target_finish_date, 14) || isPastDate(book.target_finish_date)))
    .sort((left, right) => compareDateKeys(left.target_finish_date, right.target_finish_date))
    .forEach(book => {
      items.push({
        kind: "book",
        urgency: isPastDate(book.target_finish_date) ? 3 : 4,
        title: book.title || "Untitled book",
        meta: `Finish ${formatDateLabel(book.target_finish_date)}`,
        actionLabel: "Open book",
        action: "edit-book",
        id: book.id
      });
    });

  return items.sort((left, right) => left.urgency - right.urgency);
}
