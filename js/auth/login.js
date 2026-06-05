import { supabase } from "../config/supabase.js";
import { initPageChrome } from "../ui-shell.js";

const googleLoginBtn = document.getElementById("googleLoginBtn");
const loginStatusEl = document.getElementById("loginStatus");

initPageChrome();

function setStatus(message) {
  if (loginStatusEl) loginStatusEl.textContent = message;
}

function getRedirectUrl() {
  const currentUrl = window.location.href.split("?")[0].split("#")[0];

  if (currentUrl.endsWith("/login.html")) {
    return currentUrl.replace("/login.html", "/index.html");
  }

  return `${window.location.origin}/chess-opening-tree/index.html`;
}

async function redirectIfAlreadySignedIn() {
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session?.user) {
    window.location.href = "./index.html";
  }
}

googleLoginBtn?.addEventListener("click", async () => {
  const redirectUrl = getRedirectUrl();

  googleLoginBtn.disabled = true;
  setStatus("Opening Google sign-in...");

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl
    }
  });

  if (error) {
    googleLoginBtn.disabled = false;
    setStatus("Sign-in could not start.");
    alert(`Login failed: ${error.message}`);
  }
});

redirectIfAlreadySignedIn();
