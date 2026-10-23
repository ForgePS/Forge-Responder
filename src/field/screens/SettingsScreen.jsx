import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, ExternalLink, LogOut, MonitorSmartphone, RefreshCw, Share, Smartphone } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { storageEstimate } from "../fieldDb.js";
import { isOfflineReady } from "../registerFieldSW.js";
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from "../fieldInstall.js";
import { readThemePref, saveThemePref } from "../fieldTheme.js";
import { rmsPathFromFieldPath } from "../fieldPaths.js";
import { Banner, Confirm, Screen, Section, Segmented, formatWhen } from "../ui.jsx";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SettingsScreen() {
  const { snapshot, refData, refresh, refLoading, refError, online, counts } = useField();
  const { signOut } = useAuth();
  const [theme, setTheme] = useState(readThemePref);
  const [offlineReady, setOfflineReady] = useState(null);
  const [storage, setStorage] = useState(null);
  const [installable, setInstallable] = useState(canPromptInstall);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    isOfflineReady().then(setOfflineReady).catch(() => setOfflineReady(false));
    storageEstimate().then(setStorage);
    return subscribeInstall(setInstallable);
  }, []);

  const unsent = counts.queued + counts.syncing + counts.attention + counts.draft;
  const parts = [
    ["Apparatus", refItems(refData, "assets").length],
    ["Checklists", refItems(refData, "templates").length],
    ["Hydrants", refItems(refData, "hydrants").length],
    ["Personnel", refItems(refData, "personnel").length],
    ["Recent daily logs", refItems(refData, "dailyLogs").length],
    ["Draft incident reports", refItems(refData, "incidents").length],
  ];

  return (
    <Screen title="This device">
      <Section title="Offline">
        <div className="fa-kv">
          <div>
            <span>App available offline</span>
            <strong className={offlineReady ? "tone-text-ok" : ""}>
              {offlineReady === null ? "Checking…" : offlineReady ? <><CheckCircle2 size={18} /> Ready</> : <><CircleDashed size={18} /> Not yet — open once with signal</>}
            </strong>
          </div>
          <div><span>Field data</span><strong>{refData.fetchedAt ? formatWhen(refData.fetchedAt) : "Not downloaded"}</strong></div>
          {parts.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count.toLocaleString()}</strong></div>)}
          {storage?.usage ? <div><span>Storage used</span><strong>{formatBytes(storage.usage)}</strong></div> : null}
        </div>
        {refError ? <p className="fa-error-text">{refError}</p> : null}
        <button type="button" className="fa-btn fa-btn-secondary fa-btn-block" onClick={() => refresh()} disabled={refLoading || !online}>
          <RefreshCw size={20} className={refLoading ? "fa-spin" : ""} /> {online ? (refLoading ? "Updating…" : "Update field data now") : "Connect to update"}
        </button>
      </Section>

      {!isStandalone() ? (
        <Section title="Install on this phone">
          {installable ? (
            <button type="button" className="fa-btn fa-btn-primary fa-btn-block" onClick={() => promptInstall()}>
              <Smartphone size={20} /> Add FORGE Field to home screen
            </button>
          ) : isIos() ? (
            <Banner tone="info" icon={<Share size={22} />} title="Add to Home Screen">
              In Safari, tap the Share button, then “Add to Home Screen”. FORGE Field then opens like an app, even offline.
            </Banner>
          ) : (
            <Banner tone="info" icon={<MonitorSmartphone size={22} />}>
              Use your browser menu → “Install app” or “Add to Home screen”.
            </Banner>
          )}
        </Section>
      ) : null}

      <Section title="Display">
        <Segmented
          value={theme}
          options={[{ value: "auto", label: "Auto" }, { value: "light", label: "Sunlight" }, { value: "dark", label: "Dark" }]}
          onChange={(value) => {
            setTheme(value);
            saveThemePref(value);
          }}
          columns={3}
        />
        <p className="fa-hint">Sunlight uses maximum contrast for outdoor use. Auto follows your phone.</p>
      </Section>

      <Section title="Account">
        <div className="fa-kv">
          <div><span>Signed in as</span><strong>{snapshot.displayName}</strong></div>
          <div><span>Email</span><strong>{snapshot.email}</strong></div>
          <div><span>Department</span><strong>{snapshot.departmentName}</strong></div>
          <div><span>Access checked</span><strong>{formatWhen(snapshot.savedAt)}</strong></div>
        </div>
        <a className="fa-btn fa-btn-ghost fa-btn-block" href={rmsPathFromFieldPath()}><ExternalLink size={20} /> Open the full RMS</a>
        <button type="button" className="fa-btn fa-btn-danger-ghost fa-btn-block" onClick={() => setConfirmSignOut(true)}><LogOut size={20} /> Sign out</button>
      </Section>

      <Confirm
        open={confirmSignOut}
        title="Sign out?"
        body={unsent
          ? `${unsent} record${unsent === 1 ? " hasn't" : "s haven't"} been sent yet. They stay on this device and send after you sign in again with this account.`
          : "You'll need a connection to sign back in."}
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={async () => {
          setConfirmSignOut(false);
          await signOut();
        }}
      />
    </Screen>
  );
}
