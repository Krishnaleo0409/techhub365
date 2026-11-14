"use strict";

const crypto = require("node:crypto");

function matches(row, filter) {
  return Object.entries(filter).every(([field, value]) => {
    if (field === "$or") return value.some(item => matches(row, item));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, expected]) => {
        const actual = row[field];
        if (operator === "$gt") return actual > expected;
        if (operator === "$gte") return actual >= expected;
        if (operator === "$lt") return actual < expected;
        if (operator === "$lte") return actual <= expected;
        if (operator === "$ne") return actual !== expected;
        if (operator === "$in") return expected.includes(actual);
        if (operator === "$exists") return (actual !== undefined) === expected;
        throw new Error(`Unsupported fixture operator: ${operator}`);
      });
    }
    return row[field] === value;
  });
}

function createDatabase() {
  const collections = new Map();
  const db = {
    collection(name) {
      if (collections.has(name)) return collections.get(name);
      const rows = [];
      const indexes = [["_id"]];
      const collection = {
        rows,
        async createIndex(fields, options) {
          if (options?.unique) indexes.push(Object.keys(fields));
        },
        async findOne(filter) {
          return structuredClone(rows.find(row => matches(row, filter)) || null);
        },
        find(filter, options = {}) {
          let selected = rows.filter(row => matches(row, filter)).map(row => structuredClone(row));
          const cursor = {
            sort(fields) {
              selected.sort((left, right) => {
                for (const [field, direction] of Object.entries(fields)) {
                  if (left[field] < right[field]) return -direction;
                  if (left[field] > right[field]) return direction;
                }
                return 0;
              });
              return cursor;
            },
            limit(limit) { selected = selected.slice(0, limit); return cursor; },
            async toArray() {
              const keys = Object.entries(options.projection || {}).filter(([, enabled]) => enabled === 1).map(([field]) => field);
              return selected.map(row => keys.length
                ? Object.fromEntries(keys.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]]))
                : Object.fromEntries(Object.entries(row).filter(([field]) => !(field === "_id" && options.projection?._id === 0))));
            },
          };
          return cursor;
        },
        async insertOne(row) {
          row = { _id: crypto.randomUUID(), ...structuredClone(row) };
          if (indexes.some(keys => rows.some(existing => keys.every(key => row[key] !== undefined && existing[key] === row[key])))) {
            throw Object.assign(new Error("Duplicate key"), { code: 11000 });
          }
          rows.push(row);
          return { insertedId: row._id };
        },
        async findOneAndUpdate(filter, update, options = {}) {
          let row = rows.find(candidate => matches(candidate, filter));
          const before = row ? structuredClone(row) : null;
          if (!row && options.upsert) {
            const initial = Object.fromEntries(Object.entries(filter).filter(([, value]) =>
              value === null || typeof value !== "object"));
            await collection.insertOne({ ...initial, ...update.$setOnInsert });
            row = rows.at(-1);
          }
          if (!row) return null;
          Object.assign(row, structuredClone(update.$set || {}));
          for (const [key, increment] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + increment;
          return options.returnDocument === "after" ? structuredClone(row) : before;
        },
        async updateOne(filter, update, options = {}) {
          const found = rows.some(row => matches(row, filter));
          const row = await collection.findOneAndUpdate(filter, update, { ...options, returnDocument: "after" });
          return { matchedCount: found ? 1 : 0, modifiedCount: found && row ? 1 : 0 };
        },
        async updateMany(filter, update) {
          const selected = rows.filter(row => matches(row, filter));
          for (const row of selected) Object.assign(row, structuredClone(update.$set));
          return { matchedCount: selected.length, modifiedCount: selected.length };
        },
        async deleteOne(filter) {
          const index = rows.findIndex(row => matches(row, filter));
          if (index >= 0) rows.splice(index, 1);
          return { deletedCount: index >= 0 ? 1 : 0 };
        },
      };
      collections.set(name, collection);
      return collection;
    },
    reset() { for (const collection of collections.values()) collection.rows.splice(0); },
    async transaction(work) {
      const snapshot = new Map([...collections].map(([name, collection]) => [name, structuredClone(collection.rows)]));
      try { return await work(db, {}); }
      catch (error) {
        for (const [name, collection] of collections) collection.rows.splice(0, collection.rows.length, ...(snapshot.get(name) || []));
        throw error;
      }
    },
  };
  return db;
}

module.exports = { createDatabase };
