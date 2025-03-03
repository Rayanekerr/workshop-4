//user.ts
import express from "express";
import bodyParser from "body-parser";
import { BASE_USER_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import { nodes } from "../registry/registry";  // Import the node registry
import { createRandomSymmetricKey, exportSymKey, rsaEncrypt, symEncrypt, symDecrypt } from "../crypto";

let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;

export async function user(userId: number) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  app.set('circuit', null);

  app.get("/status", (req, res) => {
    res.status(200).send("live");
  });

  app.get("/getLastReceivedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedMessage });
  });

  app.get("/getLastSentMessage", (req, res) => {
    res.status(200).json({ result: lastSentMessage });
  });

  app.get("/getLastCircuit", (req, res) => {
    res.status(200).json({ result: app.get('circuit') });
  });

  app.post("/message", (req, res) => {
    const { message } = req.body;
    console.log("Message received for user:", userId);
    console.log(message);
    lastReceivedMessage = message; // Store the received message
    res.send("success");
  });

  app.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;
    console.log("Sending message from user:", userId);
    console.log(`Message: ${message}, Destination User ID: ${destinationUserId}`);
    lastSentMessage = message; // Store the sent message

    if (nodes.length < 3) {
      res.status(500).json({ error: "Not enough nodes in the registry" });
      return;
    }
    const circuit = nodes.sort(() => Math.random() - 0.5).slice(0, 3);

    let node_circuit: number[] = circuit.map(value => value.nodeId);
    app.set("circuit", node_circuit);

    let encryptedMessage = Buffer.from(message + ' ', 'utf8').toString('base64');

    for (let i = circuit.length - 1; i >= 0; i--) {
      const node = circuit[i];

      // Generate symmetric key for this node
      const symKey = await createRandomSymmetricKey();
      const symKeyBase64 = await exportSymKey(symKey);

      // Encrypt destination as a 10-char string (e.g., "0000004012")
      const nextHop = i === circuit.length - 1 ? BASE_USER_PORT + destinationUserId : BASE_ONION_ROUTER_PORT + circuit[i + 1].nodeId;
      const nextHopStr = nextHop.toString().padStart(10, "0");

      console.log('New hop:', nextHopStr);

      // Encrypt (destination + message) using AES
      encryptedMessage = await symEncrypt(symKey, nextHopStr + encryptedMessage);

      // Encrypt AES key using node's public RSA key
      const encryptedSymKey = await rsaEncrypt(symKeyBase64, node.pubKey);

      // Concatenate the encrypted symmetric key with the encrypted message
      encryptedMessage = encryptedSymKey.slice(0, -2) + encryptedMessage;
    }

    // Send the final encrypted message to the entry node
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

  const server = app.listen(BASE_USER_PORT + userId, () => {
    console.log(`User ${userId} listening on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}