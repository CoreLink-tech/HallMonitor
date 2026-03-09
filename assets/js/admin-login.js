(function () {
  const store = window.HallMonitorStore;
  store.ensureState();

  if (store.getAdminSession()) {
    window.location.replace("../dashboard.html");
    return;
  }

  const form = document.getElementById("adminLoginForm");
  const errorBox = document.getElementById("loginError");
  const userInput = document.getElementById("username");
  const passInput = document.getElementById("password");
  const countEl = document.getElementById("activeAdminCount");
  const submitButton = form.querySelector("button[type='submit']");

  const updateCount = () => {
    const state = store.getState();
    countEl.textContent = state.admins.filter((admin) => admin.status === "active").length;
  };

  const setBusy = (busy) => {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? "Syncing..." : "Sign in to Dashboard";
  };

  const hydrateAdmins = async () => {
    setBusy(true);
    try {
      await store.refreshFromRemote();
      updateCount();
    } finally {
      setBusy(false);
    }
  };

  updateCount();

  const setError = (message) => {
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

    const username = userInput.value.trim();
    const password = passInput.value;

    if (!username || !password) {
      setError("Enter both username and password.");
      return;
    }

    await hydrateAdmins();

    const result = store.loginAdmin(username, password);
    if (!result.ok) {
      passInput.value = "";
      if (countEl.textContent === "0") {
        setError("No university admin accounts exist yet. Sign in as super admin to create one.");
      } else {
        setError(result.reason || "Login failed.");
      }
      return;
    }

    setError("");
    window.location.replace("../dashboard.html");
  });

  void hydrateAdmins();
})();
