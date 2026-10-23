/**
 * FORGE Field: the offline-first app for crews (opened at /field).
 *
 * Startup: Firebase keeps the sign-in on the device, and the last access
 * snapshot is kept in IndexedDB, so the app opens straight away with no
 * signal. When online, access is reloaded in the background and the snapshot
 * refreshed.
 */
import { useEffect, useMemo, useState } from "react";
import { Flame, Loader2, LogIn, ShieldAlert, WifiOff } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { useTwoFactorStatus } from "../hooks/useTwoFactorStatus.js";
import { isPlatformScope } from "../lib/tenantPaths.js";
import { buildAccessSnapshot, loadAccessSnapshot, saveAccessSnapshot } from "./fieldSession.js";
import { requestPersistentStorage } from "./fieldDb.js";
import { rmsPathFromFieldPath } from "./fieldPaths.js";
import { readThemePref, applyFieldTheme } from "./fieldTheme.js";
import { registerFieldServiceWorker } from "./registerFieldSW.js";
import "./fieldInstall.js";
import FieldShell from "./FieldShell.jsx";
import "./field.css";

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function Splash({ message = "Opening FORGE Field…" }) {
  return (
    <div className="fa-splash">
      <div className="fa-splash-mark"><Flame size={40} /></div>
      <strong>FORGE Field</strong>
      <span><Loader2 size={18} className="fa-spin" /> {message}</span>
    </div>
  );
}

function Gate({ icon, title, children, actions }) {
  return (
    <div className="fa-gate">
      <div className="fa-gate-card">
        <div className="fa-gate-icon">{icon}</div>
        <h1>{title}</h1>
        <div className="fa-gate-body">{children}</div>
        {actions ? <div className="fa-gate-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

function SignIn() {
  const { signIn, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err?.message?.includes("auth/") ? "Email or password is wrong." : err?.message || "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Gate
      icon={<Flame size={34} />}
      title="Sign in to FORGE Field"
      actions={<a className="fa-btn fa-btn-ghost fa-btn-block" href={rmsPathFromFieldPath()}>Use the full RMS sign-in</a>}
    >
      <p>Sign in once with signal. After that the app opens and saves records even with no connection.</p>
      <form className="fa-signin" onSubmit={handleSubmit}>
        <label className="fa-field">
          <span className="fa-label">Email</span>
          <input className="fa-input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="fa-field">
          <span className="fa-label">Password</span>
          <input className="fa-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error || authError ? <div className="fa-error-text" role="alert">{error || authError}</div> : null}
        <button type="submit" className="fa-btn fa-btn-primary fa-btn-block" disabled={busy}>
          {busy ? <Loader2 size={20} className="fa-spin" /> : <LogIn size={20} />} Sign in
        </button>
      </form>
    </Gate>
  );
}

export default function FieldApp() {
  const auth = useAuth();
  const tenant = useTenant();
  const twoFactor = useTwoFactorStatus();
  const online = useOnline();
  const { user, authLoading, membershipLoading, membership, permissions, isCreator } = auth;
  const { departmentId, profile, settings, ready, isModuleEnabled } = tenant;
  const [cached, setCached] = useState({ uid: "", snapshot: null, loaded: false });
  const [fresh, setFresh] = useState(null);

  useEffect(() => {
    applyFieldTheme(readThemePref());
    document.title = "FORGE Field";
    requestPersistentStorage();
    // Store the app on the device on the very first visit (even before sign-in).
    registerFieldServiceWorker();
  }, []);

  // Last saved access for this person (lets the app open offline).
  useEffect(() => {
    if (!user?.uid) {
      setCached({ uid: "", snapshot: null, loaded: !authLoading });
      return;
    }
    let active = true;
    loadAccessSnapshot(user.uid)
      .then((snapshot) => active && setCached({ uid: user.uid, snapshot, loaded: true }))
      .catch(() => active && setCached({ uid: user.uid, snapshot: null, loaded: true }));
    return () => {
      active = false;
    };
  }, [user?.uid, authLoading]);

  const accessReady = Boolean(user && !membershipLoading && ready && departmentId && !isPlatformScope(departmentId));
  const twoFactorBlocked = twoFactor.level === "required" && twoFactor.sessionOk === false;

  // Fresh access loaded online: save it for offline starts.
  useEffect(() => {
    if (!accessReady || twoFactorBlocked) return;
    if (twoFactor.level === "required" && twoFactor.sessionOk === null) return;
    if (!membership && !isCreator) return;
    const snapshot = buildAccessSnapshot({ user, membership, permissions, isCreator, departmentId, profile, settings, isModuleEnabled });
    setFresh(snapshot);
    saveAccessSnapshot(snapshot).catch(() => null);
  }, [accessReady, twoFactorBlocked, twoFactor.sessionOk, membership, permissions, isCreator, departmentId, profile, settings]);

  const snapshot = useMemo(() => {
    if (fresh && fresh.uid === user?.uid) return fresh;
    const saved = cached.uid === user?.uid ? cached.snapshot : null;
    if (!saved) return null;
    // Saved access belongs to one department; don't show it for another.
    if (departmentId && !isPlatformScope(departmentId) && saved.departmentId !== departmentId) return null;
    return saved;
  }, [fresh, cached, user?.uid, departmentId]);

  if (authLoading) return <Splash />;
  if (!user) {
    if (!online) {
      return (
        <Gate icon={<WifiOff size={34} />} title="No connection">
          <p>Sign in once while you have signal. After that FORGE Field works offline.</p>
        </Gate>
      );
    }
    return <SignIn />;
  }

  if (twoFactorBlocked && online) {
    return (
      <Gate
        icon={<ShieldAlert size={34} />}
        title="Finish two-factor sign-in"
        actions={<a className="fa-btn fa-btn-primary fa-btn-block" href={rmsPathFromFieldPath()}>Open the RMS sign-in</a>}
      >
        <p>Your account needs two-factor login. Complete it in the RMS, then come back to FORGE Field.</p>
      </Gate>
    );
  }

  if (snapshot) {
    return <FieldShell snapshot={snapshot} online={online} accessLive={Boolean(fresh)} />;
  }

  if (!cached.loaded) return <Splash />;

  if (!online) {
    return (
      <Gate icon={<WifiOff size={34} />} title="Connect once to finish setup">
        <p>FORGE Field needs one connected start on this device to download your department's apparatus, hydrants and checklists. Then it works offline.</p>
      </Gate>
    );
  }

  if (accessReady && !membership && !isCreator) {
    return (
      <Gate
        icon={<ShieldAlert size={34} />}
        title="No access to this department"
        actions={<a className="fa-btn fa-btn-ghost fa-btn-block" href={rmsPathFromFieldPath()}>Open the RMS</a>}
      >
        <p>Your account isn't an active member of this department. Ask your department administrator for access.</p>
      </Gate>
    );
  }

  if (ready && (!departmentId || isPlatformScope(departmentId))) {
    return (
      <Gate
        icon={<ShieldAlert size={34} />}
        title="Pick your department first"
        actions={<a className="fa-btn fa-btn-primary fa-btn-block" href={rmsPathFromFieldPath()}>Open the RMS</a>}
      >
        <p>Open your department's RMS address once, then come back to /field.</p>
      </Gate>
    );
  }

  return <Splash message="Loading your department…" />;
}
