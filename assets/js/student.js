(function () {
  const store = window.HallMonitorStore;
  store.ensureState();

  const state = {
    building: "all",
    status: "all",
    query: ""
  };

  const statusLabel = {
    available: "Available",
    occupied: "Occupied",
    overdue: "Overdue",
    unconfirmed: "Needs Confirmation",
    closed: "Closed",
    maint: "Maintenance"
  };

  const esc = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const updateClock = () => {
    const clock = document.getElementById("clock");
    if (!clock) {
      return;
    }
    clock.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const toTextDate = (value) => store.toShortDate(value);

  const dom = {
    modal: document.getElementById("hallDetailModal"),
    modalTitle: document.getElementById("hallModalTitle"),
    modalSub: document.getElementById("hallModalSub"),
    modalBody: document.getElementById("hallModalBody"),
    closeModalBtn: document.getElementById("closeHallModal")
  };

  const syncDashboardLinks = () => {
    const adminSession = store.getAdminSession();
    const superSession = store.getSuperSession();
    const adminLink = document.getElementById("backToAdminLink");
    const superLink = document.getElementById("backToSuperLink");

    if (adminSession) {
      adminLink.classList.remove("hidden");
      adminLink.textContent = `Go Back to Admin Dashboard (${adminSession.username})`;
    } else {
      adminLink.classList.add("hidden");
      adminLink.textContent = "Go Back to Admin Dashboard";
    }

    if (superSession) {
      superLink.classList.remove("hidden");
      superLink.textContent = `Go Back to Super Admin Dashboard (${superSession.username})`;
    } else {
      superLink.classList.add("hidden");
      superLink.textContent = "Go Back to Super Admin Dashboard";
    }
  };

  const renderBuildings = (halls) => {
    const container = document.getElementById("buildingFilterList");
    const buildings = ["all", ...new Set(halls.map((hall) => hall.building).filter(Boolean))];

    container.innerHTML = buildings
      .map((building) => {
        const label = building === "all" ? "All Buildings" : building;
        const active = building === state.building ? "active" : "";
        return `<button class="building-item ${active}" data-building="${esc(building)}">${esc(label)}</button>`;
      })
      .join("");

    container.querySelectorAll(".building-item").forEach((button) => {
      button.addEventListener("click", () => {
        state.building = button.dataset.building;
        render();
      });
    });
  };

  const sessionSummary = (hall) => {
    if (hall.sessionState === "overdue") {
      return `Session overdue by ${hall.sessionMinutesOverdue || 0} minutes.`;
    }
    if (hall.sessionState === "unconfirmed") {
      return "Usage needs admin confirmation before this hall can be trusted as free or occupied.";
    }
    if (hall.sessionExpectedEndAt) {
      return `Expected to end ${toTextDate(hall.sessionExpectedEndAt)}.`;
    }
    return "No session timing available.";
  };

  const cardClassMarkup = (hall) => {
    if (hall.status === "occupied" && hall.currentClass) {
      return `
        <p><strong>${esc(hall.currentClass.code)}</strong></p>
        <p>${esc(hall.currentClass.name)}</p>
        <p>${esc(hall.currentClass.professor)}</p>
        <p>${esc(sessionSummary(hall))}</p>`;
    }

    if (hall.note) {
      return `<p>${esc(hall.note)}</p>`;
    }

    return "<p>No class currently scheduled.</p>";
  };

  const matchesQuery = (hall, query) => {
    if (!query) {
      return true;
    }

    const fields = [
      hall.code,
      hall.building,
      hall.note,
      hall.effectiveStatus,
      hall.currentClass && hall.currentClass.code,
      hall.currentClass && hall.currentClass.name,
      hall.currentClass && hall.currentClass.professor,
      hall.nextClass && hall.nextClass.code,
      hall.location,
      hall.faculty,
      hall.usage && hall.usage.course,
      hall.usage && hall.usage.lecturer,
      hall.usage && hall.usage.department
    ];

    return fields
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  };

  const render = () => {
    const db = store.getState();
    const halls = db.halls || [];

    syncDashboardLinks();
    renderBuildings(halls);

    const filtered = halls.filter((hall) => {
      const byBuilding = state.building === "all" || hall.building === state.building;
      const byStatus = state.status === "all" || hall.effectiveStatus === state.status;
      const byQuery = matchesQuery(hall, state.query.toLowerCase());
      return byBuilding && byStatus && byQuery;
    });

    document.getElementById("metricTotal").textContent = halls.length;
    document.getElementById("metricAvailable").textContent = halls.filter(
      (hall) => hall.effectiveStatus === "available"
    ).length;
    document.getElementById("metricOccupied").textContent = halls.filter(
      (hall) => hall.effectiveStatus === "occupied" || hall.effectiveStatus === "overdue"
    ).length;
    document.getElementById("metricAttention").textContent = halls.filter(
      (hall) => hall.effectiveStatus === "overdue" || hall.effectiveStatus === "unconfirmed"
    ).length;

    const grid = document.getElementById("hallsGrid");
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state">No halls match the current filters.</div>';
      return;
    }

    grid.innerHTML = filtered
      .map((hall) => {
        const nextClassText = hall.nextClass
          ? `Next: ${esc(hall.nextClass.time)} (${esc(hall.nextClass.code)})`
          : "No upcoming class set.";

        return `
          <article class="hall-card" data-hall-id="${hall.id}">
            <div class="hall-card-top">
              <div>
                <div class="hall-card-title">${esc(hall.code)}</div>
                <div class="hall-card-sub">${esc(hall.building)}</div>
              </div>
              <span class="badge ${esc(hall.effectiveStatus)}"><span class="badge-dot"></span>${esc(
                statusLabel[hall.effectiveStatus] || hall.effectiveStatus
              )}</span>
            </div>
            <div class="hall-body-box">${cardClassMarkup(hall)}</div>
            <div class="hall-meta">
              <span>Capacity: ${esc(hall.capacity)}</span>
              <span>${nextClassText}</span>
            </div>
          </article>`;
      })
      .join("");
  };

  const closeHallModal = () => {
    dom.modal.classList.remove("show");
  };

  const openHallModal = (hallId) => {
    const db = store.getState();
    const hall = db.halls.find((item) => item.id === hallId);
    if (!hall) {
      return;
    }

    const usage = hall.usage || {};
    const activeCourse = usage.course || hall.currentClass?.name || hall.currentClass?.code || "No course running";
    const activeLecturer = usage.lecturer || hall.currentClass?.professor || "No lecturer assigned";
    const activeDepartment = usage.department || "Not currently assigned";
    const activeFaculty = usage.faculty || hall.faculty || "Not set";
    const activeLevel = usage.level || "Not set";
    const coordinator = usage.coordinator || "Not set";
    const statusText = statusLabel[hall.effectiveStatus] || hall.effectiveStatus;
    const usageTime = usage.updatedAt
      ? new Date(usage.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
      : "Not yet logged";
    const sessionWindow =
      hall.status === "occupied" && usage
        ? `${hall.sessionStartedAt ? toTextDate(hall.sessionStartedAt) : "Start not set"} to ${
            hall.sessionExpectedEndAt ? toTextDate(hall.sessionExpectedEndAt) : "End not set"
          }`
        : "No active session";

    dom.modalTitle.textContent = hall.code;
    dom.modalSub.textContent = `${hall.building} | Capacity ${hall.capacity}`;
    dom.modalBody.innerHTML = `
      <article class="hall-meta-card">
        <p>Status</p>
        <strong>${esc(statusText)}</strong>
      </article>
      <article class="hall-meta-card">
        <p>Hall Location</p>
        <strong>${esc(hall.location || "Not set")}</strong>
      </article>
      <article class="hall-meta-card">
        <p>Faculty Located</p>
        <strong>${esc(hall.faculty || "Not set")}</strong>
      </article>
      <article class="hall-meta-card">
        <p>Department Using Hall</p>
        <strong>${esc(activeDepartment)}</strong>
      </article>
      <article class="hall-meta-card">
        <p>Coordinator Level</p>
        <strong>${esc(activeLevel)}</strong>
      </article>
      <article class="hall-meta-card">
        <p>Coordinator</p>
        <strong>${esc(coordinator)}</strong>
      </article>
      <article class="hall-meta-card full">
        <p>Course Ongoing</p>
        <strong>${esc(activeCourse)}</strong>
      </article>
      <article class="hall-meta-card full">
        <p>Lecturer</p>
        <strong>${esc(activeLecturer)}</strong>
      </article>
      <article class="hall-meta-card full">
        <p>Session Window</p>
        <strong>${esc(sessionWindow)}</strong>
      </article>
      <article class="hall-meta-card full">
        <p>Attention</p>
        <strong>${esc(sessionSummary(hall))}</strong>
      </article>
      <article class="hall-meta-card full">
        <p>Last Usage Update</p>
        <strong>${esc(usageTime)}</strong>
      </article>
      <article class="hall-meta-card full">
        <p>Next Scheduled Class</p>
        <strong>${esc(
          hall.nextClass ? `${hall.nextClass.code} at ${hall.nextClass.time}` : "No upcoming class set"
        )}</strong>
      </article>`;

    dom.modal.classList.add("show");
  };

  document.getElementById("statusFilter").addEventListener("change", (event) => {
    state.status = event.target.value;
    render();
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  window.addEventListener("hallmonitor:data-changed", render);
  window.addEventListener("storage", (event) => {
    if (event.key === "hallmonitor_db_v2") {
      render();
    }
  });

  updateClock();
  setInterval(updateClock, 1000);
  setInterval(render, 60000);

  document.getElementById("hallsGrid").addEventListener("click", (event) => {
    const card = event.target.closest(".hall-card[data-hall-id]");
    if (!card) {
      return;
    }
    openHallModal(Number(card.dataset.hallId));
  });

  dom.closeModalBtn.addEventListener("click", closeHallModal);
  dom.modal.addEventListener("click", (event) => {
    if (event.target === dom.modal) {
      closeHallModal();
    }
  });

  render();
})();
