// user.ts
// Import required modules and dependencies
import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { BASE_USER_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import { nodes } from "../registry/registry";
import {
  createRandomSymmetricKey,
  exportSymKey,
  rsaEncrypt,
  symEncrypt,
} from "../crypto";

// Global variables to store message states
let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;

/**
 * Initializes a user instance with a unique user ID.
 * @param userId - The ID of the user.
 * @returns The Express server instance.
 */
export async function user(userId: number) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  app.set('circuit', null);

  // Route: Status Check
  app.get("/status", (req: Request, res: Response) => {
    res.status(200).send("live");
  });

  // Route: Get the last received message
  app.get("/getLastReceivedMessage", (req: Request, res: Response) => {
    res.status(200).json({ result: lastReceivedMessage });
  });

  // Route: Get the last sent message
  app.get("/getLastSentMessage", (req: Request, res: Response) => {
    res.status(200).json({ result: lastSentMessage });
  });

  // Route: Get the last circuit used
  app.get("/getLastCircuit", (req: Request, res: Response) => {
    res.status(200).json({ result: app.get('circuit') });
  });

  // Route: Handle incoming messages
  app.post("/message", (req: Request, res: Response) => {
    const { message } = req.body;
    console.log("Message received for user:", userId);
    console.log(message);
    lastReceivedMessage = message;
    res.send("success");
  });

  // Route: Send a message through the Onion Router network
  app.post("/sendMessage", async (req: Request, res: Response) => {
    const { message, destinationUserId } = req.body;
    console.log("Sending message from user:", userId);
    console.log(`Message: ${message}, Destination User ID: ${destinationUserId}`);
    lastSentMessage = message;

    if (nodes.length < 3) {
      res.status(500).json({ error: "Not enough nodes in the registry" });
      return;
    }

    const circuit = nodes.sort(() => Math.random() - 0.5).slice(0, 3);
    const node_circuit: number[] = circuit.map(value => value.nodeId);
    app.set("circuit", node_circuit);

    let encryptedMessage = Buffer.from(message + ' ', 'utf8').toString('base64');

    for (let i = circuit.length - 1; i >= 0; i--) {
      const node = circuit[i];

      const symKey = await createRandomSymmetricKey();
      const symKeyBase64 = await exportSymKey(symKey);

      const nextHop = i === circuit.length - 1
        ? BASE_USER_PORT + destinationUserId
        : BASE_ONION_ROUTER_PORT + circuit[i + 1].nodeId;

      const nextHopStr = nextHop.toString().padStart(10, "0");
      console.log('New hop:', nextHopStr);

      encryptedMessage = await symEncrypt(symKey, nextHopStr + encryptedMessage);
      const encryptedSymKey = await rsaEncrypt(symKeyBase64, node.pubKey);
      encryptedMessage = encryptedSymKey.slice(0, -2) + encryptedMessage;
    }

    const entryNode = circuit[0];
    await fetch(
      `http://localhost:${BASE_ONION_ROUTER_PORT + entryNode.nodeId}/message`,
      {
        method: 'post',
        body: JSON.stringify({ message: encryptedMessage }),
        headers: { 'Content-Type': 'application/json' }
      }
    );

    res.send("success");
  });

  // Start the server on the assigned port
  const server = app.listen(BASE_USER_PORT + userId, () => {
    console.log(`User ${userId} listening on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}