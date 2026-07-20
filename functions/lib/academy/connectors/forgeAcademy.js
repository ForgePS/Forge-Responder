const { AcademyConnector } = require("./base");
const { loadHubSettings, resolvePersonIdentityViaHub } = require("../../forgeHubIdentity");

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
    };

    if (fromSecrets.hubBaseUrl) return fromSecrets;

    if (this.db && this.connection?.departmentId) {
      return loadHubSettings(this.db, this.connection.departmentId);
    }
    return fromSecrets;
  }

  async testConnection() {
    const settings = await this.resolveHubSettings();
    if (!settings.hubBaseUrl) {
      return {
        ok: false,
        status: "authentication_error",
        message: "Hub base URL is not configured for this Forge Academy connection.",
      };
    }

    try {
      const headers = { Accept: "application/json" };
      if (settings.hubBearerToken) headers.Authorization = `Bearer ${settings.hubBearerToken}`;
      if (settings.hubSecret) headers["X-Integration-Secret"] = settings.hubSecret;

      // Unauthenticated probe expects 401; with auth any non-5xx is reachability OK.
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

  async getEnrollments() {
    return [];
  }

  async getCourseCompletions() {
    return [];
  }

  async getCertificates() {
    return [];
  }

  async getTranscript(personId) {
    return {
      status: "not_implemented",
      personId,
      connectionId: this.connectionId,
      academyOrganizationId: this.connection.academyOrganizationId,
      entries: [],
      message: "Transcript retrieval scaffolding — wire Academy B2B in Phase 2 flesh-out.",
    };
  }

  async submitEnrollment(input) {
    return {
      status: "not_implemented",
      message: "Enrollment submission scaffolding.",
      input: { courseCode: input?.courseCode || null },
    };
  }

  async syncPerson(input) {
    return {
      status: "not_implemented",
      message: "Person sync scaffolding.",
      personId: input?.personId || null,
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
