import { supabase } from "../config/supabase.js";

const ALLOWED_EMAIL = "bethuelsteven159@gmail.com";

export async function requireOnlyMe() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    window.location.href = "./login.html";
    return;
  }

  if (data.user.email !== ALLOWED_EMAIL) {
    await supabase.auth.signOut();
    alert("Access denied.");
    window.location.href = "./login.html";
  }
}
