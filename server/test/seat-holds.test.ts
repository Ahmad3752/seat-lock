import assert from "node:assert/strict";
import test, { before } from "node:test";
import mongoose from "mongoose";
import { installTestDatabase } from "./helpers/database.js";

installTestDatabase();

before(async () => {
  await mongoose.connection.collection("transaction_smoke").createIndex({ marker: 1 }, { unique: true });
});

test("test database commits a document inside a transaction", async () => {
  const collection = mongoose.connection.collection("transaction_smoke");
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await collection.insertOne({ marker: "committed" }, { session });
    });
  } finally {
    await session.endSession();
  }

  assert.equal(await collection.countDocuments({ marker: "committed" }), 1);
});

test("test cleanup preserves unique indexes between tests", async () => {
  const collection = mongoose.connection.collection("transaction_smoke");
  assert.equal(await collection.countDocuments({}), 0);
  await assert.rejects(
    collection.insertMany([{ marker: "duplicate" }, { marker: "duplicate" }]),
    (error: unknown) => error instanceof Error && "code" in error && error.code === 11000,
  );
});
