import { supabase } from "../config/supabase.js";

const { data, error } = await supabase.auth.getSession();
export const workspaceUser = error ? null : data?.session?.user || null;
let activeUserId = workspaceUser?.id || null;

export function requireWorkspaceUserId() {
  if (!workspaceUser || activeUserId !== workspaceUser.id) {
    throw new Error("Your account changed. Sign in again before accessing study data.");
  }
  return workspaceUser.id;
}

export function workspaceKey(key) {
  return `${key}:user:${requireWorkspaceUserId()}`;
}

// Only the original owner may adopt the former single-user local data.
if (workspaceUser?.email?.toLowerCase() === "bethuelsteven159@gmail.com") {
  const marker = workspaceKey("gm_workspace_migrated_v1");
  if (!localStorage.getItem(marker)) {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith("gm_") || key.includes(":user:")) continue;
      const target = workspaceKey(key);
      if (localStorage.getItem(target) === null) {
        localStorage.setItem(target, localStorage.getItem(key));
      }
    }
    localStorage.setItem(marker, "true");
  }
}

export const workspaceStorage = {
  getItem: key => localStorage.getItem(workspaceKey(key)),
  setItem: (key, value) => localStorage.setItem(workspaceKey(key), value),
  removeItem: key => localStorage.removeItem(workspaceKey(key))
};

supabase.auth.onAuthStateChange((_event, session) => {
  activeUserId = session?.user?.id || null;
  if (activeUserId !== (workspaceUser?.id || null)) {
    window.location.replace("./login.html");
  }
});
