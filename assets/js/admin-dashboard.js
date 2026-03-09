(function () {
  const store = window.HallMonitorStore;
  store.ensureState();

  const session = store.getAdminSession();
  if (!session) {
    window.location.replace("adminn/login.html");
    return;
  }

  const filters = {
    building: "all",
    status: "all",
    query: ""
  };

  const rowStatusOptions = [
    { value: "available", label: "Available" },
    { value: "occupied", label: "Occupied" },
    { value: "closed", label: "Closed" },
    { value: "maint", label: "Maintenance" }
  ];

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

  const dom = {
    adminName: document.getElementById("adminName"),
    adminRole: document.getElementById("adminRole"),
    pageSubTitle: document.getElementById("pageSubTitle"),
    clock: document.getElementById("clock"),
    searchInput: document.getElementById("searchInput"),
    buildingFilter: document.getElementById("buildingFilter"),
    statusFilter: document.getElementById("statusFilter"),
    statsTotal: document.getElementById("statTotal"),
    statsAvailable: document.getElementById("statAvailable"),
    statsOccupied: document.getElementById("statOccupied"),
    statsOverdue: document.getElementById("statOverdue"),
    statsUnconfirmed: document.getElementById("statUnconfirmed"),
    statsUnavailable: document.getElementById("statUnavailable"),
    sessionAlerts: document.getElementById("sessionAlerts"),
    tableBody: document.getElementById("tableBody"),
    addModal: document.getElementById("addModal"),
    addHallForm: document.getElementById("addHallForm"),
    useHallModal: document.getElementById("useHallModal"),
    useHallForm: document.getElementById("useHallForm"),
    useHallSummary: document.getElementById("useHallSummary"),
    activityMeta: document.getElementById("activityMeta"),
    activityList: document.getElementById("adminActivityList"),
    toast: document.getElementById("toast")
  };

  let activeUseHallId = null;

  const showToast = (message) => {
    dom.toast.textContent = message;
    dom.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => dom.toast.classList.remove("show"), 2600);
  };

  const updateClock = () => {
    dom.clock.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const toTextDate = (value) => store.toShortDate(value);

  const toLocalDateParts = (iso) => {
    const date = iso ? new Date(iso) : new Date();
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    const isoText = adjusted.toISOString();
    return {
      date: isoText.slice(0, 10),
      time: isoText.slice(11, 16)
    };
  };

  const combineDateAndTime = (dateText, timeText) => {
    if (!dateText || !timeText) {
      return null;
    }
    const parsed = new Date(`${dateText}T${timeText}`);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  };

  const getDurationHours = (hall) => {
    if (hall?.usage?.durationHours) {
      return Math.max(1, Math.min(4, Number(hall.usage.durationHours)));
    }
    if (hall?.sessionStartedAt && hall?.sessionExpectedEndAt) {
      const diff = new Date(hall.sessionExpectedEndAt).getTime() - new Date(hall.sessionStartedAt).getTime();
      return Math.max(1, Math.min(4, Math.round(diff / 3600000)));
    }
    return 2;
  };

  const syncExpectedEndPreview = () => {
    const startDate = document.getElementById("useStartDate").value;
    const startTime = document.getElementById("useStartTime").value;
    const durationHours = Number(document.getElementById("useDurationHours").value);
    const startedAt = combineDateAndTime(startDate, startTime);

    if (!startedAt) {
      document.getElementById("useEndDate").value = "";
      document.getElementById("useEndTime").value = "";
      return null;
    }

    const expectedEndAt = store.addMinutes(startedAt, durationHours * 60);
    const endParts = toLocalDateParts(expectedEndAt);
    document.getElementById("useEndDate").value = endParts.date;
    document.getElementById("useEndTime").value = endParts.time;
    return { startedAt, expectedEndAt, durationHours };
  };

  const getUniversity = (state) => state.universities.find((uni) => uni.id === session.uniId);

  const getCoordinator = (state) => {
    const admin = state.admins.find((item) => item.id === session.adminId);
    return (
      admin || {
        id: session.adminId,
        firstName: session.name,
        lastName: "",
        username: session.username,
        faculty: session.faculty || "General Faculty",
        department: session.department || "General Department",
        level: session.level || "General"
      }
    );
  };

  const getUniversityHalls = (state) => state.halls.filter((hall) => hall.universityId === session.uniId);

  const isHallOwnedBySession = (hall) =>
    hall.status === "occupied" &&
    hall.usage &&
    hall.usage.coordinatorUsername === session.username;

  const isHallLockedByOther = (hall) =>
    hall.status === "occupied" &&
    hall.usage &&
    hall.usage.coordinatorUsername &&
    hall.usage.coordinatorUsername !== "system" &&
    hall.usage.coordinatorUsername !== session.username;

  const isStaleHall = (hall) => hall.sessionState === "overdue" || hall.sessionState === "unconfirmed";

  const canExtendHall = (hall) => hall.status === "occupied" && hall.usage && isHallOwnedBySession(hall);

  const canReleaseHall = (hall) =>
    hall.status === "occupied" && hall.usage && (isHallOwnedBySession(hall) || hall.sessionState === "unconfirmed");

  const canOverrideHall = (hall) => hall.status === "occupied" && hall.usage && isStaleHall(hall);

  const formatStatusBadge = (status) => {
    const label = statusLabel[status] || status;
    return `<span class="badge ${esc(status)}"><span class="badge-dot"></span>${esc(label)}</span>`;
  };

  const formatSessionWindow = (hall) => {
    if (!hall.usage || hall.status !== "occupied") {
      return "No active usage session";
    }

    const startText = hall.sessionStartedAt ? toTextDate(hall.sessionStartedAt) : "Start not set";
    const endText = hall.sessionExpectedEndAt ? toTextDate(hall.sessionExpectedEndAt) : "End not set";
    return `${startText} to ${endText}`;
  };

  const sessionMessage = (hall) => {
    if (hall.sessionState === "overdue") {
      return `Session overdue by ${hall.sessionMinutesOverdue || 0} min. Confirm extension or release the hall.`;
    }
    if (hall.sessionState === "unconfirmed") {
      return `Session was not closed on time. Another admin may need to release or take over this hall.`;
    }
    if (hall.sessionState === "active") {
      return `Expected to end ${toTextDate(hall.sessionExpectedEndAt)}.`;
    }
    return "";
  };

  const inferActivityRole = (entry) => {
    if (entry.actorRole) {
      return entry.actorRole;
    }
    if (entry.actor === "system") {
      return "system";
    }
    if (String(entry.message || "").toLowerCase().startsWith("super admin ")) {
      return "superadmin";
    }
    return "admin";
  };

  const renderBuildingFilter = (halls) => {
    const buildings = ["all", ...new Set(halls.map((hall) => hall.building).filter(Boolean))];
    dom.buildingFilter.innerHTML = buildings
      .map((building) => {
        const label = building === "all" ? "All Buildings" : building;
        const selected = building === filters.building ? "selected" : "";
        return `<option value="${esc(building)}" ${selected}>${esc(label)}</option>`;
      })
      .join("");
  };

  const matchesQuery = (hall, query) => {
    if (!query) {
      return true;
    }

    return [
      hall.code,
      hall.building,
      hall.location,
      hall.faculty,
      hall.note,
      hall.effectiveStatus,
      hall.usage && hall.usage.course,
      hall.usage && hall.usage.lecturer,
      hall.usage && hall.usage.department
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  };

  const renderStats = (halls) => {
    dom.statsTotal.textContent = halls.length;
    dom.statsAvailable.textContent = halls.filter((hall) => hall.effectiveStatus === "available").length;
    dom.statsOccupied.textContent = halls.filter((hall) => hall.effectiveStatus === "occupied").length;
    dom.statsOverdue.textContent = halls.filter((hall) => hall.effectiveStatus === "overdue").length;
    dom.statsUnconfirmed.textContent = halls.filter((hall) => hall.effectiveStatus === "unconfirmed").length;
    dom.statsUnavailable.textContent = halls.filter(
      (hall) => hall.effectiveStatus === "closed" || hall.effectiveStatus === "maint"
    ).length;
  };

  const renderSessionAlerts = (halls) => {
    const staleHalls = halls
      .filter((hall) => isStaleHall(hall))
      .sort((a, b) => String(a.sessionExpectedEndAt || "").localeCompare(String(b.sessionExpectedEndAt || "")))
      .slice(0, 4);

    dom.sessionAlerts.innerHTML = staleHalls.length
      ? staleHalls
          .map((hall) => `
            <article class="session-alert ${esc(hall.sessionState)}">
              <strong>${esc(hall.code)} - ${esc(statusLabel[hall.effectiveStatus] || hall.effectiveStatus)}</strong>
              <p>${esc(sessionMessage(hall))} Coordinator: ${esc(
                hall.usage?.coordinator || hall.usage?.coordinatorUsername || "system"
              )}</p>
            </article>`)
          .join("")
      : "";
  };

  const renderTable = (halls) => {
    const query = filters.query.toLowerCase();

    const filtered = halls.filter((hall) => {
      const byBuilding = filters.building === "all" || hall.building === filters.building;
      const byStatus = filters.status === "all" || hall.effectiveStatus === filters.status;
      const byQuery = matchesQuery(hall, query);
      return byBuilding && byStatus && byQuery;
    });

    const ranked = [...filtered].sort((a, b) => {
      const aPriority = isHallOwnedBySession(a) ? 0 : isStaleHall(a) ? 1 : 2;
      const bPriority = isHallOwnedBySession(b) ? 0 : isStaleHall(b) ? 1 : 2;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.code.localeCompare(b.code);
    });

    if (!ranked.length) {
      dom.tableBody.innerHTML =
        '<tr><td class="empty-row" colspan="9">No halls found for the active filters.</td></tr>';
      return;
    }

    dom.tableBody.innerHTML = ranked
      .map((hall) => {
        const selectOptions = rowStatusOptions
          .map((option) => {
            const selected = option.value === hall.status ? "selected" : "";
            return `<option value="${esc(option.value)}" ${selected}>${esc(option.label)}</option>`;
          })
          .join("");

        const currentInfo =
          hall.status === "occupied" && hall.usage
            ? `<div>${esc(hall.usage.course)}</div>
               <small>${esc(hall.usage.lecturer)}</small>
               <small>${esc(formatSessionWindow(hall))}</small>
               <div class="session-note">${formatStatusBadge(hall.effectiveStatus)}</div>`
            : `<div>${formatStatusBadge(hall.effectiveStatus)}</div>`;

        const lockedByOther = isHallLockedByOther(hall);
        const ownedBySession = isHallOwnedBySession(hall);
        const useBtnDisabled = lockedByOther;
        const saveBtnDisabled = lockedByOther;
        const deleteBtnDisabled = lockedByOther;
        const statusSelectDisabled = hall.status === "occupied" ? "disabled" : "";
        const extendButton = canExtendHall(hall)
          ? `<button class="extend" data-action="extend" data-id="${hall.id}">Extend 30m</button>`
          : "";
        const doneButton = canReleaseHall(hall)
          ? `<button class="done" data-action="done" data-id="${hall.id}">Mark Done</button>`
          : "";
        const overrideButton = canOverrideHall(hall)
          ? `<button class="override" data-action="override" data-id="${hall.id}">Override Free</button>`
          : "";
        const sessionNote = hall.status === "occupied" ? `<div class="session-note">${esc(sessionMessage(hall))}</div>` : "";
        const lockNote = lockedByOther
          ? `<div class="lock-note">In use by ${esc(hall.usage.coordinator || hall.usage.coordinatorUsername)}</div>`
          : "";
        const ownActiveBadge = ownedBySession ? `<div class="pin-note">You control this active session</div>` : "";
        const rowClass = ownedBySession ? "pinned-row" : "";

        return `
          <tr data-id="${hall.id}" class="${rowClass}">
            <td><input class="row-code" value="${esc(hall.code)}"/></td>
            <td><input class="row-building" value="${esc(hall.building)}"/></td>
            <td><input class="row-location" value="${esc(hall.location || "")}"/></td>
            <td><input class="row-faculty" value="${esc(hall.faculty || "")}"/></td>
            <td>${currentInfo}</td>
            <td>
              <select class="row-status" ${statusSelectDisabled}>
                ${selectOptions}
              </select>
            </td>
            <td><input class="row-capacity" type="number" min="1" value="${esc(hall.capacity)}"/></td>
            <td><input class="row-note" value="${esc(hall.note || "")}"/></td>
            <td>
              <div class="row-actions">
                <button class="use" data-action="use" data-id="${hall.id}" ${useBtnDisabled ? "disabled" : ""}>Use Hall</button>
                ${extendButton}
                ${doneButton}
                ${overrideButton}
                <button class="save" data-action="save" data-id="${hall.id}" ${saveBtnDisabled ? "disabled" : ""}>Save</button>
                <button class="delete" data-action="delete" data-id="${hall.id}" ${deleteBtnDisabled ? "disabled" : ""}>Delete</button>
              </div>
              ${ownActiveBadge}
              ${sessionNote}
              ${lockNote}
            </td>
          </tr>`;
      })
      .join("");
  };

  const getUniversityActivity = (state, university, halls) => {
    const adminActors = new Set(
      state.admins
        .filter((admin) => admin.uniId === session.uniId)
        .map((admin) => String(admin.username || "").toLowerCase())
    );
    const hallCodes = halls.map((hall) => String(hall.code || "").toLowerCase()).filter(Boolean);
    const universityTokens = [university?.code, university?.name]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return (state.activity || [])
      .filter((entry) => {
        if (entry.uniId === session.uniId) {
          return true;
        }

        const actor = String(entry.actor || "").toLowerCase();
        if (adminActors.has(actor)) {
          return true;
        }

        const message = String(entry.message || "").toLowerCase();
        if (universityTokens.some((token) => message.includes(token))) {
          return true;
        }

        return hallCodes.some((code) => message.includes(code));
      })
      .slice(0, 12);
  };

  const renderActivity = (activity) => {
    dom.activityMeta.textContent = activity.length
      ? `${activity.length} recent entr${activity.length === 1 ? "y" : "ies"} for this university`
      : "Recent admin actions for this university";

    dom.activityList.innerHTML = activity.length
      ? activity
          .map((entry) => {
            const role = inferActivityRole(entry);
            const roleLabel =
              role === "superadmin" ? "Super Admin" : role === "system" ? "System" : "Admin";
            return `
              <article class="activity-item">
                <p>${esc(entry.message)}</p>
                <small>${esc(toTextDate(entry.timestamp))} by ${esc(entry.actor || "system")} (${esc(roleLabel)})</small>
              </article>`;
          })
          .join("")
      : '<div class="activity-empty">No activity has been recorded for this university yet.</div>';
  };

  const render = () => {
    const state = store.getState();
    const university = getUniversity(state);
    const halls = getUniversityHalls(state);
    const coordinator = getCoordinator(state);
    const activity = getUniversityActivity(state, university, halls);

    dom.adminName.textContent = session.name;
    dom.adminRole.textContent = `${session.username} - ${session.role === "operator" ? "Coordinator" : "Admin"} - ${coordinator.department} (${coordinator.level})`;
    dom.pageSubTitle.textContent = university
      ? `Managing ${university.name} - ${coordinator.faculty}`
      : "Manage hall statuses and availability";

    renderBuildingFilter(halls);
    renderStats(halls);
    renderSessionAlerts(halls);
    renderTable(halls);
    renderActivity(activity);
  };

  const releaseHallUsage = (hallId, reason) => {
    const currentState = store.getState();
    const hall = currentState.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
    if (!hall) {
      return false;
    }

    store.withState((state) => {
      const target = state.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
      if (!target) {
        return;
      }
      target.status = "available";
      target.currentClass = null;
      target.usage = null;
      target.note = reason ? `Released: ${reason}` : "";
    });

    return hall;
  };

  const saveRow = (hallId, row) => {
    const code = row.querySelector(".row-code").value.trim();
    const building = row.querySelector(".row-building").value.trim();
    const location = row.querySelector(".row-location").value.trim();
    const faculty = row.querySelector(".row-faculty").value.trim();
    const status = row.querySelector(".row-status").value;
    const capacity = Number.parseInt(row.querySelector(".row-capacity").value, 10);
    const note = row.querySelector(".row-note").value.trim();

    if (!code || !building || !location || !faculty) {
      alert("Code, building, location, and faculty are required.");
      return;
    }

    if (!capacity || capacity < 1) {
      alert("Capacity must be greater than zero.");
      return;
    }

    const currentState = store.getState();
    const currentHall = currentState.halls.find(
      (item) => item.id === hallId && item.universityId === session.uniId
    );
    if (!currentHall) {
      alert("Hall was not found.");
      return;
    }

    if (isHallLockedByOther(currentHall)) {
      alert("This hall is currently controlled by another coordinator.");
      return;
    }

    if (currentHall.status === "occupied" && status !== "occupied") {
      alert("Use Mark Done or Override Free to release an active hall session.");
      return;
    }

    const coordinator = getCoordinator(currentState);

    store.withState((state) => {
      const hall = state.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
      if (!hall) {
        return;
      }

      hall.code = code;
      hall.building = building;
      hall.location = location;
      hall.faculty = faculty;
      hall.status = status;
      hall.capacity = capacity;
      hall.note = note;

      if (status !== "occupied") {
        hall.currentClass = null;
        hall.usage = null;
      } else if (!hall.usage) {
        const startedAt = new Date().toISOString();
        hall.usage = {
          course: note || "Course not set",
          lecturer: "Lecturer not set",
          department: coordinator.department,
          faculty: coordinator.faculty,
          level: coordinator.level,
          coordinator: session.name,
          coordinatorUsername: session.username,
          coordinatorId: session.adminId,
          updatedAt: startedAt,
          startedAt,
          expectedEndAt: store.addMinutes(startedAt, 120),
          lastConfirmedAt: startedAt,
          durationHours: 2
        };
        hall.currentClass = {
          code: hall.usage.course,
          name: hall.usage.course,
          professor: hall.usage.lecturer,
          time: "In progress"
        };
      }
    });

    store.pushActivity(`Hall ${code} updated by ${session.username}`, session.username, {
      actorRole: "admin",
      category: "hall",
      uniId: session.uniId,
      adminId: session.adminId,
      hallId
    });
    showToast(`Saved changes for ${code}.`);
    render();
  };

  const deleteHall = (hallId) => {
    const db = store.getState();
    const hall = db.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
    if (!hall) {
      return;
    }

    if (!window.confirm(`Delete ${hall.code}?`)) {
      return;
    }

    if (isHallLockedByOther(hall)) {
      alert("You cannot delete a hall while another coordinator controls it.");
      return;
    }

    store.withState((state) => {
      state.halls = state.halls.filter((item) => item.id !== hallId);
    });
    store.pushActivity(`Hall ${hall.code} deleted by ${session.username}`, session.username, {
      actorRole: "admin",
      category: "hall",
      uniId: session.uniId,
      adminId: session.adminId,
      hallId
    });
    showToast(`${hall.code} removed.`);
    render();
  };

  const doneWithHall = (hallId) => {
    const currentState = store.getState();
    const hall = currentState.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
    if (!hall) {
      return;
    }

    if (!canReleaseHall(hall)) {
      alert("Only the active coordinator can close this session unless it is already unconfirmed.");
      return;
    }

    releaseHallUsage(hallId, "");
    store.pushActivity(`${session.username} released ${hall.code}`, session.username, {
      actorRole: "admin",
      category: "hall",
      uniId: session.uniId,
      adminId: session.adminId,
      hallId
    });
    showToast(`${hall.code} is now available.`);
    render();
  };

  const extendHall = (hallId) => {
    const currentState = store.getState();
    const hall = currentState.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
    if (!hall) {
      return;
    }

    if (!canExtendHall(hall)) {
      alert("Only the current coordinator can extend this hall session.");
      return;
    }

    const currentDuration = getDurationHours(hall);
    const remainingHours = 4 - currentDuration;
    if (remainingHours <= 0) {
      alert("A single course session cannot exceed 4 hours.");
      return;
    }

    const extraHours = Number.parseInt(
      window.prompt(`Extend this session by how many hours? (1-${remainingHours})`, "1"),
      10
    );
    if (!extraHours || extraHours < 1 || extraHours > remainingHours) {
      return;
    }

    store.withState((state) => {
      const target = state.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
      if (!target || !target.usage) {
        return;
      }
      const anchor = target.usage.expectedEndAt || target.usage.updatedAt || new Date().toISOString();
      target.usage.expectedEndAt = store.addMinutes(anchor, extraHours * 60);
      target.usage.durationHours = Math.min(4, currentDuration + extraHours);
      target.usage.lastConfirmedAt = new Date().toISOString();
      target.usage.updatedAt = new Date().toISOString();
      if (target.currentClass) {
        target.currentClass.time = `${toTextDate(target.usage.startedAt)} to ${toTextDate(target.usage.expectedEndAt)}`;
      }
    });

    store.pushActivity(`Hall ${hall.code} session extended by ${session.username}`, session.username, {
      actorRole: "admin",
      category: "hall",
      uniId: session.uniId,
      adminId: session.adminId,
      hallId
    });
    showToast(`${hall.code} extended by ${extraHours} hour${extraHours === 1 ? "" : "s"}.`);
    render();
  };

  const overrideHall = (hallId) => {
    const currentState = store.getState();
    const hall = currentState.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
    if (!hall) {
      return;
    }

    if (!canOverrideHall(hall)) {
      alert("Only stale sessions can be overridden.");
      return;
    }

    const reason = window.prompt("Why are you overriding this hall as free?", "Coordinator left without closing session");
    if (reason === null) {
      return;
    }

    releaseHallUsage(hallId, reason.trim());
    store.pushActivity(`Hall ${hall.code} overridden as free by ${session.username}`, session.username, {
      actorRole: "admin",
      category: "hall",
      uniId: session.uniId,
      adminId: session.adminId,
      hallId
    });
    showToast(`${hall.code} released with override.`);
    render();
  };

  const openUseHallModal = (hallId) => {
    const state = store.getState();
    const hall = state.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
    if (!hall) {
      return;
    }

    if (isHallLockedByOther(hall)) {
      alert(`This hall is currently in use by ${hall.usage.coordinator || hall.usage.coordinatorUsername}.`);
      return;
    }

    const coordinator = getCoordinator(state);
    activeUseHallId = hall.id;

    dom.useHallSummary.textContent =
      `${hall.code} - ${hall.location} | ${coordinator.department}, ${coordinator.faculty}, Level ${coordinator.level}.`;

    document.getElementById("useCourse").value = hall.usage?.course || "";
    document.getElementById("useLecturer").value = hall.usage?.lecturer || "";
    const startParts = toLocalDateParts(hall.usage?.startedAt || new Date().toISOString());
    document.getElementById("useStartDate").value = startParts.date;
    document.getElementById("useStartTime").value = startParts.time;
    document.getElementById("useDurationHours").value = String(getDurationHours(hall));
    syncExpectedEndPreview();
    dom.useHallModal.classList.add("show");
  };

  const closeUseHallModal = () => {
    activeUseHallId = null;
    dom.useHallModal.classList.remove("show");
  };

  const markHallInUse = () => {
    if (!activeUseHallId) {
      return;
    }

    const course = document.getElementById("useCourse").value.trim();
    const lecturer = document.getElementById("useLecturer").value.trim();
    const schedule = syncExpectedEndPreview();

    if (!course || !lecturer || !schedule) {
      alert("Course, lecturer, session date, and start time are required.");
      return;
    }

    const { startedAt, expectedEndAt, durationHours } = schedule;

    const currentState = store.getState();
    const coordinator = getCoordinator(currentState);
    const hall = currentState.halls.find(
      (item) => item.id === activeUseHallId && item.universityId === session.uniId
    );

    if (!hall) {
      return;
    }

    if (isHallLockedByOther(hall)) {
      alert("Another coordinator is currently using this hall.");
      render();
      return;
    }

    const hallCode = hall.code;

    store.withState((state) => {
      const target = state.halls.find(
        (item) => item.id === activeUseHallId && item.universityId === session.uniId
      );
      if (!target) {
        return;
      }

      target.status = "occupied";
      target.note = `${course} - ${lecturer}`;
      target.usage = {
        course,
        lecturer,
        department: coordinator.department,
        faculty: coordinator.faculty,
        level: coordinator.level,
        coordinator: session.name,
        coordinatorUsername: session.username,
        coordinatorId: session.adminId,
        updatedAt: new Date().toISOString(),
        startedAt,
        expectedEndAt,
        lastConfirmedAt: new Date().toISOString(),
        durationHours
      };
      target.currentClass = {
        code: course,
        name: course,
        professor: lecturer,
        time: `${toTextDate(startedAt)} to ${toTextDate(expectedEndAt)}`
      };
    });

    store.pushActivity(
      `${session.username} marked ${hallCode} as occupied for ${course} until ${toTextDate(expectedEndAt)}`,
      session.username,
      {
        actorRole: "admin",
        category: "hall",
        uniId: session.uniId,
        adminId: session.adminId,
        hallId: activeUseHallId
      }
    );
    showToast(`${hallCode} set to occupied.`);
    closeUseHallModal();
    render();
  };

  dom.tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const hallId = Number(button.dataset.id);
    const row = button.closest("tr");

    if (button.dataset.action === "use") {
      openUseHallModal(hallId);
      return;
    }

    if (button.dataset.action === "extend") {
      extendHall(hallId);
      return;
    }

    if (button.dataset.action === "done") {
      doneWithHall(hallId);
      return;
    }

    if (button.dataset.action === "override") {
      overrideHall(hallId);
      return;
    }

    if (button.dataset.action === "save") {
      saveRow(hallId, row);
      return;
    }

    if (button.dataset.action === "delete") {
      deleteHall(hallId);
    }
  });

  dom.searchInput.addEventListener("input", (event) => {
    filters.query = event.target.value;
    render();
  });

  dom.buildingFilter.addEventListener("change", (event) => {
    filters.building = event.target.value;
    render();
  });

  dom.statusFilter.addEventListener("change", (event) => {
    filters.status = event.target.value;
    render();
  });

  document.getElementById("openAddHall").addEventListener("click", () => {
    dom.addModal.classList.add("show");
  });

  document.getElementById("closeAddModal").addEventListener("click", () => {
    dom.addModal.classList.remove("show");
  });

  document.getElementById("closeUseModal").addEventListener("click", closeUseHallModal);
  document.getElementById("useStartTime").addEventListener("input", syncExpectedEndPreview);
  document.getElementById("useDurationHours").addEventListener("change", syncExpectedEndPreview);

  dom.addModal.addEventListener("click", (event) => {
    if (event.target === dom.addModal) {
      dom.addModal.classList.remove("show");
    }
  });

  dom.useHallModal.addEventListener("click", (event) => {
    if (event.target === dom.useHallModal) {
      closeUseHallModal();
    }
  });

  dom.useHallForm.addEventListener("submit", (event) => {
    event.preventDefault();
    markHallInUse();
  });

  dom.addHallForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const code = document.getElementById("newCode").value.trim();
    const building = document.getElementById("newBuilding").value.trim();
    const location = document.getElementById("newLocation").value.trim();
    const faculty = document.getElementById("newFaculty").value.trim();
    const status = document.getElementById("newStatus").value;
    const capacity = Number.parseInt(document.getElementById("newCapacity").value, 10);
    const note = document.getElementById("newNote").value.trim();

    if (!code || !building || !location || !faculty) {
      alert("Hall code, building, location, and faculty are required.");
      return;
    }

    if (!capacity || capacity < 1) {
      alert("Enter a valid hall capacity.");
      return;
    }

    if (status === "occupied") {
      alert("Create the hall first, then use the timed session flow to mark it in use.");
      return;
    }

    store.withState((state) => {
      const nextId = state.halls.length ? Math.max(...state.halls.map((hall) => hall.id)) + 1 : 1;
      state.halls.push({
        id: nextId,
        code,
        building,
        location,
        faculty,
        status,
        capacity,
        universityId: session.uniId,
        note,
        currentClass: null,
        usage: null,
        nextClass: null
      });
    });

    store.pushActivity(`Hall ${code} created by ${session.username}`, session.username, {
      actorRole: "admin",
      category: "hall",
      uniId: session.uniId,
      adminId: session.adminId
    });
    dom.addHallForm.reset();
    dom.addModal.classList.remove("show");
    showToast(`${code} added.`);
    render();
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    store.logoutAdmin();
    window.location.replace("adminn/login.html");
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
  render();
})();
