const DAY = 86400000;
export const NOTIFICATION_CATEGORIES = {
  reminders: "Reminders", goals: "Goals", reviews: "Due reviews",
  repairs: "Important repairs", events: "Tournament prep"
};

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateTime(date, time = "00:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return NaN;
  const result = new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : "00:00"}:00`);
  return localDateKey(result) === date ? result.getTime() : NaN;
}

function dayDistance(date, now) {
  const target = dateTime(date);
  const today = dateTime(localDateKey(now));
  // Calendar days stay correct across daylight-saving changes.
  return Math.round((target - today) / DAY);
}

function deadlineLabel(days) {
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
  return days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`;
}

export function buildNotifications(data = {}, now = new Date()) {
  const result = [];
  const add = (category, id, title, detail, action, priority = 2) => {
    result.push({ category, id: `${category}:${id}`, title, detail, action, priority });
  };
  for (const reminder of data.reminders || []) {
    if (!["active", "snoozed"].includes(reminder.status)) continue;
    const date = reminder.status === "snoozed" ? reminder.snooze_until : reminder.due_date;
    const due = dateTime(date, reminder.status === "snoozed" ? "00:00" : reminder.due_time);
    if (!Number.isFinite(due) || due > now.getTime()) continue;
    const days = dayDistance(date, now);
    add("reminders", `${reminder.id}:${date}:${reminder.due_time || ""}`, reminder.title || "Reminder",
      `${deadlineLabel(days)}${reminder.due_time && reminder.status !== "snoozed" ? ` at ${reminder.due_time}` : ""}. ${reminder.note || "Open your reminder to complete or reschedule it."}`,
      { type: "reminder", id: reminder.id, label: "Open reminder" }, days < 0 ? 0 : 1);
  }
  for (const goal of data.goals || []) {
    if (!["active", "not_started"].includes(goal.status)) continue;
    const days = dayDistance(goal.target_date, now);
    if (Number.isFinite(days) && days <= 7) {
      add("goals", `${goal.id}:deadline:${goal.target_date}`, goal.title || "Goal",
        `${deadlineLabel(days)}. Check your progress and choose the next step.`,
        { type: "goal", id: goal.id, label: "Update goal" }, days < 0 ? 0 : 1);
    } else {
      const touched = Date.parse(goal.last_touched_at || goal.updated_at || goal.created_at || "");
      if (Number.isFinite(touched) && now.getTime() - touched >= 7 * DAY) {
        add("goals", `${goal.id}:checkin:${goal.last_touched_at || goal.updated_at || goal.created_at}`, goal.title || "Goal",
          "No update for a week. Take a small step or adjust your plan.",
          { type: "goal", id: goal.id, label: "Check in" }, 3);
      }
    }
  }
  const sources = {
    opening_line: new Map((data.nodes || []).map(item => [item.id, item])),
    position: new Map((data.positions || []).map(item => [item.id, item])),
    repair: new Map((data.repairs || []).map(item => [item.id, item]))
  };
  const parentIds = new Set((data.nodes || []).map(item => item.parent_id).filter(Boolean));
  for (const [type, sourceMap] of Object.entries(sources)) {
    const due = (data.reviewItems || []).filter(item => {
      const source = sourceMap.get(item.source_id);
      return item.source_type === type && item.status === "active" && source
        && source.review_enabled !== false && source.exclude_from_training !== true
        && (type !== "opening_line" || !parentIds.has(source.id))
        && source.status !== "solved" && Date.parse(item.due_at) <= now.getTime();
    });
    if (!due.length) continue;
    const name = { opening_line: "opening line", position: "position", repair: "repair" }[type];
    const batch = due.map(item => `${item.id}:${item.due_at}`).sort().join("|");
    add("reviews", `${type}:${batch}`, `${due.length} ${name}${due.length === 1 ? "" : "s"} ready to review`,
      "A short recall session will keep your study fresh.",
      { type: "review", mode: { opening_line: "opening_lines", position: "positions", repair: "repairs" }[type], label: "Start review" }, 2);
  }
  for (const repair of data.repairs || []) {
    if (repair.status === "solved" || !["high", "critical"].includes(repair.severity)) continue;
    add("repairs", `${repair.id}:${repair.updated_at}`, repair.mistake || "Important repair",
      `${repair.severity === "critical" ? "Critical" : "High priority"} weakness. ${repair.repair_action || repair.lesson || "Review the lesson and test your response."}`,
      { type: "repair", id: repair.id, label: "Open repair" }, repair.severity === "critical" ? 1 : 3);
  }
  for (const event of data.events || []) {
    if (!["planned", "active"].includes(event.status)) continue;
    const days = dayDistance(event.event_date, now);
    if (!Number.isFinite(days) || days < 0 || days > 7) continue;
    add("events", `${event.id}:${event.event_date}`, event.event_name || "Tournament prep",
      `${days === 0 ? "Your event is today" : `Your event starts in ${days} day${days === 1 ? "" : "s"}`}. Check your prep and practical checklist.`,
      { type: "tournament_note", id: event.id, label: "Prepare" }, days <= 1 ? 1 : 2);
  }
  return result.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

export function visibleNotifications(items, state = {}, settings = {}, now = new Date()) {
  return items.filter(item => settings[item.category] !== false
    && !state[item.id]?.dismissed
    && !(Date.parse(state[item.id]?.snoozedUntil) > now.getTime()));
}
