import { supabase } from "../config/supabase.js";

const googleLoginBtn = document.getElementById("googleLoginBtn");

googleLoginBtn.addEventListener("click", async () => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://bethuelsteven159-rgb.github.io/chess-opening-tree/random.html"
    }
  });

  if (error) {
    alert("Login failed: " + error.message);
  }
});
