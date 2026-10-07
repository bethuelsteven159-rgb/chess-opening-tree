import { workspaceStorage, workspaceUser } from "./auth/user-workspace.js";
import { setSelectedRepairId, setTrainingIntent } from "./navigation-state.js";
import { buildNotifications, visibleNotifications, NOTIFICATION_CATEGORIES } from "./notification-utils.js";

const STATE_KEY = "gm_notifications_state_v1";
const SETTINGS_KEY = "gm_notifications_settings_v1";

function read(key) {
  try { return JSON.parse(workspaceStorage.getItem(key) || "{}") || {}; }
  catch { return {}; }
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(text, onClick, secondary = true) {
  const el = element("button", `button ${secondary ? "button-secondary" : "button-primary"} button-tiny`, text);
  el.type = "button";
  el.addEventListener("click", onClick);
  return el;
}

export function initNotifications() {
  if (!workspaceUser || document.getElementById("notificationsBtn")) return;
  const nav = document.querySelector(".nav-actions");
  if (!nav) return;
  let state = read(STATE_KEY);
  const settings = read(SETTINGS_KEY);
  let items = [];
  let visible = [];
  let refreshing = false;
  let timer;
  const trigger = button("Notifications", () => { render(); dialog.showModal(); });
  trigger.id = "notificationsBtn";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-controls", "notificationsDialog");
  nav.prepend(trigger);

  const dialog = element("dialog", "notification-dialog");
  dialog.id = "notificationsDialog";
  dialog.setAttribute("aria-labelledby", "notificationsTitle");
  const head = element("div", "utility-dialog-head");
  const title = element("h3", "", "Your notifications");
  title.id = "notificationsTitle";
  head.append(title, button("Close", () => dialog.close()));
  const description = element("p", "muted", "What needs your attention, with a next step for each item. Updates while the app is open.");
  const status = element("p", "panel-note");
  status.setAttribute("role", "status");
  const actions = element("div", "notification-actions");
  const refreshButton = button("Refresh", refresh);
  const markReadButton = button("Mark all read", () => {
    for (const item of visible) state[item.id] = { ...state[item.id], read: true };
    saveState(); render();
  });
  actions.append(refreshButton, markReadButton);
  const prefs = element("details", "notification-preferences");
  prefs.append(element("summary", "", "Choose notifications"));
  const options = element("div", "notification-options");
  for (const [category, label] of Object.entries(NOTIFICATION_CATEGORIES)) {
    const row = element("label", "notification-option");
    const input = element("input");
    input.type = "checkbox";
    input.checked = settings[category] !== false;
    input.addEventListener("change", () => {
      settings[category] = input.checked;
      workspaceStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      render();
    });
    row.append(input, document.createTextNode(label));
    options.append(row);
  }
  prefs.append(options, element("p", "muted", "Preferences, read status, and snoozes are saved for your account on this device."));
  const list = element("div", "notification-list");
  dialog.append(head, description, actions, status, prefs, list);
  document.body.append(dialog);
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });

  function saveState() {
    // Bound history without resetting an alert that remains actionable.
    const activeIds = new Set(items.map(item => item.id));
    state = Object.fromEntries(Object.entries(state).filter(([id]) => activeIds.has(id)));
    workspaceStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function openItem(item) {
    state[item.id] = { ...state[item.id], read: true };
    saveState();
    const action = item.action;
    if (action.type === "review") {
      setTrainingIntent({ mode: action.mode });
      window.location.href = "./training.html";
    } else if (action.type === "repair") {
      setSelectedRepairId(action.id);
      window.location.href = "./repair.html";
    } else {
      workspaceStorage.setItem("gm_support_focus_v1", JSON.stringify({
        type: action.type, id: action.id,
        pane: { goal: "goals", reminder: "reminders", tournament_note: "events" }[action.type]
      }));
      window.location.href = "./support.html";
    }
  }

  function render() {
    try {
      items = buildNotifications(window.OpeningDB.notificationData());
      visible = visibleNotifications(items, state, settings);
      const unread = visible.filter(item => !state[item.id]?.read).length;
      trigger.textContent = unread ? `Notifications (${unread})` : "Notifications";
      trigger.classList.toggle("has-notifications", unread > 0);
      trigger.setAttribute("aria-label", `Notifications, ${unread} unread`);
      markReadButton.disabled = !unread;
      // Avoid replacing the focused controls while someone uses the dialog.
      if (dialog.open && list.contains(document.activeElement)) return;
      list.replaceChildren();
      if (!visible.length) {
        list.append(element("p", "line-empty", "You're all caught up. Due reminders, goal check-ins, reviews, and upcoming events will appear here."));
      }
      for (const item of visible) {
        const card = element("article", `notification-card${state[item.id]?.read ? " is-read" : ""}`);
        card.append(element("span", "eyebrow", `${NOTIFICATION_CATEGORIES[item.category]}${state[item.id]?.read ? "" : " • New"}`));
        card.append(element("h4", "", item.title), element("p", "muted", item.detail));
        const controls = element("div", "notification-actions");
        controls.append(button(item.action.label, () => openItem(item), false));
        controls.append(button("Snooze 1 day", () => {
          state[item.id] = { ...state[item.id], snoozedUntil: new Date(Date.now() + 86400000).toISOString() };
          saveState(); head.querySelector("button").focus(); render();
        }));
        controls.append(button("Dismiss", () => {
          state[item.id] = { ...state[item.id], dismissed: true };
          saveState(); head.querySelector("button").focus(); render();
        }));
        card.append(controls);
        list.append(card);
      }
    } catch (error) {
      status.textContent = "Notifications could not load. Try refreshing.";
      console.warn("Notifications unavailable:", error);
    }
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    refreshButton.disabled = true;
    status.textContent = "Checking your study workspace…";
    const db = window.OpeningDB;
    const results = await Promise.allSettled([
      db.loadGoals(), db.loadAppReminders(), db.loadReviewItems(), db.loadNodes(),
      db.loadPositions(), db.loadRepairItems(), db.loadTournamentNotes()
    ]);
    refreshing = false;
    refreshButton.disabled = false;
    status.textContent = results.some(result => result.status === "rejected")
      ? "Some updates are unavailable. Showing your saved study data."
      : `Updated at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
    render();
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state = read(STATE_KEY);
      for (const category of Object.keys(NOTIFICATION_CATEGORIES)) settings[category] = read(SETTINGS_KEY)[category];
      for (const [index, input] of [...options.querySelectorAll("input")].entries()) {
        input.checked = settings[Object.keys(NOTIFICATION_CATEGORIES)[index]] !== false;
      }
      render();
    }, 150);
  };
  window.addEventListener("gm-study-data-change", schedule);
  window.addEventListener("storage", schedule);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  setInterval(() => { if (!document.hidden) schedule(); }, 60000);
  render();
  // Fetch missing support/review data even when the user opens the editor first.
  setTimeout(refresh, 600);
}
