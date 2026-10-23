/** Shared state for field screens, and the form hook that saves as you type. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getRecord, newLocalId, removeAttachment, saveFieldRecord, storeAttachment } from "./fieldRecords.js";
import { rememberRecent } from "./fieldRefData.js";
import { syncNow } from "./fieldSync.js";
import { compressPhoto } from "./fieldPhotos.js";
import { focusFirstError } from "./ui.jsx";

export const FieldContext = createContext(null);

export function useField() {
  const value = useContext(FieldContext);
  if (!value) throw new Error("useField must be used inside the field app");
  return value;
}

/**
 * Form state for one field record.
 *  - New records and unfinished drafts are saved on the device as you type,
 *    so closing the app or losing power never loses an entry.
 *  - Editing a record that was already saved only changes it when Save is tapped.
 */
export function useRecordForm({ kind, localId: initialLocalId, initialData, describe, base = null, validate }) {
  const { snapshot, toast, back, setRecent } = useField();
  const [localId] = useState(() => initialLocalId || newLocalId(kind.slice(0, 2)));
  const [data, setData] = useState(initialData);
  const [attachments, setAttachments] = useState([]);
  const [errors, setErrors] = useState({});
  const [loaded, setLoaded] = useState(!initialLocalId);
  const [saving, setSaving] = useState(false);
  const [existingStatus, setExistingStatus] = useState("");
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const baseRef = useRef(base);
  const latest = useRef({ data, attachments });
  latest.current = { data, attachments };

  useEffect(() => {
    if (!initialLocalId) return;
    let active = true;
    getRecord(initialLocalId).then((record) => {
      if (!active) return;
      if (record) {
        setData({ ...initialData, ...record.data });
        setAttachments(record.attachments || []);
        setExistingStatus(record.status);
        baseRef.current = record.base ?? base;
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [initialLocalId]);

  const autosaves = !existingStatus || existingStatus === "draft";

  const persist = useCallback(async (finish) => {
    const { data: current, attachments: currentAttachments } = latest.current;
    const { title, subtitle } = describe(current);
    return saveFieldRecord({
      localId,
      departmentId: snapshot.departmentId,
      uid: snapshot.uid,
      kind,
      title,
      subtitle,
      data: current,
      base: baseRef.current,
      finish,
      attachments: currentAttachments,
    });
  }, [localId, kind, snapshot.departmentId, snapshot.uid, describe]);

  useEffect(() => {
    if (!loaded || !dirtyRef.current || !autosaves) return undefined;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      persist(false).then(() => setExistingStatus("draft")).catch(() => null);
    }, 700);
    return () => window.clearTimeout(timerRef.current);
  }, [data, attachments, loaded, autosaves, persist]);

  const update = useCallback((patch) => {
    dirtyRef.current = true;
    setData((current) => ({ ...current, ...(typeof patch === "function" ? patch(current) : patch) }));
    setErrors((current) => {
      if (!Object.keys(current).length) return current;
      const keys = Object.keys(typeof patch === "function" ? {} : patch);
      const next = { ...current };
      keys.forEach((key) => {
        Object.keys(next).filter((errorKey) => errorKey === key || errorKey.startsWith(`${key}:`)).forEach((errorKey) => delete next[errorKey]);
      });
      return next;
    });
  }, []);

  /** Clear the error shown for one item (and its note) once it's answered. */
  const clearError = useCallback((key) => {
    setErrors((current) => {
      if (!current[key] && !current[`${key}:note`]) return current;
      const next = { ...current };
      delete next[key];
      delete next[`${key}:note`];
      return next;
    });
  }, []);

  const addPhoto = useCallback(async (file) => {
    try {
      const blob = await compressPhoto(file);
      const attachment = await storeAttachment(blob, file.name || "photo.jpg");
      dirtyRef.current = true;
      setAttachments((current) => [...current, attachment]);
    } catch (error) {
      toast(error?.message || "That photo couldn't be saved on this device.", "warn");
    }
  }, [toast]);

  const removePhoto = useCallback(async (id) => {
    dirtyRef.current = true;
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
    await removeAttachment(id);
  }, []);

  /** Validate, save, queue for sync and go back. */
  const submit = useCallback(async ({ recent = {}, message, finalize } = {}) => {
    if (finalize) {
      latest.current = { ...latest.current, data: finalize(latest.current.data) };
      setData(latest.current.data);
    }
    const problems = validate ? validate(latest.current.data) : {};
    setErrors(problems);
    if (Object.keys(problems).length) {
      focusFirstError();
      if (navigator.vibrate) navigator.vibrate(60);
      return false;
    }
    window.clearTimeout(timerRef.current);
    setSaving(true);
    try {
      await persist(true);
      if (Object.keys(recent).length) {
        const next = await rememberRecent(snapshot.departmentId, recent);
        setRecent(next);
      }
      toast(message || (navigator.onLine ? "Saved — sending now" : "Saved on this device — it will send when you're back online"), "ok");
      if (navigator.vibrate) navigator.vibrate(25);
      syncNow();
      back();
      return true;
    } catch (error) {
      toast(error?.message || "Couldn't save on this device.", "warn");
      return false;
    } finally {
      setSaving(false);
    }
  }, [validate, persist, snapshot.departmentId, toast, back, setRecent]);

  return { localId, data, update, setData, attachments, addPhoto, removePhoto, errors, setErrors, clearError, submit, saving, loaded, existingStatus };
}
