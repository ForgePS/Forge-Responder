/**
 * Base academy connector — all providers return normalized RMS models.
 * Subclasses override methods; stubs return not_implemented.
 */

class AcademyConnector {
  /**
   * @param {object} connection — public connection record
   * @param {{ secrets?: object, db?: FirebaseFirestore.Firestore }} [ctx]
   */
  constructor(connection, ctx = {}) {
    this.connection = connection;
    this.secrets = ctx.secrets || {};
    this.db = ctx.db || null;
  }

  get providerType() {
    return this.connection?.providerType || "manual";
  }

  get connectionId() {
    return this.connection?.connectionId || null;
  }

  notImplemented(method) {
    return {
      status: "not_implemented",
      providerType: this.providerType,
      connectionId: this.connectionId,
      method,
      message: `${this.providerType} connector method '${method}' is not implemented yet.`,
    };
  }

  async testConnection() {
    return {
      ok: false,
      status: "not_implemented",
      message: "Connection test not implemented for this provider.",
    };
  }

  async findStudent(_input) {
    return this.notImplemented("findStudent");
  }

  async getStudent(_externalStudentId) {
    return this.notImplemented("getStudent");
  }

  async getEnrollments(_personId) {
    return [];
  }

  async getCourseCompletions(_personId) {
    return [];
  }

  async getCertificates(_personId) {
    return [];
  }

  async getTranscript(_personId) {
    return this.notImplemented("getTranscript");
  }

  async submitEnrollment(_input) {
    return this.notImplemented("submitEnrollment");
  }

  async syncPerson(_input) {
    return this.notImplemented("syncPerson");
  }
}

module.exports = { AcademyConnector };
