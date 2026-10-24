import { useCallback, useEffect, useState } from "react";
import { useTenant } from "../../context/TenantContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { hasPermission } from "../../lib/permissions.js";
import {
  academyFindStudent,
  academyGetCertificates,
  academyGetCompletions,
  academyGetEnrollments,
  academyGetTranscript,
  academySyncPerson,
  listAcademyConnections,
  listAcademyLinks,
  linkAcademyPerson,
  maskFemaSid,
  unlinkAcademyPerson,
} from "../../lib/academyIntegrations.js";
import "../../theme/academy-integrations.css";

/**
 * Personnel Academy tab — multi-academy shells grouped by connection.
 */
export default function PersonnelAcademyPanel({ person = null }) {
  const { departmentId } = useTenant();
  const { isCreator, permissions } = useAuth();
  const personId = String(person?.forgePersonId || "").trim();
  const canSearch = isCreator || hasPermission(permissions, "academyPersonSearch");
  const canLink = isCreator || hasPermission(permissions, "academyPersonLink");
  const canUnlink = isCreator || hasPermission(permissions, "academyPersonUnlink");
  const canSync = isCreator || hasPermission(permissions, "academySyncRun");

  const [connections, setConnections] = useState([]);
  const [links, setLinks] = useState([]);
  const [cache, setCache] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [details, setDetails] = useState({});

  const refresh = useCallback(async () => {
    if (!departmentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const connResult = await listAcademyConnections(departmentId);
      const active = (connResult.connections || []).filter(
        (c) => c.enabled && c.status !== "disconnected"
      );
      setConnections(active);

      if (personId) {
        const linkResult = await listAcademyLinks(departmentId, personId);
        setLinks(linkResult.links || []);
        setCache(linkResult.cache || []);
      } else {
        setLinks([]);
        setCache([]);
      }
    } catch (err) {
      setError(err.message || "Could not load academy data.");
    } finally {
      setLoading(false);
    }
  }, [departmentId, personId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSearchAndLink(connection) {
    if (!canLink || !person) return;
    setBusy(`link-${connection.connectionId}`);
    setError("");
    setNotice("");
    try {
      let match = null;
      if (canSearch) {
        const found = await academyFindStudent(departmentId, connection.connectionId, {
          femaSid: person.femaId || person.femaSid,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          dateOfBirth: person.dateOfBirth || person.birthDate,
          sourceRecordId: person.id,
        });
        match = found?.result || found;
      }

      const resolvedPersonId = personId || match?.personId;
      if (!resolvedPersonId) {
        setNotice("No forgePersonId yet. Save the personnel record to resolve identity, then link.");
        return;
      }

      if (match?.matchStatus === "manual_review_required") {
        setNotice("Possible match requires review before linking.");
        return;
      }

      await linkAcademyPerson(departmentId, {
        personId: resolvedPersonId,
        connectionId: connection.connectionId,
        academyOrganizationId: connection.academyOrganizationId,
        providerType: connection.providerType,
        externalStudentId: match?.externalStudentId || "",
        femaSid: person.femaId || person.femaSid || "",
        matchedBy: match?.matchedBy || "manual",
        verificationStatus: match?.matchStatus === "matched" ? "verified" : "unverified",
        source: match?.matchStatus === "matched" ? "search" : "manual",
      });
      setNotice("Academy link created.");
      await refresh();
    } catch (err) {
      setError(err.message || "Link failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleUnlink(link) {
    if (!canUnlink || !personId) return;
    setBusy(`unlink-${link.linkId}`);
    try {
      await unlinkAcademyPerson(departmentId, personId, link.linkId);
      setNotice("Academy link removed.");
      await refresh();
    } catch (err) {
      setError(err.message || "Unlink failed.");
    } finally {
      setBusy("");
    }
  }

  async function loadAcademyDetails(connection, link) {
    if (!personId) return;
    setBusy(`details-${connection.connectionId}`);
    try {
      const [enrollments, completions, certificates, transcript] = await Promise.all([
        academyGetEnrollments(departmentId, connection.connectionId, personId),
        academyGetCompletions(departmentId, connection.connectionId, personId),
        academyGetCertificates(departmentId, connection.connectionId, personId),
        academyGetTranscript(departmentId, connection.connectionId, personId),
      ]);
      setDetails((prev) => ({
        ...prev,
        [connection.connectionId]: {
          enrollments: enrollments?.result || enrollments || [],
          completions: completions?.result || completions || [],
          certificates: certificates?.result || certificates || [],
          transcript: transcript?.result || transcript || null,
          link,
        },
      }));
    } catch (err) {
      setError(err.message || "Could not load academy details.");
    } finally {
      setBusy("");
    }
  }

  async function handleSync(connection) {
    if (!canSync || !personId) return;
    setBusy(`sync-${connection.connectionId}`);
    try {
      await academySyncPerson(departmentId, connection.connectionId, { personId });
      setNotice("Sync requested.");
      await loadAcademyDetails(connection, links.find((l) => l.connectionId === connection.connectionId));
    } catch (err) {
      setError(err.message || "Sync failed.");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <p className="muted">Loading academy integration…</p>;
  }

  if (connections.length === 0) {
    return (
      <div className="personnel-section-card">
        <p>No academy integration is configured for this department.</p>
        <p className="muted">
          Department training records, certificates, and qualifications remain available without an academy connection.
        </p>
      </div>
    );
  }

  return (
    <div className="personnel-academy-panel">
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}
      {!personId ? (
        <p className="muted">
          Permanent <code>forgePersonId</code> is not set yet. Save the personnel profile to resolve identity through the Hub, then link academy records.
        </p>
      ) : (
        <p className="muted small">Person ID: {personId}</p>
      )}

      {connections.map((connection) => {
        const link = links.find((l) => l.connectionId === connection.connectionId && l.status === "linked");
        const cacheRow = cache.find((c) => c.connectionId === connection.connectionId);
        const detail = details[connection.connectionId];

        return (
          <section key={connection.connectionId} className="personnel-section-card academy-person-block">
            <header className="personnel-form-card-header">
              <strong>{connection.displayName || "Training Academy"}</strong>
              <span className="badge">{connection.isPrimary ? "Primary" : "Secondary"}</span>
              <span className="badge badge-muted">{connection.status}</span>
            </header>

            {!link ? (
              <div>
                <p>Academy connection available.</p>
                <p className="muted">Search for an existing student record or create a manual academy link.</p>
                {canLink ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={Boolean(busy)}
                    onClick={() => handleSearchAndLink(connection)}
                  >
                    {busy === `link-${connection.connectionId}` ? "Linking…" : "Search / create link"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div>
                <p>
                  Student number: {link.externalStudentId || "—"}
                  {" · "}
                  FEMA: {maskFemaSid(link.femaSid) || "—"}
                  {" · "}
                  Verification: {link.verificationStatus}
                  {" · "}
                  Link: {link.status}
                </p>
                <p className="muted small">
                  Last sync: {link.lastSyncedAt || cacheRow?.lastSyncedAt || "—"}
                  {cacheRow ? ` · Cache: ${cacheRow.completedCourses || 0} courses, ${cacheRow.certificateCount || 0} certificates` : ""}
                </p>
                <div className="academy-connection-card__actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={Boolean(busy)}
                    onClick={() => loadAcademyDetails(connection, link)}
                  >
                    Load academy records
                  </button>
                  {canSync ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(busy)}
                      onClick={() => handleSync(connection)}
                    >
                      Manual Sync Now
                    </button>
                  ) : null}
                  {canUnlink ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(busy)}
                      onClick={() => handleUnlink(link)}
                    >
                      Unlink academy record
                    </button>
                  ) : null}
                </div>

                {detail ? (
                  <div className="academy-person-details">
                    <h5>Current enrollments</h5>
                    <pre className="academy-json-preview">{JSON.stringify(detail.enrollments, null, 2)}</pre>
                    <h5>Completed courses</h5>
                    <pre className="academy-json-preview">{JSON.stringify(detail.completions, null, 2)}</pre>
                    <h5>Certificates</h5>
                    <pre className="academy-json-preview">{JSON.stringify(detail.certificates, null, 2)}</pre>
                    <h5>Transcript</h5>
                    <pre className="academy-json-preview">{JSON.stringify(detail.transcript, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
