import { supabase } from "../config/supabase.js";

const googleLoginBtn = document.getElementById("googleLoginBtn");

function getRedirectUrl() {
  const currentUrl = window.location.href.split("?")[0].split("#")[0];

  if (currentUrl.endsWith("/login.html")) {
    return currentUrl.replace("/login.html", "/random.html");
  }

  return `${window.location.origin}/chess-opening-tree/random.html`;
}

googleLoginBtn.addEventListener("click", async () => {
  const redirectUrl = getRedirectUrl();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl
    }
  });

  if (error) {
    alert("Login failed: " + error.message);
  }
});
