(function () {
  const store = window.HallMonitorStore;
  store.ensureState();

  const session = store.getSuperSession();
  if (!session) {
    window.location.replace("superadmin  login.html");
    return;
  }

  const ui = {
    page: "overview",
    query: "",
    uniStatus: "all",
    uniPlan: "all",
    adminStatus: "all",
    adminUni: "all"
  };

  const esc = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const dom = {
    pageTitle: document.getElementById("pageTitle"),
    pageSubTitle: document.getElementById("pageSubTitle"),
    clock: document.getElementById("clock"),
    globalSearch: document.getElementById("globalSearch"),
    uniStatusFilter: document.getElementById("uniStatusFilter"),
    uniPlanFilter: document.getElementById("uniPlanFilter"),
    adminStatusFilter: document.getElementById("adminStatusFilter"),
    adminUniFilter: document.getElementById("adminUniFilter"),
    metricsUniversity: document.getElementById("metricUniversities"),
    metricsAdmins: document.getElementById("metricAdmins"),
    metricsHalls: document.getElementById("metricHalls"),
    metricsPending: document.getElementById("metricPending"),
    overviewUniBody: document.getElementById("overviewUniBody"),
    overviewAdminBody: document.getElementById("overviewAdminBody"),
    uniBody: document.getElementById("uniBody"),
    adminBody: document.getElementById("adminBody"),
    activityList: document.getElementById("activityList"),
    universitiesCount: document.getElementById("universitiesCount"),
    adminsCount: document.getElementById("adminsCount"),
    superName: document.getElementById("superName"),
    superRole: document.getElementById("superRole"),
    toast: document.getElementById("toast"),
    uniModal: document.getElementById("uniModal"),
    adminModal: document.getElementById("adminModal"),
    uniForm: document.getElementById("uniForm"),
    adminForm: document.getElementById("adminForm")
  };

  dom.superName.textContent = session.displayName || session.username;
  dom.superRole.textContent = session.username;

  const showToast = (message) => {
    dom.toast.textContent = message;
    dom.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => dom.toast.classList.remove("show"), 2600);
  };

  const statusToBadgeClass = (status) => {
    if (status === "active") {
      return "available";
    }
    if (status === "inactive") {
      return "closed";
    }
    if (status === "pending") {
      return "maint";
    }
    return "occupied";
  };

  const statusBadge = (status) => {
    return `<span class="badge ${statusToBadgeClass(status)}"><span class="badge-dot"></span>${esc(status)}</span>`;
  };

  const roleBadge = (role) => {
    const cls = role === "admin" ? "maint" : "available";
    return `<span class="badge ${cls}"><span class="badge-dot"></span>${esc(role)}</span>`;
  };

  const planLabel = (plan) => plan.charAt(0).toUpperCase() + plan.slice(1);

  const toTextDate = (value) => store.toShortDate(value);

  const countsByUniversity = (state) => {
    const hallCount = new Map();
    const adminCount = new Map();

    state.halls.forEach((hall) => {
      hallCount.set(hall.universityId, (hallCount.get(hall.universityId) || 0) + 1);
    });

    state.admins.forEach((admin) => {
      adminCount.set(admin.uniId, (adminCount.get(admin.uniId) || 0) + 1);
    });

    return { hallCount, adminCount };
  };

  const updateClock = () => {
    dom.clock.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const applyPageState = () => {
    document.querySelectorAll(".page-block").forEach((block) => {
      block.classList.toggle("active", block.dataset.page === ui.page);
    });

    document.querySelectorAll(".super-nav").forEach((button) => {
      button.classList.toggle("active", button.dataset.page === ui.page);
    });

    const titles = {
      overview: "Platform Overview",
      universities: "University Management",
      admins: "Admin Management",
      activity: "Activity Log"
    };

    dom.pageTitle.textContent = titles[ui.page] || "Super Admin";
    dom.pageSubTitle.textContent = `Live platform data across all connected institutions`;
  };

  const renderMetrics = (state) => {
    dom.metricsUniversity.textContent = state.universities.length;
    dom.metricsAdmins.textContent = state.admins.length;
    dom.metricsHalls.textContent = state.halls.length;
    dom.metricsPending.textContent = state.universities.filter((uni) => uni.status === "pending").length;
  };

  const renderOverview = (state) => {
    const { hallCount, adminCount } = countsByUniversity(state);

    const recentUniversities = [...state.universities]
      .sort((a, b) => String(b.registered).localeCompare(String(a.registered)))
      .slice(0, 5);

    const recentAdmins = [...state.admins]
      .sort((a, b) => String(b.lastLogin || "").localeCompare(String(a.lastLogin || "")))
      .slice(0, 5);

    dom.overviewUniBody.innerHTML = recentUniversities.length
      ? recentUniversities
          .map((uni) => `
            <tr>
              <td>${esc(uni.name)}</td>
              <td>${esc(planLabel(uni.plan))}</td>
              <td>${hallCount.get(uni.id) || 0}</td>
              <td>${adminCount.get(uni.id) || 0}</td>
              <td>${statusBadge(uni.status)}</td>
            </tr>`)
          .join("")
      : '<tr><td colspan="5" class="empty">No universities yet.</td></tr>';

    dom.overviewAdminBody.innerHTML = recentAdmins.length
      ? recentAdmins
          .map((admin) => {
            const uni = state.universities.find((item) => item.id === admin.uniId);
            return `
            <tr>
              <td>${esc(`${admin.firstName} ${admin.lastName}`)}</td>
              <td>${esc(uni ? uni.code : "N/A")}</td>
              <td>${roleBadge(admin.role)}</td>
              <td>${statusBadge(admin.status)}</td>
            </tr>`;
          })
          .join("")
      : '<tr><td colspan="4" class="empty">No admins yet.</td></tr>';
  };

  const matchesGlobalQuery = (values) => {
    if (!ui.query) {
      return true;
    }

    return values
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(ui.query);
  };

  const renderUniversities = (state) => {
    const { hallCount, adminCount } = countsByUniversity(state);
    const filtered = state.universities.filter((uni) => {
      const byStatus = ui.uniStatus === "all" || uni.status === ui.uniStatus;
      const byPlan = ui.uniPlan === "all" || uni.plan === ui.uniPlan;
      const byQuery = matchesGlobalQuery([uni.name, uni.code, uni.country, uni.city, uni.domain]);
      return byStatus && byPlan && byQuery;
    });

    dom.uniBody.innerHTML = filtered.length
      ? filtered
          .map((uni) => {
            const activeLabel = uni.status === "active" ? "Deactivate" : "Activate";
            return `
            <tr>
              <td>
                <strong>${esc(uni.name)}</strong><br/>
                <small>${esc(uni.code)}</small>
              </td>
              <td>${esc(uni.country)}${uni.city ? `, ${esc(uni.city)}` : ""}</td>
              <td>${esc(planLabel(uni.plan))}</td>
              <td>${hallCount.get(uni.id) || 0} / ${esc(uni.maxHalls || "-")}</td>
              <td>${adminCount.get(uni.id) || 0}</td>
              <td>${statusBadge(uni.status)}</td>
              <td>
                <div class="super-actions">
                  <button class="ok" data-action="toggle-uni" data-id="${uni.id}">${activeLabel}</button>
                  <button class="warn" data-action="delete-uni" data-id="${uni.id}">Delete</button>
                </div>
              </td>
            </tr>`;
          })
          .join("")
      : '<tr><td colspan="7" class="empty">No universities match the filters.</td></tr>';
  };

  const renderAdmins = (state) => {
    const filtered = state.admins.filter((admin) => {
      const byStatus = ui.adminStatus === "all" || admin.status === ui.adminStatus;
      const byUni = ui.adminUni === "all" || admin.uniId === Number(ui.adminUni);
      const byQuery = matchesGlobalQuery([
        admin.firstName,
        admin.lastName,
        admin.username,
        admin.email,
        admin.role,
        admin.faculty,
        admin.department,
        admin.level
      ]);
      return byStatus && byUni && byQuery;
    });

    dom.adminBody.innerHTML = filtered.length
      ? filtered
          .map((admin) => {
            const uni = state.universities.find((item) => item.id === admin.uniId);
            const toggleLabel = admin.status === "active" ? "Deactivate" : "Activate";
            return `
            <tr>
              <td>
                <strong>${esc(admin.firstName)} ${esc(admin.lastName)}</strong><br/>
                <small>${esc(admin.email)}</small>
              </td>
              <td>${esc(uni ? uni.name : "N/A")}</td>
              <td>
                <strong>${esc(admin.department || "General Department")}</strong><br/>
                <small>${esc(admin.faculty || "General Faculty")} - ${esc(admin.level || "General")}</small>
              </td>
              <td>${roleBadge(admin.role)}</td>
              <td>${statusBadge(admin.status)}</td>
              <td>${esc(toTextDate(admin.lastLogin))}</td>
              <td>
                <div class="super-actions">
                  <button class="ok" data-action="toggle-admin" data-id="${admin.id}">${toggleLabel}</button>
                  <button class="warn" data-action="delete-admin" data-id="${admin.id}">Remove</button>
                </div>
              </td>
            </tr>`;
          })
          .join("")
      : '<tr><td colspan="7" class="empty">No admins match the filters.</td></tr>';
  };

  const renderActivity = (state) => {
    const list = state.activity || [];
    dom.activityList.innerHTML = list.length
      ? list
          .slice(0, 30)
          .map(
            (item) => `
              <article class="timeline-item">
                <p>${esc(item.message)}</p>
                <small>${esc(toTextDate(item.timestamp))} by ${esc(item.actor || "system")}</small>
              </article>`
          )
          .join("")
      : '<div class="empty">No activity yet.</div>';
  };

  const syncDropdowns = (state) => {
    dom.adminUniFilter.innerHTML =
      '<option value="all">All Universities</option>' +
      state.universities
        .map((uni) => `<option value="${uni.id}">${esc(uni.name)}</option>`)
        .join("");

    if (ui.adminUni !== "all") {
      dom.adminUniFilter.value = ui.adminUni;
      if (dom.adminUniFilter.value !== ui.adminUni) {
        ui.adminUni = "all";
        dom.adminUniFilter.value = "all";
      }
    }

    const adminUniSelect = document.getElementById("newAdminUni");
    adminUniSelect.innerHTML = state.universities
      .map((uni) => `<option value="${uni.id}">${esc(uni.name)}</option>`)
      .join("");
  };

  const render = () => {
    const state = store.getState();

    renderMetrics(state);
    renderOverview(state);
    renderUniversities(state);
    renderAdmins(state);
    renderActivity(state);
    syncDropdowns(state);

    dom.universitiesCount.textContent = state.universities.length;
    dom.adminsCount.textContent = state.admins.length;
  };

  const openModal = (modal) => {
    modal.classList.add("show");
  };

  const closeModal = (modal) => {
    modal.classList.remove("show");
  };

  const registerUniversity = () => {
    const name = document.getElementById("newUniName").value.trim();
    const code = document.getElementById("newUniCode").value.trim().toUpperCase();
    const country = document.getElementById("newUniCountry").value.trim();
    const city = document.getElementById("newUniCity").value.trim();
    const plan = document.getElementById("newUniPlan").value;
    const status = document.getElementById("newUniStatus").value;
    const maxHalls = Number.parseInt(document.getElementById("newUniMaxHalls").value, 10) || 50;
    const domain = document.getElementById("newUniDomain").value.trim();
    const notes = document.getElementById("newUniNotes").value.trim();

    if (!name || !code || !country) {
      alert("University name, code, and country are required.");
      return;
    }

    store.withState((state) => {
      const nextId = state.universities.length
        ? Math.max(...state.universities.map((uni) => uni.id)) + 1
        : 1;

      state.universities.push({
        id: nextId,
        name,
        code,
        country,
        city,
        plan,
        status,
        maxHalls,
        domain,
        notes,
        registered: new Date().toISOString().slice(0, 10)
      });
    });

    store.pushActivity(`University ${code} registered by ${session.username}`, session.username);
    dom.uniForm.reset();
    closeModal(dom.uniModal);
    showToast(`${code} registered.`);
    render();
  };

  const registerAdmin = () => {
    const firstName = document.getElementById("newAdminFirstName").value.trim();
    const lastName = document.getElementById("newAdminLastName").value.trim();
    const email = document.getElementById("newAdminEmail").value.trim();
    const username = document.getElementById("newAdminUsername").value.trim();
    const password = document.getElementById("newAdminPassword").value;
    const uniId = Number(document.getElementById("newAdminUni").value);
    const role = document.getElementById("newAdminRole").value;
    const status = document.getElementById("newAdminStatus").value;
    const faculty = document.getElementById("newAdminFaculty").value.trim();
    const department = document.getElementById("newAdminDepartment").value.trim();
    const level = document.getElementById("newAdminLevel").value.trim();

    if (!firstName || !lastName || !email || !username || !password || !faculty || !department || !level) {
      alert("Complete all required admin fields.");
      return;
    }

    if (!Number.isFinite(uniId)) {
      alert("Create at least one university before adding admins.");
      return;
    }

    store.withState((state) => {
      if (state.admins.some((admin) => admin.username.toLowerCase() === username.toLowerCase())) {
        throw new Error("duplicate_username");
      }

      const nextId = state.admins.length ? Math.max(...state.admins.map((admin) => admin.id)) + 1 : 1;
      state.admins.push({
        id: nextId,
        firstName,
        lastName,
        email,
        username,
        password,
        uniId,
        role,
        status,
        faculty,
        department,
        level,
        lastLogin: null
      });
    });

    store.pushActivity(`Admin ${username} created by ${session.username}`, session.username);
    dom.adminForm.reset();
    closeModal(dom.adminModal);
    showToast(`Admin ${username} created.`);
    render();
  };

  dom.uniForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      registerUniversity();
    } catch (error) {
      alert("Could not register university.");
    }
  });

  dom.adminForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      registerAdmin();
    } catch (error) {
      if (error && error.message === "duplicate_username") {
        alert("Username already exists.");
      } else {
        alert("Could not register admin.");
      }
    }
  });

  document.querySelectorAll(".super-nav[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.page = button.dataset.page;
      applyPageState();
      render();
    });
  });

  dom.globalSearch.addEventListener("input", (event) => {
    ui.query = event.target.value.toLowerCase();
    render();
  });

  dom.uniStatusFilter.addEventListener("change", (event) => {
    ui.uniStatus = event.target.value;
    render();
  });

  dom.uniPlanFilter.addEventListener("change", (event) => {
    ui.uniPlan = event.target.value;
    render();
  });

  dom.adminStatusFilter.addEventListener("change", (event) => {
    ui.adminStatus = event.target.value;
    render();
  });

  dom.adminUniFilter.addEventListener("change", (event) => {
    ui.adminUni = event.target.value;
    render();
  });

  document.getElementById("openUniModal").addEventListener("click", () => {
    openModal(dom.uniModal);
  });

  document.getElementById("openAdminModal").addEventListener("click", () => {
    openModal(dom.adminModal);
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      const modal = document.getElementById(button.dataset.closeModal);
      closeModal(modal);
    });
  });

  [dom.uniModal, dom.adminModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    store.logoutSuperAdmin();
    window.location.replace("superadmin  login.html");
  });

  dom.uniBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const uniId = Number(button.dataset.id);

    if (button.dataset.action === "toggle-uni") {
      store.withState((state) => {
        const uni = state.universities.find((item) => item.id === uniId);
        if (!uni) {
          return;
        }
        uni.status = uni.status === "active" ? "inactive" : "active";
      });
      store.pushActivity(`University ${uniId} status changed by ${session.username}`, session.username);
      showToast("University status updated.");
      render();
      return;
    }

    if (button.dataset.action === "delete-uni") {
      if (!window.confirm("Delete this university and all linked admins/halls?")) {
        return;
      }

      store.withState((state) => {
        state.universities = state.universities.filter((item) => item.id !== uniId);
        state.admins = state.admins.filter((item) => item.uniId !== uniId);
        state.halls = state.halls.filter((item) => item.universityId !== uniId);
      });

      store.pushActivity(`University ${uniId} deleted by ${session.username}`, session.username);
      showToast("University removed.");
      render();
    }
  });

  dom.adminBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const adminId = Number(button.dataset.id);

    if (button.dataset.action === "toggle-admin") {
      store.withState((state) => {
        const admin = state.admins.find((item) => item.id === adminId);
        if (!admin) {
          return;
        }
        admin.status = admin.status === "active" ? "inactive" : "active";
      });

      store.pushActivity(`Admin ${adminId} status changed by ${session.username}`, session.username);
      showToast("Admin status updated.");
      render();
      return;
    }

    if (button.dataset.action === "delete-admin") {
      if (!window.confirm("Remove this admin account?")) {
        return;
      }

      store.withState((state) => {
        state.admins = state.admins.filter((item) => item.id !== adminId);
      });

      store.pushActivity(`Admin ${adminId} removed by ${session.username}`, session.username);
      showToast("Admin removed.");
      render();
    }
  });

  window.addEventListener("hallmonitor:data-changed", render);
  window.addEventListener("storage", (event) => {
    if (event.key === "hallmonitor_db_v2") {
      render();
    }
  });

  updateClock();
  setInterval(updateClock, 1000);
  applyPageState();
  render();
})();
