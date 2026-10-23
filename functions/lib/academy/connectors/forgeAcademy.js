const { AcademyConnector } = require("./base");
const { loadHubSettings, resolvePersonIdentityViaHub } = require("../../forgeHubIdentity");
const { upsertEnrollmentsForPerson } = require("../academyTrainingSync");
const { upsertAcademyCache } = require("../academyPeopleStore");

/**
 * Native Forge Academy connector.
 * Uses Hub settings from connection secrets / legacy department settings.
 * Does not hard-code any Academy Firebase project ID.
 */
class ForgeAcademyConnector extends AcademyConnector {
  async resolveHubSettings() {
    const fromSecrets = {
      hubEnabled: true,
      hubBaseUrl: String(this.secrets.hubBaseUrl || this.connection?.config?.hubBaseUrl || "").replace(/\/$/, ""),
      hubBearerToken: String(this.secrets.hubBearerToken || ""),
      hubSecret: String(this.secrets.hubSecret || ""),
      forgeDepartmentId: String(this.secrets.forgeDepartmentId || this.connection?.config?.forgeDepartmentId || ""),
      apiBaseUrl: String(this.secrets.apiBaseUrl || this.connection?.config?.apiBaseUrl || "").replace(/\/$/, ""),
      apiKey: String(this.secrets.apiKey || ""),
    };

    if (fromSecrets.hubBaseUrl || fromSecrets.apiBaseUrl) return fromSecrets;

    if (this.db && this.connection?.departmentId) {
      const hub = await loadHubSettings(this.db, this.connection.departmentId);
      return { ...fromSecrets, ...hub, apiBaseUrl: fromSecrets.apiBaseUrl };
    }
    return fromSecrets;
  }

  academyCommandHeaders(settings) {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const bearer = settings.hubBearerToken || settings.apiKey;
    const secret = settings.hubSecret || settings.apiKey;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (secret) headers["X-Integration-Secret"] = secret;
    return headers;
  }

  /**
   * Call Academy hubAcademyCommand (direct apiBaseUrl) or Hub academy command proxy.
   */
  async callAcademyCommand(type, data = {}) {
    const settings = await this.resolveHubSettings();
    const academyBase = settings.apiBaseUrl;
    const hubBase = settings.hubBaseUrl;

    const body = { type, ...data };
    const headers = this.academyCommandHeaders(settings);

    if (academyBase) {
      const response = await fetch(`${academyBase}/hubAcademyCommand`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.ok === false) {
        throw new Error(json.message || json.error || `Academy command failed (${response.status})`);
      }
      return json;
    }

    if (hubBase) {
      const response = await fetch(`${hubBase}/api/integrations/v1/academy/command`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json.ok === false) {
        throw new Error(json.message || json.error || `Hub academy command failed (${response.status})`);
      }
      return json;
    }

    throw new Error("Configure Academy API base URL or Hub base URL on this connection.");
  }

  async testConnection() {
    const settings = await this.resolveHubSettings();
    if (!settings.hubBaseUrl && !settings.apiBaseUrl) {
      return {
        ok: false,
        status: "authentication_error",
        message: "Hub base URL or Academy API base URL is not configured for this Forge Academy connection.",
      };
    }

    try {
      if (settings.apiBaseUrl) {
        const response = await fetch(`${settings.apiBaseUrl}/hubAcademyCommand`, {
          method: "POST",
          headers: this.academyCommandHeaders(settings),
          body: JSON.stringify({ type: "list_enrollments", forgePersonId: "__connection_probe__" }),
        });
        // Auth failures are still "reachable" if we get a structured response.
        if (response.status >= 500) {
          return {
            ok: false,
            status: "degraded",
            message: `Academy returned ${response.status}.`,
            httpStatus: response.status,
          };
        }
        return {
          ok: true,
          status: "connected",
          message: "Forge Academy command endpoint is reachable.",
          httpStatus: response.status,
          hubBaseUrlHost: safeHost(settings.apiBaseUrl),
        };
      }

      const headers = { Accept: "application/json" };
      if (settings.hubBearerToken) headers.Authorization = `Bearer ${settings.hubBearerToken}`;
      if (settings.hubSecret) headers["X-Integration-Secret"] = settings.hubSecret;

      const response = await fetch(`${settings.hubBaseUrl}/api/integrations/v1/sync/status`, {
        method: "GET",
        headers,
      });

      if (response.status >= 500) {
        return {
          ok: false,
          status: "degraded",
          message: `Hub returned ${response.status}.`,
          httpStatus: response.status,
        };
      }

      return {
        ok: true,
        status: "connected",
        message: "Forge Integration Hub is reachable for this connection.",
        httpStatus: response.status,
        hubBaseUrlHost: safeHost(settings.hubBaseUrl),
      };
    } catch (error) {
      return {
        ok: false,
        status: "sync_error",
        message: error instanceof Error ? error.message : "Hub connection test failed.",
      };
    }
  }

