import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT,BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { createRandomSymmetricKey, exportSymKey, symEncrypt, rsaEncrypt } from "../crypto";
import { GetNodeRegistryBody, Node } from "../registry/registry";

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  let lastReceivedMessage: string | null = null;
  let lastSentMessage: string | null = null;
  let lastCircuit: number[] = [];

  // Routes
  _user.get("/status", (req, res) => res.send("live"));
  _user.get("/getLastReceivedMessage", (req, res) => res.json({ result: lastReceivedMessage }));
  _user.get("/getLastSentMessage", (req, res) => res.json({ result: lastSentMessage }));
  _user.get("/getLastCircuit", (req, res) => res.json({ result: lastCircuit }));

  _user.post("/message", (req, res) => {
    lastReceivedMessage = req.body.message;
    res.status(200).send("success");
  });

  _user.post("/sendMessage", async (req, res) => {
    try {
      const { message, destinationUserId } = req.body;
      lastSentMessage = message;

      // Get node registry
      const nodesResponse = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const registry: GetNodeRegistryBody = await nodesResponse.json() as GetNodeRegistryBody;;
      
      // Create circuit with 3 unique nodes
      const nodes = registry.nodes;
      const circuit: Node[] = [];
      const availableNodes = [...nodes];
      
      while (circuit.length < 3 && availableNodes.length >= 3) {
        const randomIndex = Math.floor(Math.random() * availableNodes.length);
        const [node] = availableNodes.splice(randomIndex, 1);
        if (!circuit.some(n => n.nodeId === node.nodeId)) {
          circuit.push(node);
        }
      }

      if (circuit.length < 3) {
        throw new Error("Not enough nodes to create a circuit");
      }

      lastCircuit = circuit.map(node => node.nodeId);

      let finalMessage = message;
      let destination = `${BASE_USER_PORT + destinationUserId}`.padStart(10, "0");

      // Encrypt in reverse order (last node first)
      for (let i = circuit.length - 1; i >= 0; i--) {
        const node = circuit[i];
        const symKey = await createRandomSymmetricKey();
        const exportedSymKey = await exportSymKey(symKey);

        // Create layer
        const messageToEncrypt = `${destination}${finalMessage}`;
        const encryptedMessage = await symEncrypt(symKey, messageToEncrypt);
        const encryptedSymKey = await rsaEncrypt(exportedSymKey, node.pubKey);

        // Update values for next iteration
        destination = `${BASE_ONION_ROUTER_PORT + node.nodeId}`.padStart(10, "0");
        finalMessage = encryptedSymKey + encryptedMessage;
      }

      // Send to first node
      await fetch(`http://localhost:${BASE_ONION_ROUTER_PORT + circuit[0].nodeId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: finalMessage }),
      });

      res.status(200).send("Message sent");
    } catch (error) {
      console.error(error);
      res.status(500).send("Error sending message");
    }
  });

  // Add the missing server initialization
  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(`User ${userId} listening on port ${BASE_USER_PORT + userId}`);
  });

  return server;
}