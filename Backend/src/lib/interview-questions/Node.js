"use strict";

module.exports = {
  name: "Node.js",
  aliases: ["node.js", "nodejs"],
  questions: [
    "Walk me through how Node.js handles concurrent I/O, and explain what work could block its event loop.",
    "How would you structure an asynchronous request handler so failures are propagated and returned safely?",
    "Describe how you would handle configuration, logging, and graceful shutdown in a Node.js service.",
  ],
};