  async findStudent(input = {}) {
    if (!this.db) return this.notImplemented("findStudent");
    try {
      const result = await resolvePersonIdentityViaHub(this.db, this.connection.departmentId, {
        femaSid: input.femaSid,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        dateOfBirth: input.dateOfBirth,
        sourceRecordId: input.sourceRecordId,
      });

      if (!result.hubConfigured) {
        return {
          matchStatus: "not_found",
          message: "Hub is not configured for this department.",
        };
      }

      if (result.review) {
        return {
          matchStatus: "manual_review_required",
          review: result.review,
          confidence: "medium",
        };
      }

      const personId = result.forgePersonId || result.personId || result.identity?.forgePersonId || null;
      if (!personId) {
        return { matchStatus: "not_found", confidence: "low" };
      }

      return {
        matchStatus: "matched",
        personId,
        externalStudentId: result.identity?.academyStudentId || null,
        matchedBy: input.femaSid ? "femaSid" : "identity_resolve",
        confidence: "high",
        identity: {
          personId,
          connectionId: this.connectionId,
          academyOrganizationId: this.connection.academyOrganizationId,
          externalStudentId: result.identity?.academyStudentId || null,
          femaSid: result.identity?.femaSidNormalized || result.identity?.femaSid || undefined,
          firstName: result.identity?.firstName || input.firstName || "",
          lastName: result.identity?.lastName || input.lastName || "",
          status: result.identity?.status || "active",
        },
      };
    } catch (error) {
      return {
        matchStatus: "conflict",
        message: error instanceof Error ? error.message : "Student match failed.",
      };
    }
  }

  async getStudent(externalStudentId) {
    return {
      status: "not_implemented",
      message: "Student profile retrieval will use secured Academy B2B APIs.",
      externalStudentId,
      connectionId: this.connectionId,
    };
  }

  async getEnrollments(personId) {
    const forgePersonId = String(personId || "").trim();
    if (!forgePersonId) {
      return { enrollments: [], message: "forgePersonId is required." };
    }

    try {
      const result = await this.callAcademyCommand("list_enrollments", {
        forgePersonId,
        personId: forgePersonId,
      });
      const enrollments = Array.isArray(result.enrollments) ? result.enrollments : [];
      return {
        status: "ok",
        enrollments,
        studentId: result.studentId || null,
        forgePersonId: result.forgePersonId || forgePersonId,
        connectionId: this.connectionId,
      };
    } catch (error) {
      return {
        status: "error",
        enrollments: [],
        connectionId: this.connectionId,
        message: error instanceof Error ? error.message : "Failed to list enrollments.",
      };
    }
  }

  async getCourseCompletions() {
    return [];
  }

  async getCertificates() {
    return [];
  }

  async getTranscript(personId) {
    const enrollmentsResult = await this.getEnrollments(personId);
    const enrollments = Array.isArray(enrollmentsResult.enrollments) ? enrollmentsResult.enrollments : [];
    return {
      status: enrollmentsResult.status || "ok",
      personId,
      connectionId: this.connectionId,
      academyOrganizationId: this.connection.academyOrganizationId,
      entries: enrollments.map((row) => ({
        type: "enrollment",
        courseName: row.courseName,
        courseNumber: row.courseNumber,
        status: row.status,
        classStartDate: row.classStartDate,
        classEndDate: row.classEndDate,
        registrationId: row.registrationId || row.id,
      })),
      message: enrollmentsResult.message || undefined,
    };
  }

  async submitEnrollment(input) {
    return {
      status: "not_implemented",
      message: "Enrollment submission scaffolding.",
      input: { courseCode: input?.courseCode || null },
    };
  }

  async syncPerson(input = {}) {
    const forgePersonId = String(input.personId || input.forgePersonId || "").trim();
    if (!forgePersonId) {
      return { status: "error", message: "personId (forgePersonId) is required." };
    }

    const enrollmentsResult = await this.getEnrollments(forgePersonId);
    const enrollments = Array.isArray(enrollmentsResult.enrollments) ? enrollmentsResult.enrollments : [];

    let upserts = [];
    if (this.db && this.connection?.departmentId) {
      upserts = await upsertEnrollmentsForPerson(
        this.db,
        this.connection.departmentId,
        {
          id: input.personnelId || input.rmsPersonId || null,
          forgePersonId,
          name: input.name || input.studentName || "",
        },
        enrollments
      );
      await upsertAcademyCache(this.db, this.connection.departmentId, forgePersonId, this.connectionId, {
        academyOrganizationId: this.connection.academyOrganizationId,
        syncStatus: enrollmentsResult.status === "error" ? "error" : "synced",
        lastSyncedAt: new Date().toISOString(),
        activeEnrollments: enrollments.length,
        completedCourses: upserts.filter((r) => r.record?.status === "Complete").length,
        lastError: enrollmentsResult.message || null,
      });
    }

    return {
      status: enrollmentsResult.status === "error" ? "error" : "ok",
      personId: forgePersonId,
      connectionId: this.connectionId,
      enrollmentCount: enrollments.length,
      upserts: upserts.length,
      message: enrollmentsResult.message || undefined,
      enrollments,
    };
  }
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

module.exports = { ForgeAcademyConnector };
