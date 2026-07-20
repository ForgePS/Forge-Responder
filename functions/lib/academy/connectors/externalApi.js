const { AcademyConnector } = require("./base");

class ExternalApiAcademyConnector extends AcademyConnector {
  async testConnection() {
    const base = String(this.secrets.apiBaseUrl || this.connection?.config?.apiBaseUrl || "").trim();
    if (!base) {
      return {
        ok: false,
        status: "authentication_error",
        message: "External API base URL is not configured (store via connection secrets).",
      };
    }
    return {
      ok: true,
      status: "connected",
      message: "External API connector is configured (live probe scaffolding).",
      apiHost: safeHost(base),
    };
  }

  async findStudent() {
    return { matchStatus: "not_found", message: "External API student lookup scaffolding." };
  }

  async getTranscript(personId) {
    return {
      status: "not_implemented",
      personId,
      connectionId: this.connectionId,
      entries: [],
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

module.exports = { ExternalApiAcademyConnector };
