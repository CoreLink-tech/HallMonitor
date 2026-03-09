(function () {
  const store = window.HallMonitorStore;
  store.ensureState();

  if (store.getSuperSession()) {
    window.location.replace("superadmin.html");
    return;
  }

  const form = document.getElementById("superLoginForm");
  const errorBox = document.getElementById("superError");
  const submitButton = form.querySelector("button[type='submit']");

  const updateMetrics = () => {
    const state = store.getState();
    document.getElementById("metricUni").textContent = state.universities.length;
    document.getElementById("metricAdmin").textContent = state.admins.length;
    document.getElementById("metricHall").textContent = state.halls.length;
  };

  const setBusy = (busy) => {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? "Syncing..." : "Access Platform Dashboard";
  };

  const hydrateState = async () => {
    setBusy(true);
    try {
      await store.refreshFromRemote();
      updateMetrics();
    } finally {
      setBusy(false);
    }
  };

  updateMetrics();

  const showError = (message) => {
    if (!message) {
      errorBox.classList.add("hidden");
      errorBox.textContent = "";
      return;
    }
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) {
      showError("Enter both username and password.");
      return;
    }

    await hydrateState();

    const result = store.loginSuperAdmin(username, password);
    if (!result.ok) {
      showError(result.reason || "Login failed.");
      return;
    }

    showError("");
    window.location.replace("superadmin.html");
  });

  void hydrateState();
})();
