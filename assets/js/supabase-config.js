(function () {
  const existing = window.HALLMONITOR_SUPABASE || {};

  // Default project credentials for this app.
  // You can still override via window.HALLMONITOR_SUPABASE before this script
  // or via localStorage keys HALLMONITOR_SUPABASE_URL / HALLMONITOR_SUPABASE_ANON_KEY.
  const config = {
    url: existing.url || "https://htxxboqjqchczagtcbbk.supabase.co",
    anonKey:
      existing.anonKey ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0eHhib3FqcWNoY3phZ3RjYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTQ3OTIsImV4cCI6MjA4ODM3MDc5Mn0.2tFvy8uiEBCcjwYfXlNXWTWdtlEY0gVLO6MQO3ntYLs",
    stateTable: existing.stateTable || "hallmonitor_state",
    stateRowId: existing.stateRowId || "global"
  };

  window.HALLMONITOR_SUPABASE = config;
})();
