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

  const state = store.getState();
  countEl.textContent = state.admins.filter((admin) => admin.status === "active").length;

  const setError = (message) => {
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

    const username = userInput.value.trim();
    const password = passInput.value;

    if (!username || !password) {
      setError("Enter both username and password.");
      return;
    }

    const result = store.loginAdmin(username, password);
    if (!result.ok) {
      passInput.value = "";
      setError(result.reason || "Login failed.");
      return;
    }

    setError("");
    window.location.replace("../dashboard.html");
  });
})();
