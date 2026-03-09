(function () {
  const DB_KEY = "hallmonitor_db_v2";
  const ADMIN_SESSION_KEY = "hallmonitor_admin_session_v1";
  const SUPER_SESSION_KEY = "hallmonitor_superadmin_session_v1";
  const DB_VERSION = 4;
  const ACCESS_SEED_REVISION = 1;
  const REMOTE_WRITE_DEBOUNCE_MS = 320;
  const DEFAULT_SESSION_DURATION_MINUTES = 120;
  const SESSION_OVERDUE_GRACE_MINUTES = 20;
  const PRIMARY_SUPERADMIN = Object.freeze({
    id: 1,
    username: "ashedavid2005@gmail.com",
    password: "p1a2s3@code",
    displayName: "Primary Super Admin"
  });

  const FACULTY_BY_BUILDING = {
    "Business School": "Faculty of Management Sciences",
    "Engineering Building": "Faculty of Engineering",
    "Liberal Arts Center": "Faculty of Arts",
    "Science Hall": "Faculty of Science"
  };

  let remoteHydrationStarted = false;
  let remoteWriteTimer = null;
  let remoteHydrationPromise = null;

  const toDate = () => new Date().toISOString();
  const toDateFromMs = (value) => new Date(value).toISOString();
  const toMs = (value) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const addMinutes = (value, minutes) => {
    const startMs = toMs(value) || Date.now();
    return toDateFromMs(startMs + minutes * 60 * 1000);
  };
  const toShortDate = (iso) => {
    if (!iso) {
      return "Never";
    }
    const dt = new Date(iso);
    return dt.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const supabaseConfig = () => window.HALLMONITOR_SUPABASE || {};
  const supabaseClient = () => window.HallMonitorSupabase || null;
  const remoteTable = () => supabaseConfig().stateTable || "hallmonitor_state";
  const remoteRowId = () => supabaseConfig().stateRowId || "global";

  const defaultState = () => ({
    meta: {
      seededAt: toDate(),
      version: DB_VERSION,
      accessSeedRevision: ACCESS_SEED_REVISION
    },
    universities: [],
    admins: [],
    superAdmins: [clone(PRIMARY_SUPERADMIN)],
    halls: [],
    activity: []
  });

  const defaultAdminProfile = () => ({
    faculty: "General Faculty",
    department: "General Department",
    level: "General"
  });

  const deriveHallUsageState = (hall) => {
    const status = hall.status || "available";
    const usage = hall.usage || null;
    const startedAt = usage ? usage.startedAt || usage.updatedAt || null : null;
    const expectedEndAt = usage ? usage.expectedEndAt || null : null;
    const nowMs = Date.now();
    const endMs = expectedEndAt ? toMs(expectedEndAt) : null;
    const graceMs = SESSION_OVERDUE_GRACE_MINUTES * 60 * 1000;

    if (status !== "occupied" || !usage) {
      return {
        effectiveStatus: status,
        sessionState: null,
        startedAt,
        expectedEndAt,
        isStale: false,
        isLocked: false,
        minutesUntilEnd: null,
        minutesOverdue: null
      };
    }

    if (!endMs) {
      return {
        effectiveStatus: "unconfirmed",
        sessionState: "unconfirmed",
        startedAt,
        expectedEndAt,
        isStale: true,
        isLocked: false,
        minutesUntilEnd: null,
        minutesOverdue: null
      };
    }

    if (nowMs <= endMs) {
      return {
        effectiveStatus: "occupied",
        sessionState: "active",
        startedAt,
        expectedEndAt,
        isStale: false,
        isLocked: true,
        minutesUntilEnd: Math.max(0, Math.ceil((endMs - nowMs) / 60000)),
        minutesOverdue: 0
      };
    }

    if (nowMs <= endMs + graceMs) {
      return {
        effectiveStatus: "overdue",
        sessionState: "overdue",
        startedAt,
        expectedEndAt,
        isStale: true,
        isLocked: true,
        minutesUntilEnd: 0,
        minutesOverdue: Math.ceil((nowMs - endMs) / 60000)
      };
    }

    return {
      effectiveStatus: "unconfirmed",
      sessionState: "unconfirmed",
      startedAt,
      expectedEndAt,
      isStale: true,
      isLocked: false,
      minutesUntilEnd: 0,
      minutesOverdue: Math.ceil((nowMs - endMs) / 60000)
    };
  };

  const decorateState = (state) => {
    state.halls = (state.halls || []).map((hall) => {
      const runtime = deriveHallUsageState(hall);
      return {
        ...hall,
        effectiveStatus: runtime.effectiveStatus,
        sessionState: runtime.sessionState,
        sessionStartedAt: runtime.startedAt,
        sessionExpectedEndAt: runtime.expectedEndAt,
        sessionIsStale: runtime.isStale,
        sessionIsLocked: runtime.isLocked,
        sessionMinutesUntilEnd: runtime.minutesUntilEnd,
        sessionMinutesOverdue: runtime.minutesOverdue
      };
    });

    return state;
  };

  const readState = () => {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  };

  const pushRemoteState = async (state) => {
    const client = supabaseClient();
    if (!client) {
      return;
    }

    const payload = clone(state);
    const row = {
      id: remoteRowId(),
      payload
    };

    const { error } = await client.from(remoteTable()).upsert(row, { onConflict: "id" });
    if (error) {
      console.warn("HallMonitor Supabase write failed:", error.message || error);
    }
  };

  const scheduleRemoteWrite = (state) => {
    if (!supabaseClient()) {
      return;
    }

    const snapshot = clone(state);
    clearTimeout(remoteWriteTimer);
    remoteWriteTimer = setTimeout(() => {
      void pushRemoteState(snapshot);
    }, REMOTE_WRITE_DEBOUNCE_MS);
  };

  const writeState = (state, options) => {
    const opts = options || {};
    localStorage.setItem(DB_KEY, JSON.stringify(state));
    if (!opts.skipRemote) {
      scheduleRemoteWrite(state);
    }
    window.dispatchEvent(new CustomEvent("hallmonitor:data-changed"));
  };

  const normalizeAdmin = (admin) => {
    let changed = false;
    const fallback = defaultAdminProfile();

    if (!admin.faculty) {
      admin.faculty = fallback.faculty;
      changed = true;
    }

    if (!admin.department) {
      admin.department = fallback.department;
      changed = true;
    }

    if (!admin.level) {
      admin.level = fallback.level;
      changed = true;
    }

    return changed;
  };

  const migrateAccounts = (state, previousVersion) => {
    let changed = false;
    const legacyVersion = Number.isFinite(previousVersion) ? previousVersion : 0;
    const accessSeedRevision = Number(state.meta && state.meta.accessSeedRevision ? state.meta.accessSeedRevision : 0);
    const expectedSuperAdmins = [clone(PRIMARY_SUPERADMIN)];
    const shouldResetSeededAccounts =
      legacyVersion < 4 || accessSeedRevision < ACCESS_SEED_REVISION;

    if (shouldResetSeededAccounts) {
      if (state.admins.length) {
        state.admins = [];
        changed = true;
      }

      if (JSON.stringify(state.superAdmins) !== JSON.stringify(expectedSuperAdmins)) {
        state.superAdmins = expectedSuperAdmins;
        changed = true;
      }

      const nextActivity = (state.activity || []).filter((entry) => !inferLegacySeedActor(entry));
      if (nextActivity.length !== (state.activity || []).length) {
        state.activity = nextActivity;
        changed = true;
      }
    }

    if (state.meta.accessSeedRevision !== ACCESS_SEED_REVISION) {
      state.meta.accessSeedRevision = ACCESS_SEED_REVISION;
      changed = true;
    }

    return changed;
  };

  const inferLegacySeedActor = (entry) => {
    const actor = String(entry && entry.actor ? entry.actor : "").toLowerCase();
    return actor === "admin" || actor === "halldesk" || actor === "superadmin";
  };

  const normalizeHall = (state, hall) => {
    let changed = false;

    if (!hall.faculty) {
      hall.faculty = FACULTY_BY_BUILDING[hall.building] || "General Faculty";
      changed = true;
    }

    if (!hall.location) {
      hall.location = `${hall.building || "Campus"} - Main Block`;
      changed = true;
    }

    if (hall.currentClass && !hall.usage) {
        hall.usage = {
          course: hall.currentClass.name || hall.currentClass.code || hall.note || "Unspecified Course",
          lecturer: hall.currentClass.professor || "Unassigned Lecturer",
          department: "General Department",
          faculty: hall.faculty,
          level: "General",
          coordinator: "system",
          coordinatorUsername: "system",
          coordinatorId: null,
          updatedAt: toDate(),
          startedAt: toDate(),
          expectedEndAt: addMinutes(toDate(), DEFAULT_SESSION_DURATION_MINUTES),
          lastConfirmedAt: toDate()
        };
        changed = true;
      }

    if (!hall.currentClass && hall.usage && hall.status === "occupied") {
      hall.currentClass = {
        code: hall.usage.course,
        name: hall.usage.course,
        professor: hall.usage.lecturer,
        time: "In progress"
      };
      changed = true;
    }

    if (!hall.usage) {
      hall.usage = null;
    } else {
      if (!hall.usage.coordinatorUsername) {
        const match = state.admins.find((admin) => {
          const fullName = `${admin.firstName} ${admin.lastName}`.trim().toLowerCase();
          const coord = String(hall.usage.coordinator || "").trim().toLowerCase();
          return admin.username.toLowerCase() === coord || fullName === coord;
        });

        hall.usage.coordinatorUsername = match ? match.username : "system";
        changed = true;
      }

      if (typeof hall.usage.coordinatorId === "undefined") {
        const match = state.admins.find(
          (admin) => admin.username.toLowerCase() === String(hall.usage.coordinatorUsername).toLowerCase()
        );
        hall.usage.coordinatorId = match ? match.id : null;
        changed = true;
      }

      if (!hall.usage.startedAt) {
        hall.usage.startedAt = hall.usage.updatedAt || toDate();
        changed = true;
      }

      if (!hall.usage.expectedEndAt) {
        hall.usage.expectedEndAt = addMinutes(hall.usage.startedAt, DEFAULT_SESSION_DURATION_MINUTES);
        changed = true;
      }

      if (!hall.usage.lastConfirmedAt) {
        hall.usage.lastConfirmedAt = hall.usage.updatedAt || hall.usage.startedAt;
        changed = true;
      }

      if (!hall.usage.durationHours) {
        const startMs = toMs(hall.usage.startedAt);
        const endMs = toMs(hall.usage.expectedEndAt);
        if (startMs && endMs && endMs > startMs) {
          const diffHours = Math.max(1, Math.min(4, Math.round((endMs - startMs) / 3600000)));
          hall.usage.durationHours = diffHours;
          changed = true;
        }
      }

      if (hall.usage.coordinatorUsername && hall.usage.coordinatorUsername !== "system") {
        const match = state.admins.find(
          (admin) => admin.username.toLowerCase() === String(hall.usage.coordinatorUsername).toLowerCase()
        );
        if (!match) {
          hall.usage.coordinator = "system";
          hall.usage.coordinatorUsername = "system";
          hall.usage.coordinatorId = null;
          changed = true;
        }
      }
    }

    return changed;
  };

  const normalizeState = (state) => {
    let changed = false;
    const previousVersion = Number(state.meta && state.meta.version ? state.meta.version : 0);

    if (!state.meta || typeof state.meta !== "object") {
      state.meta = { seededAt: toDate(), version: DB_VERSION, accessSeedRevision: ACCESS_SEED_REVISION };
      changed = true;
    }

    if (!state.meta.seededAt) {
      state.meta.seededAt = toDate();
      changed = true;
    }

    if (state.meta.version !== DB_VERSION) {
      state.meta.version = DB_VERSION;
      changed = true;
    }

    if (!Array.isArray(state.universities)) {
      state.universities = [];
      changed = true;
    }

    if (!Array.isArray(state.admins)) {
      state.admins = [];
      changed = true;
    }

    if (!Array.isArray(state.superAdmins)) {
      state.superAdmins = [];
      changed = true;
    }

    if (!Array.isArray(state.halls)) {
      state.halls = [];
      changed = true;
    }

    if (!Array.isArray(state.activity)) {
      state.activity = [];
      changed = true;
    }

    changed = migrateAccounts(state, previousVersion) || changed;

    state.admins.forEach((admin) => {
      changed = normalizeAdmin(admin) || changed;
    });

    state.halls.forEach((hall) => {
      changed = normalizeHall(state, hall) || changed;
    });

    return changed;
  };

  const ensureState = () => {
    const existing = readState();
    if (!existing) {
      const seeded = defaultState();
      writeState(seeded, { skipRemote: true });
      return seeded;
    }

    const changed = normalizeState(existing);
    if (changed) {
      writeState(existing);
    }
    return existing;
  };

  const hydrateFromRemote = async () => {
    const client = supabaseClient();
    if (!client) {
      return ensureState();
    }

    const { data, error } = await client
      .from(remoteTable())
      .select("payload")
      .eq("id", remoteRowId())
      .maybeSingle();

    if (error) {
      console.warn("HallMonitor Supabase read failed:", error.message || error);
      return ensureState();
    }

    if (data && data.payload && typeof data.payload === "object") {
      const remoteState = data.payload;
      const changed = normalizeState(remoteState);
      writeState(remoteState, { skipRemote: !changed });
      return remoteState;
    }

    const local = ensureState();
    await pushRemoteState(local);
    return local;
  };

  const refreshFromRemote = () => {
    if (!supabaseClient()) {
      return Promise.resolve(ensureState());
    }

    if (!remoteHydrationPromise) {
      remoteHydrationPromise = hydrateFromRemote().finally(() => {
        remoteHydrationPromise = null;
      });
    }

    return remoteHydrationPromise;
  };

  const startRemoteSync = () => {
    if (remoteHydrationStarted) {
      return;
    }

    remoteHydrationStarted = true;
    if (!supabaseClient()) {
      return;
    }

    void refreshFromRemote();
  };

  const getState = () => decorateState(clone(ensureState()));

  const withState = (mutator) => {
    const state = ensureState();
    const result = mutator(state);
    normalizeState(state);
    writeState(state);
    return result;
  };

  const pushActivity = (message, actor, metadata) => {
    const meta = metadata && typeof metadata === "object" ? metadata : {};
    withState((state) => {
      const nextId = state.activity.length
        ? Math.max(...state.activity.map((entry) => entry.id)) + 1
        : 1;
      state.activity.unshift({
        id: nextId,
        timestamp: toDate(),
        actor: actor || "system",
        actorRole: meta.actorRole || null,
        category: meta.category || null,
        uniId: Number.isFinite(meta.uniId) ? meta.uniId : null,
        adminId: Number.isFinite(meta.adminId) ? meta.adminId : null,
        superId: Number.isFinite(meta.superId) ? meta.superId : null,
        hallId: Number.isFinite(meta.hallId) ? meta.hallId : null,
        message
      });
      state.activity = state.activity.slice(0, 120);
    });
  };

  const getAdminSession = () => {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) {
      return null;
    }
    try {
      const session = JSON.parse(raw);
      const state = ensureState();
      const admin = state.admins.find(
        (item) => item.id === session.adminId && item.username === session.username && item.status === "active"
      );
      if (!admin) {
        clearAdminSession();
        return null;
      }
      return session;
    } catch (error) {
      return null;
    }
  };

  const setAdminSession = (session) => {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  };

  const clearAdminSession = () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  };

  const getSuperSession = () => {
    const raw = sessionStorage.getItem(SUPER_SESSION_KEY);
    if (!raw) {
      return null;
    }
    try {
      const session = JSON.parse(raw);
      const state = ensureState();
      const superAdmin = state.superAdmins.find(
        (item) => item.id === session.superId && item.username === session.username
      );
      if (!superAdmin) {
        clearSuperSession();
        return null;
      }
      return session;
    } catch (error) {
      return null;
    }
  };

  const setSuperSession = (session) => {
    sessionStorage.setItem(SUPER_SESSION_KEY, JSON.stringify(session));
  };

  const clearSuperSession = () => {
    sessionStorage.removeItem(SUPER_SESSION_KEY);
  };

  const loginAdmin = (username, password) => {
    const state = ensureState();
    const identity = String(username).trim().toLowerCase();
    const admin = state.admins.find(
      (item) =>
        (item.username.toLowerCase() === identity || String(item.email || "").toLowerCase() === identity) &&
        item.password === password
    );

    if (!admin) {
      return { ok: false, reason: "Invalid credentials" };
    }

    if (admin.status !== "active") {
      return { ok: false, reason: "Admin account is inactive" };
    }

    withState((live) => {
      const match = live.admins.find((item) => item.id === admin.id);
      if (match) {
        match.lastLogin = toDate();
      }
    });

    const session = {
      adminId: admin.id,
      username: admin.username,
      uniId: admin.uniId,
      role: admin.role,
      faculty: admin.faculty,
      department: admin.department,
      level: admin.level,
      name: `${admin.firstName} ${admin.lastName}`,
      loggedInAt: toDate()
    };
    setAdminSession(session);
    pushActivity(`Admin ${admin.username} signed in`, admin.username, {
      actorRole: "admin",
      category: "auth",
      uniId: admin.uniId,
      adminId: admin.id
    });

    return { ok: true, session, admin: clone(admin) };
  };

  const loginSuperAdmin = (username, password) => {
    const state = ensureState();
    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedPassword = String(password);
    let superAdmin = state.superAdmins.find(
      (item) =>
        item.username.toLowerCase() === normalizedUsername &&
        item.password === normalizedPassword
    );

    if (
      !superAdmin &&
      normalizedUsername === PRIMARY_SUPERADMIN.username.toLowerCase() &&
      normalizedPassword === PRIMARY_SUPERADMIN.password
    ) {
      withState((live) => {
        live.superAdmins = [clone(PRIMARY_SUPERADMIN)];
      });
      superAdmin = clone(PRIMARY_SUPERADMIN);
    }

    if (!superAdmin) {
      return { ok: false, reason: "Invalid credentials" };
    }

    const session = {
      superId: superAdmin.id,
      username: superAdmin.username,
      displayName: superAdmin.displayName,
      loggedInAt: toDate()
    };

    setSuperSession(session);
    pushActivity(`Super admin ${superAdmin.username} signed in`, superAdmin.username, {
      actorRole: "superadmin",
      category: "auth",
      superId: superAdmin.id
    });

    return { ok: true, session, superAdmin: clone(superAdmin) };
  };

  const logoutAdmin = () => {
    const session = getAdminSession();
    if (session) {
      pushActivity(`Admin ${session.username} signed out`, session.username, {
        actorRole: "admin",
        category: "auth",
        uniId: session.uniId,
        adminId: session.adminId
      });
    }
    clearAdminSession();
  };

  const logoutSuperAdmin = () => {
    const session = getSuperSession();
    if (session) {
      pushActivity(`Super admin ${session.username} signed out`, session.username, {
        actorRole: "superadmin",
        category: "auth",
        superId: session.superId
      });
    }
    clearSuperSession();
  };

  window.HallMonitorStore = {
    ensureState,
    getState,
    withState,
    pushActivity,
    toShortDate,
    loginAdmin,
    loginSuperAdmin,
    getAdminSession,
    getSuperSession,
    logoutAdmin,
    logoutSuperAdmin,
    clearAdminSession,
    clearSuperSession,
    startRemoteSync,
    refreshFromRemote,
    deriveHallUsageState,
    addMinutes
  };

  startRemoteSync();
})();
