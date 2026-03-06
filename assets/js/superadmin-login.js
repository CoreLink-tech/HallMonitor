(function () {
  const store = window.HallMonitorStore;
  store.ensureState();

  if (store.getSuperSession()) {
    window.location.replace("superadmin.html");
    return;
  }

  const state = store.getState();
  document.getElementById("metricUni").textContent = state.universities.length;
  document.getElementById("metricAdmin").textContent = state.admins.length;
  document.getElementById("metricHall").textContent = state.halls.length;

  const form = document.getElementById("superLoginForm");
  const errorBox = document.getElementById("superError");

  const showError = (message) => {
    if (!message) {
      errorBox.classList.add("hidden");
      errorBox.textContent = "";
      return;
    }
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
      showError("Enter both username and password.");
      return;
    }

    const result = store.loginSuperAdmin(username, password);
    if (!result.ok) {
      showError(result.reason || "Login failed.");
      document.getElementById("password").value = "";
      return;
    }

    showError("");
    window.location.replace("superadmin.html");
  });

  document.getElementById("autofillSuper").addEventListener("click", () => {
    document.getElementById("username").value = "superadmin";
    document.getElementById("password").value = "super123";
    showError("");
  });
})();
