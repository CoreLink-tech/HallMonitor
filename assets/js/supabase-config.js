(function () {
  const existing = window.HALLMONITOR_SUPABASE || {};

  // Default project credentials for this app.
  // You can still override via window.HALLMONITOR_SUPABASE before this script
  // or via localStorage keys HALLMONITOR_SUPABASE_URL / HALLMONITOR_SUPABASE_ANON_KEY.
  const config = {
    url: existing.url || "https://htxxboqjqchczagtcbbk.supabase.co",
    anonKey: existing.anonKey || "",
    stateTable: existing.stateTable || "hallmonitor_state",
    stateRowId: existing.stateRowId || "global"
  };

  window.HALLMONITOR_SUPABASE = config;
})();
