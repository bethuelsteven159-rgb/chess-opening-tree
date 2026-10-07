import { workspaceUser } from "./user-workspace.js";

export async function requireOnlyMe() {
  if (!workspaceUser) {
    window.location.replace("./login.html");
    // Stop page initialization while navigation completes.
    throw new Error("Sign in to open your study workspace.");
  }
}
