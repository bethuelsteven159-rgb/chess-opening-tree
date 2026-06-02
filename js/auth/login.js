import { supabase } from "../config/supabase.js";

const googleLoginBtn = document.getElementById("googleLoginBtn");

googleLoginBtn.addEventListener("click", async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/random.html"
    }
  });

  if (error) {
    alert("Login failed: " + error.message);
  }
});
