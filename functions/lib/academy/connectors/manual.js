const { AcademyConnector } = require("./base");

class ManualAcademyConnector extends AcademyConnector {
  async testConnection() {
    return {
      ok: true,
      status: "connected",
      message: "Manual academy records do not require a remote connection.",
    };
  }

  async findStudent() {
    return {
      matchStatus: "not_found",
      message: "Manual connector uses department-entered records only.",
    };
  }
}

module.exports = { ManualAcademyConnector };
