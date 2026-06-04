import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const existingClient = typeof window !== "undefined" ? window.GM_SUPABASE_CLIENT : null;

export const supabase = existingClient || createClient(
  "https://puhscovkftoffykeyzze.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1aHNjb3ZrZnRvZmZ5a2V5enplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDI3NDEsImV4cCI6MjA5NTkxODc0MX0.N1vUdm7UhPxc9KqGRIutgOEqy8PBTyv529rsA4uGwCE"
);

if (typeof window !== "undefined" && !window.GM_SUPABASE_CLIENT) {
  window.GM_SUPABASE_CLIENT = supabase;
}
