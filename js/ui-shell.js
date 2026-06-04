import { supabase } from "./config/supabase.js";

export const THEME_KEY = "gm_opening_tree_theme_v1";
const DEFAULT_THEME = "dark";

function resolveTheme(theme) {
  return theme === "light" ? "light" : DEFAULT_THEME;
}

export function getStoredTheme() {
  return resolveTheme(localStorage.getItem(THEME_KEY));
}

export function applyTheme(theme = getStoredTheme()) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document.body?.setAttribute("data-theme", resolved);
  localStorage.setItem(THEME_KEY, resolved);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", resolved === "light" ? "#f4efe4" : "#08111d");
  }

  return resolved;
}

export function bindThemeToggle(button) {
  if (!button) return;

  function paintLabel() {
    const currentTheme = applyTheme();
    button.textContent = currentTheme === "light" ? "Dark mode" : "Light mode";
    button.setAttribute("aria-pressed", currentTheme === "light" ? "true" : "false");
  }

  button.addEventListener("click", () => {
    const currentTheme = getStoredTheme();
    applyTheme(currentTheme === "light" ? "dark" : "light");
    paintLabel();
  });

  paintLabel();
}

export async function logoutUser() {
  await supabase.auth.signOut();
  window.location.href = "./login.html";
}

export function bindLogoutButton(button) {
  if (!button) return;

  button.addEventListener("click", async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout failed:", error);
      alert("Logout failed. Please try again.");
    }
  });
}

export function bindImportButton(triggerButton, input) {
  if (!triggerButton || !input) return;
  triggerButton.addEventListener("click", () => input.click());
}

export function initPageChrome() {
  applyTheme();
  bindThemeToggle(document.getElementById("themeToggleBtn"));
  bindLogoutButton(document.getElementById("logoutBtn"));
}
