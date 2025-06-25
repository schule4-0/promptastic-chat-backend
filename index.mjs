import { AzureOpenAI } from "openai";
import express from "express";
import cors from "cors";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());

app.use(express.static("public"));
app.use("/free", express.static("public"));

if (!existsSync(`prompts`)) {
  mkdirSync("prompts");
}

const log = console.log;
console.log = function () {
  log.apply(console, [new Date().toLocaleString() + ": "].concat(arguments[0]));
};

const passwordProtect = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (token == null) return res.sendStatus(401); // No token present

  if (token === process.env["API_PASSWORD"]) {
    next();
  } else {
    return res.status(403).send("Invalid token");
  }
};

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

app.post("/api/chat", passwordProtect, async (req, res) => {
  const prompt = req.body?.prompt;
  console.log(req.body?.prompt);

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).send("Missing prompt");
  }

  const endpoint =
    process.env["AZURE_OPENAI_ENDPOINT"] ||
    "https://promptastic.openai.azure.com/";
  const deployment = process.env["DEPLOYMENT"] || "gpt-4.1-nano";
  const apiVersion = process.env["API_VERSION"] || "2025-01-01-preview";
  const apiKey = process.env["AZURE_OPENAI_API_KEY"];

  const client = new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion,
    deployment,
  });

  let promptObj = [
    {
      role: "assistant",
      content: prompt,
    },
  ];
  if (process.env["SYSTEM_PROMPT"]) {
    promptObj = [
      {
        role: "system",
        content: process.env["SYSTEM_PROMPT"],
      },
      ...promptObj,
    ];
  }

  const stream = await client.chat.completions.create({
    stream: true,
    messages: promptObj,
    max_tokens: 800,
    temperature: 1, // between 0 and 1. 0 is deterministic
    top_p: 1, // word diversitry
    frequency_penalty: 0, // reduce chance of repeating same text in response
    presence_penalty: 0, // increase likelihood of introducing new topics
    stop: null,
  });

  // Pipe the response stream back to the client
  res.setHeader("Content-Type", "text/event-stream");
  let resultBuffer = "";

  for await (const event of stream) {
    if (event.choices[0]?.delta?.content) {
      res.write(event.choices[0].delta.content);
      resultBuffer += event.choices[0].delta.content;
    }
  }
  res.end();

  const clientId = simpleHash(req.socket.remoteAddress);

  const message = `${new Date().toLocaleString()}: [PROMPT] ${req.body?.prompt}

${resultBuffer}

---

`;

  appendFileSync(`prompts/${clientId}.log`, message, "utf8");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
