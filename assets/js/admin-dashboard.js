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

  const statusOptions = [
    { value: "available", label: "Available" },
    { value: "occupied", label: "Occupied" },
    { value: "closed", label: "Closed" },
    { value: "maint", label: "Maintenance" }
  ];

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
    statsUnavailable: document.getElementById("statUnavailable"),
    tableBody: document.getElementById("tableBody"),
    addModal: document.getElementById("addModal"),
    addHallForm: document.getElementById("addHallForm"),
    useHallModal: document.getElementById("useHallModal"),
    useHallForm: document.getElementById("useHallForm"),
    useHallSummary: document.getElementById("useHallSummary"),
    toast: document.getElementById("toast")
  };

  let activeUseHallId = null;

  const showToast = (message) => {
    dom.toast.textContent = message;
    dom.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => dom.toast.classList.remove("show"), 2500);
  };

  const updateClock = () => {
    dom.clock.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
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

  const isHallLockedByOther = (hall) =>
    hall.status === "occupied" &&
    hall.usage &&
    hall.usage.coordinatorUsername &&
    hall.usage.coordinatorUsername !== "system" &&
    hall.usage.coordinatorUsername !== session.username;

  const isHallOwnedBySession = (hall) =>
    hall.status === "occupied" &&
    hall.usage &&
    hall.usage.coordinatorUsername === session.username;

  const formatStatusBadge = (status) => {
    const label = statusOptions.find((item) => item.value === status)?.label || status;
    return `<span class="badge ${esc(status)}"><span class="badge-dot"></span>${esc(label)}</span>`;
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
      hall.status,
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
    dom.statsAvailable.textContent = halls.filter((hall) => hall.status === "available").length;
    dom.statsOccupied.textContent = halls.filter((hall) => hall.status === "occupied").length;
    dom.statsUnavailable.textContent = halls.filter(
      (hall) => hall.status === "closed" || hall.status === "maint"
    ).length;
  };

  const renderTable = (halls) => {
    const query = filters.query.toLowerCase();

    const filtered = halls.filter((hall) => {
      const byBuilding = filters.building === "all" || hall.building === filters.building;
      const byStatus = filters.status === "all" || hall.status === filters.status;
      const byQuery = matchesQuery(hall, query);
      return byBuilding && byStatus && byQuery;
    });

    const ranked = [...filtered].sort((a, b) => {
      const aOwned = isHallOwnedBySession(a) ? 0 : 1;
      const bOwned = isHallOwnedBySession(b) ? 0 : 1;
      if (aOwned !== bOwned) {
        return aOwned - bOwned;
      }

      if (aOwned === 0 && bOwned === 0) {
        const aTime = new Date(a.usage?.updatedAt || 0).getTime();
        const bTime = new Date(b.usage?.updatedAt || 0).getTime();
        return bTime - aTime;
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
        const selectOptions = statusOptions
          .map((option) => {
            const selected = option.value === hall.status ? "selected" : "";
            return `<option value="${esc(option.value)}" ${selected}>${esc(option.label)}</option>`;
          })
          .join("");

        const currentInfo =
          hall.status === "occupied" && hall.usage
            ? `<div>${esc(hall.usage.course)}</div><small>${esc(hall.usage.lecturer)}</small>`
            : `<div>${formatStatusBadge(hall.status)}</div>`;

        const lockedByOther = isHallLockedByOther(hall);
        const ownedBySession = isHallOwnedBySession(hall);
        const statusSelectDisabled = hall.status === "occupied" ? "disabled" : "";
        const useBtnDisabled = lockedByOther ? "disabled" : "";
        const saveBtnDisabled = lockedByOther ? "disabled" : "";
        const deleteBtnDisabled = lockedByOther ? "disabled" : "";
        const lockNote = lockedByOther
          ? `<div class="lock-note">In use by ${esc(hall.usage.coordinator || hall.usage.coordinatorUsername)}</div>`
          : "";
        const doneButton = ownedBySession
          ? `<button class="done" data-action="done" data-id="${hall.id}">Done with Hall</button>`
          : "";
        const ownActiveBadge = ownedBySession ? `<div class="pin-note">Your active hall</div>` : "";
        const rowClass = ownedBySession ? "pinned-row" : "";

        return `
          <tr data-id="${hall.id}" class="${rowClass}">
            <td><input class="row-code" value="${esc(hall.code)}"/></td>
            <td><input class="row-building" value="${esc(hall.building)}"/></td>
            <td><input class="row-location" value="${esc(hall.location || "")}"/></td>
            <td><input class="row-faculty" value="${esc(hall.faculty || "")}"/></td>
            <td>${currentInfo}</td>
            <td>
              <select class="row-status">
                ${selectOptions}
              </select>
            </td>
            <td><input class="row-capacity" type="number" min="1" value="${esc(hall.capacity)}"/></td>
            <td><input class="row-note" value="${esc(hall.note || "")}"/></td>
            <td>
              <div class="row-actions">
                <button class="use" data-action="use" data-id="${hall.id}" ${useBtnDisabled}>Use Hall</button>
                ${doneButton}
                <button class="save" data-action="save" data-id="${hall.id}" ${saveBtnDisabled}>Save</button>
                <button class="delete" data-action="delete" data-id="${hall.id}" ${deleteBtnDisabled}>Delete</button>
              </div>
              ${ownActiveBadge}
              ${lockNote}
            </td>
          </tr>`;
      })
      .join("");

    dom.tableBody.querySelectorAll(".row-status").forEach((select) => {
      const row = select.closest("tr");
      const hall = ranked.find((item) => item.id === Number(row.dataset.id));
      if (hall && hall.status === "occupied") {
        select.disabled = true;
      }
    });
  };

  const render = () => {
    const state = store.getState();
    const university = getUniversity(state);
    const halls = getUniversityHalls(state);
    const coordinator = getCoordinator(state);

    dom.adminName.textContent = session.name;
    dom.adminRole.textContent = `${session.username} - ${coordinator.department} (${coordinator.level})`;
    dom.pageSubTitle.textContent = university
      ? `Managing ${university.name} - ${coordinator.faculty}`
      : "Manage hall statuses and availability";

    renderBuildingFilter(halls);
    renderStats(halls);
    renderTable(halls);
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
      alert("This hall is currently in use by another coordinator and cannot be edited.");
      return;
    }

    if (currentHall.status === "occupied" && status !== "occupied") {
      alert("Use the 'Done with Hall' button to release an occupied hall.");
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
        hall.usage = {
          course: note || "Course not set",
          lecturer: "Lecturer not set",
          department: coordinator.department,
          faculty: coordinator.faculty,
          level: coordinator.level,
          coordinator: session.name,
          coordinatorUsername: session.username,
          coordinatorId: session.adminId,
          updatedAt: new Date().toISOString()
        };
        hall.currentClass = {
          code: hall.usage.course,
          name: hall.usage.course,
          professor: hall.usage.lecturer,
          time: "In progress"
        };
      }
    });

    store.pushActivity(`Hall ${code} updated by ${session.username}`, session.username);
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

    store.withState((state) => {
      state.halls = state.halls.filter((item) => item.id !== hallId);
    });
    store.pushActivity(`Hall ${hall.code} deleted by ${session.username}`, session.username);
    showToast(`${hall.code} removed.`);
    render();
  };

  const doneWithHall = (hallId) => {
    const currentState = store.getState();
    const hall = currentState.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
    if (!hall) {
      return;
    }

    if (!isHallOwnedBySession(hall)) {
      alert("Only the coordinator currently using this hall can mark it as done.");
      return;
    }

    store.withState((state) => {
      const target = state.halls.find((item) => item.id === hallId && item.universityId === session.uniId);
      if (!target) {
        return;
      }
      target.status = "available";
      target.currentClass = null;
      target.usage = null;
      target.note = "";
    });

    store.pushActivity(`${session.username} released ${hall.code}`, session.username);
    showToast(`${hall.code} is now available.`);
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
      `${hall.code} - ${hall.location} | Coordinator profile: ${coordinator.department}, ` +
      `${coordinator.faculty}, Level ${coordinator.level}.`;

    document.getElementById("useCourse").value = hall.usage?.course || "";
    document.getElementById("useLecturer").value = hall.usage?.lecturer || "";
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

    if (!course || !lecturer) {
      alert("Course and lecturer are required.");
      return;
    }

    const currentState = store.getState();
    const coordinator = getCoordinator(currentState);

    let hallCode = "Hall";
    let blockedByOther = false;
    store.withState((state) => {
      const hall = state.halls.find(
        (item) => item.id === activeUseHallId && item.universityId === session.uniId
      );

      if (!hall) {
        return;
      }

      if (isHallLockedByOther(hall)) {
        blockedByOther = true;
        return;
      }

      hallCode = hall.code;
      hall.status = "occupied";
      hall.note = `${course} - ${lecturer}`;
      hall.usage = {
        course,
        lecturer,
        department: coordinator.department,
        faculty: coordinator.faculty,
        level: coordinator.level,
        coordinator: session.name,
        coordinatorUsername: session.username,
        coordinatorId: session.adminId,
        updatedAt: new Date().toISOString()
      };
      hall.currentClass = {
        code: course,
        name: course,
        professor: lecturer,
        time: "In progress"
      };
    });

    if (blockedByOther) {
      alert("Another coordinator is currently using this hall.");
      render();
      return;
    }

    store.pushActivity(
      `${session.username} marked ${hallCode} as occupied for ${course}`,
      session.username
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

    if (button.dataset.action === "save") {
      saveRow(hallId, row);
      return;
    }

    if (button.dataset.action === "done") {
      doneWithHall(hallId);
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

    store.pushActivity(`Hall ${code} created by ${session.username}`, session.username);
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
  render();
})();
