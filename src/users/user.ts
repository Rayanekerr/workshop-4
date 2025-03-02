import express from "express";
import bodyParser from "body-parser";
import { BASE_USER_PORT } from "../config";


let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;

export async function user(userId: number) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  app.get("/status", (req, res) => {
    res.status(200).send("live");
  });

  app.get("/getLastReceivedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedMessage });
  });

  app.get("/getLastSentMessage", (req, res) => {
    res.status(200).json({ result: lastSentMessage });
  });

  app.post("/message", (req, res) => {
    const { message } = req.body;
    console.log("Message received for user:", userId);
    console.log(message);
    lastReceivedMessage = message; // Store the received message
    res.send("success");
  });

  const server = app.listen(BASE_USER_PORT + userId, () => {
    console.log(`User ${userId} listening on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}