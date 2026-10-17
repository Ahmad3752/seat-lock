import { after, afterEach, before } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

export function installTestDatabase() {
  let database: MongoMemoryReplSet;

  before(async () => {
    const binaryDirectory = path.resolve(process.cwd(), ".mongodb-binaries");
    await mkdir(binaryDirectory, { recursive: true });
    const dbPath = await mkdtemp(path.join(binaryDirectory, "mongo-data-"));

    try {
      database = await MongoMemoryReplSet.create({
        binary: { downloadDir: binaryDirectory },
        instanceOpts: [{ dbPath }],
        replSet: { count: 1, storageEngine: "wiredTiger" },
      });
    } catch (error) {
      await rm(dbPath, { recursive: true, force: true });
      throw error;
    }

    await mongoose.connect(database.getUri());
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db?.collections();
    await Promise.all(collections?.map((collection) => collection.deleteMany({})) ?? []);
  });

  after(async () => {
    await mongoose.disconnect();
    await database?.stop({ doCleanup: true, force: true });
  });
}
