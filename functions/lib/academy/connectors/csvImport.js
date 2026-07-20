const { AcademyConnector } = require("./base");

class CsvImportAcademyConnector extends AcademyConnector {
  async testConnection() {
    return {
      ok: true,
      status: "connected",
      message: "CSV import connector ready. Upload/import workers are Phase 5 scaffolding.",
    };
  }

  async syncPerson() {
    return {
      status: "not_implemented",
      message: "CSV import sync runs through import batches, not live API sync.",
    };
  }
}

module.exports = { CsvImportAcademyConnector };
