import { supabase } from "../config/supabase.js";

const ALLOWED_EMAIL = "bethuelsteven159@gmail.com";

export async function requireOnlyMe() {
  const { data, error } = await supabase.auth.getSession();
  const user = data?.session?.user || null;

  if (error || !user) {
    window.location.href = "./login.html";
    return;
  }

  if (user.email !== ALLOWED_EMAIL) {
    await supabase.auth.signOut();
    alert("Access denied.");
    window.location.href = "./login.html";
  }
}
