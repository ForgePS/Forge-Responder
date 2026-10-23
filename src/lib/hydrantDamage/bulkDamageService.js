import { writeHydrantDamageAudit } from "./audit.js";
import {
  createHydrantDamageReport,
  markDamageReportReadyToSend,
  updateHydrantDamageReport,
} from "./damageReportService.js";
import { sendHydrantDamageReport } from "./emailSendService.js";
import { resolveOwnershipForHydrant } from "./waterDistrictService.js";

/**
 * Preview how selected hydrants group by water company / district before bulk create.
 * @param {string} departmentId
 * @param {object[]} hydrants
 */
export async function previewBulkDamageGrouping(departmentId, hydrants = []) {
  const groups = new Map();
  const rows = [];
  for (const hydrant of hydrants) {
    const resolution = await resolveOwnershipForHydrant(departmentId, hydrant);
    const companyKey = resolution.company?.id || "__unknown__";
    const districtKey = resolution.district?.id || "__none__";
    const key = `${companyKey}::${districtKey}`;
    const hydrantId = hydrant.location_id || hydrant.hydrant_id || hydrant.id || "";
    const row = {
      hydrantId,
      address: hydrant.address || hydrant.full_address || "",
      waterCompanyId: resolution.company?.id || "",
      waterCompanyName: resolution.company?.legalName || hydrant.provider || hydrant.water_assoc || "Ownership review",
      waterDistrictId: resolution.district?.id || "",
      waterDistrictName: resolution.district?.name || "",
      assignmentSource: resolution.source,
      requiresConfirmation: Boolean(resolution.requiresConfirmation || !resolution.company),
      candidates: resolution.candidates || [],
    };
    rows.push(row);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        waterCompanyId: row.waterCompanyId,
        waterCompanyName: row.waterCompanyName,
        waterDistrictId: row.waterDistrictId,
        waterDistrictName: row.waterDistrictName,
        count: 0,
        ownershipReviewCount: 0,
        hydrantIds: [],
      });
    }
    const group = groups.get(key);
    group.count += 1;
    group.hydrantIds.push(hydrantId);
    if (row.requiresConfirmation) group.ownershipReviewCount += 1;
  }
  return {
    total: rows.length,
    ownershipReviewCount: rows.filter((row) => row.requiresConfirmation).length,
    groups: [...groups.values()].sort((a, b) => b.count - a.count || a.waterCompanyName.localeCompare(b.waterCompanyName)),
    rows,
  };
}

/**
 * Create one damage report per hydrant with shared cause/details.
 * Partial success: returns per-record results.
 *
 * @param {string} departmentId
 * @param {{
 *   hydrants: object[],
 *   description?: string,
 *   severity?: string,
 *   operationalStatus?: string,
 *   damageCategoryIds?: string[],
 *   suspectedCause?: string,
 *   immediateActions?: string,
 *   leaking?: boolean,
 *   roadwayHazard?: boolean,
 *   publicSafetyHazard?: boolean,
 *   markReadyToSend?: boolean,
 * }} input
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function createBulkHydrantDamageReports(departmentId, input = {}, actor = {}) {
  const hydrants = Array.isArray(input.hydrants) ? input.hydrants : [];
  if (!hydrants.length) throw new Error("Select at least one hydrant.");
  if (!String(input.description || "").trim()) {
    throw new Error("A shared damage description is required for bulk create.");
  }

  const results = [];
  for (const hydrant of hydrants) {
    const hydrantId = hydrant.location_id || hydrant.hydrant_id || hydrant.id || "";
    try {
      let report = await createHydrantDamageReport(departmentId, {
        hydrant,
        sourceType: "bulk",
        description: input.description,
        severity: input.severity || "moderate",
        operationalStatus: input.operationalStatus,
        damageCategoryIds: input.damageCategoryIds || [],
      }, actor);

      const patch = {
        suspectedCause: input.suspectedCause || "",
        immediateActions: input.immediateActions || "",
        leaking: Boolean(input.leaking),
        roadwayHazard: Boolean(input.roadwayHazard),
        publicSafetyHazard: Boolean(input.publicSafetyHazard),
        wizardStep: 6,
        _reason: "bulk_create",
      };
      report = await updateHydrantDamageReport(departmentId, report.id, patch, actor);

      if (input.markReadyToSend && report.status !== "ownership_review_required") {
        try {
          report = await markDamageReportReadyToSend(departmentId, report.id, actor);
        } catch (readyError) {
          results.push({
            ok: true,
            hydrantId,
            reportId: report.id,
            reportNumber: report.reportNumber,
            status: report.status,
            readyToSend: false,
            warning: readyError?.message || "Created but not marked ready to send.",
          });
          continue;
        }
      }

      results.push({
        ok: true,
        hydrantId,
        reportId: report.id,
        reportNumber: report.reportNumber,
        status: report.status,
        readyToSend: report.status === "ready_to_send",
        waterCompanyName: report.waterCompanyName,
      });
    } catch (error) {
      results.push({
        ok: false,
        hydrantId,
        error: error?.message || "Unable to create report.",
      });
    }
  }

  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.bulk_created",
    entityType: "hydrantDamageReport",
    entityId: "bulk",
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: {
      attempted: hydrants.length,
      succeeded: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
    },
  });

  return {
    attempted: hydrants.length,
    succeeded: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}

/**
 * Send each ready report independently. Partial success + retry failed only.
 * Never marks Sent unless provider accepts.
 *
 * @param {string} departmentId
 * @param {string[]} reportIds
 * @param {{ actorUid?: string, actorName?: string, departmentName?: string }} [options]
 */
export async function sendBulkHydrantDamageReports(departmentId, reportIds = [], options = {}) {
  const ids = [...new Set((reportIds || []).filter(Boolean))];
  if (!ids.length) throw new Error("No report IDs provided for bulk send.");

  const results = [];
  for (const reportId of ids) {
    try {
      const report = await sendHydrantDamageReport(departmentId, reportId, options);
      results.push({
        ok: true,
        reportId,
        reportNumber: report.reportNumber,
        emailStatus: report.emailStatus,
        providerMessageId: report.providerMessageId || "",
      });
    } catch (error) {
      results.push({
        ok: false,
        reportId,
        error: error?.message || "Send failed.",
      });
    }
  }

  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.bulk_send",
    entityType: "hydrantDamageReport",
    entityId: "bulk",
    actorUid: options.actorUid,
    actorName: options.actorName,
    after: {
      attempted: ids.length,
      succeeded: results.filter((row) => row.ok).length,
      failed: results.filter((row) => !row.ok).length,
    },
  });

  return {
    attempted: ids.length,
    succeeded: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}
