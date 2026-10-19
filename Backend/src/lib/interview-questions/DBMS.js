"use strict";

module.exports = {
  name: "DBMS",
  aliases: ["dbms", "database", "databases", "mongodb", "mongo db", "sql", "mysql", "postgresql", "postgres"],
  questions: [
    "How would you decide whether a database query needs an index, and what trade-offs does an added index introduce?",
    "Explain normalization and when you might deliberately denormalize data for a specific workload.",
    "Describe the guarantees provided by ACID transactions and give an example where transaction boundaries matter.",
  ],
};
