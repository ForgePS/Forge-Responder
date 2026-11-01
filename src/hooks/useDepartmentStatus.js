import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { getFirestoreDb } from "../lib/firebaseClient.js";
import { departmentInactiveReason, INACTIVE_DEPARTMENT_TEXT } from "../lib/departmentStatus.js";

export { INACTIVE_DEPARTMENT_TEXT };

/**
 * Whether a department is suspended or archived, read from the public registry
 * (platformDepartments). The rules refuse everything else for such departments,
 * so this is the only way to tell people why.
 * @returns {{ reason: string, name: string, checked: boolean }}
 */
export function useDepartmentStatus(departmentId) {
  const [state, setState] = useState({ reason: "", name: "", checked: false, id: "" });
  useEffect(() => {
    let cancelled = false;
    const db = getFirestoreDb();
    if (!departmentId || !db) {
      setState({ reason: "", name: "", checked: true, id: departmentId || "" });
      return undefined;
    }
    getDoc(doc(db, "platformDepartments", departmentId))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.exists() ? snap.data() : {};
        setState({ reason: departmentInactiveReason(data), name: data.shortName || data.name || "", checked: true, id: departmentId });
      })
      .catch(() => { if (!cancelled) setState({ reason: "", name: "", checked: true, id: departmentId }); });
    return () => { cancelled = true; };
  }, [departmentId]);
  return state.id === (departmentId || "") ? state : { reason: "", name: "", checked: false };
}
