const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");

function createMongoStorage({ uri, dbName }) {
  const client = new MongoClient(uri);
  let db;
  let bucket;

  async function connect() {
    if (!db) {
      await client.connect();
      db = client.db(dbName);
      bucket = new GridFSBucket(db, { bucketName: "vaultFiles" });
    }
    return db;
  }

  async function saveFile({ fileBuffer, filename, mimeType, metadata }) {
    await connect();

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: mimeType,
      metadata,
    });

    uploadStream.end(fileBuffer);

    return new Promise((resolve, reject) => {
      uploadStream.on("finish", () => {
        resolve({
          fileId: uploadStream.id.toString(),
          filename,
        });
      });
      uploadStream.on("error", reject);
    });
  }

  async function saveModerationAudit(audit) {
    const currentDb = await connect();
    const result = await currentDb.collection("moderation_audit").insertOne({
      ...audit,
      createdAt: new Date(),
    });

    return result.insertedId.toString();
  }

  async function getFileMeta(fileId) {
    const currentDb = await connect();
    const found = await currentDb.collection("vaultFiles.files").findOne({ _id: new ObjectId(fileId) });
    if (!found) return null;
    return found;
  }

  async function close() {
    await client.close();
  }

  return {
    connect,
    saveFile,
    saveModerationAudit,
    getFileMeta,
    close,
  };
}

module.exports = {
  createMongoStorage,
};
