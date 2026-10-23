const { AcademyConnector } = require("./base");

class SftpImportAcademyConnector extends AcademyConnector {
  async testConnection() {
    const host = String(this.secrets.sftpHost || this.connection?.config?.sftpHost || "").trim();
    if (!host) {
      return {
        ok: false,
        status: "authentication_error",
        message: "SFTP host is not configured.",
      };
    }
    return {
      ok: true,
      status: "connected",
      message: "SFTP connector configured (live SFTP probe is Phase 5 scaffolding).",
      sftpHost: host,
    };
  }
}

module.exports = { SftpImportAcademyConnector };
