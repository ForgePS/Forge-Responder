const { ForgeAcademyConnector } = require("./connectors/forgeAcademy");
const { ExternalApiAcademyConnector } = require("./connectors/externalApi");
const { CsvImportAcademyConnector } = require("./connectors/csvImport");
const { SftpImportAcademyConnector } = require("./connectors/sftpImport");
const { ManualAcademyConnector } = require("./connectors/manual");

const PROVIDER_MAP = {
  forge_academy: ForgeAcademyConnector,
  external_api: ExternalApiAcademyConnector,
  csv_import: CsvImportAcademyConnector,
  sftp_import: SftpImportAcademyConnector,
  manual: ManualAcademyConnector,
};

function createAcademyConnector(connection, ctx = {}) {
  if (!connection?.providerType) {
    throw new Error("Connection providerType is required.");
  }
  const Ctor = PROVIDER_MAP[connection.providerType];
  if (!Ctor) {
    throw new Error(`No connector for providerType: ${connection.providerType}`);
  }
  return new Ctor(connection, ctx);
}

module.exports = {
  createAcademyConnector,
  PROVIDER_MAP,
};
