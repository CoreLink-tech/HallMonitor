(function () {
  const cfg = window.HALLMONITOR_SUPABASE || {};

  const envUrl = window.localStorage.getItem("HALLMONITOR_SUPABASE_URL") || "";
  const envAnon = window.localStorage.getItem("HALLMONITOR_SUPABASE_ANON_KEY") || "";

  const url = cfg.url || envUrl;
  const anonKey = cfg.anonKey || envAnon;

  if (!url || !anonKey || !window.supabase || !window.supabase.createClient) {
    window.HallMonitorSupabase = null;
    return;
  }

  window.HallMonitorSupabase = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
})();
