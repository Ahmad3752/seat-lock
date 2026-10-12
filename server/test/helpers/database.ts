import { after, afterEach, before } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

export function installTestDatabase() {
  let database: MongoMemoryServer;

  before(async () => {
    database = await MongoMemoryServer.create();
    await mongoose.connect(database.getUri());
  });

  afterEach(async () => {
    await mongoose.connection.db?.dropDatabase();
  });

  after(async () => {
    await mongoose.disconnect();
    await database.stop();
  });
}
