import express from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { generateRsaKeyPair, exportPubKey, rsaDecrypt, symDecrypt, exportPrvKey } from "../crypto";
import { Node } from "../registry/registry";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());

  let lastReceivedEncryptedMessage: string | null = null;
  let lastReceivedDecryptedMessage: string | null = null;
  let lastMessageDestination: number | null = null;
  
  const { publicKey, privateKey } = await generateRsaKeyPair();
  const pubKey = await exportPubKey(publicKey);

  // Routes
  onionRouter.get("/status", (req, res) => res.send("live"));
  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => res.json({ result: lastReceivedEncryptedMessage }));
  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => res.json({ result: lastReceivedDecryptedMessage }));
  onionRouter.get("/getLastMessageDestination", (req, res) => res.json({ result: lastMessageDestination }));
  onionRouter.get("/getPrivateKey", async (req, res) => res.json({ result: await exportPrvKey(privateKey) }));

  onionRouter.post("/message", async (req, res) => {
    try {
      const { message } = req.body;
      lastReceivedEncryptedMessage = message;

      const encryptedSymKey = message.slice(0, 344);
      const symEncryptedData = message.slice(344);

      const symmetricKey = await rsaDecrypt(encryptedSymKey, privateKey);
      const decryptedData = await symDecrypt(symmetricKey, symEncryptedData);

      const nextDestination = parseInt(decryptedData.slice(0, 10), 10);
      const innerMessage = decryptedData.slice(10);

      lastReceivedDecryptedMessage = innerMessage;
      lastMessageDestination = nextDestination;

      await fetch(`http://localhost:${nextDestination}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: innerMessage }),
      });

      res.status(200).send("Message forwarded");
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).send("Error processing message");
    }
  });

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId);

  // Wait for server to start
  await new Promise<void>((resolve) => {
    server.on('listening', () => {
      console.log(`Onion router ${nodeId} listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`);
      resolve();
    });
  });

  // Register node
  try {
    await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, pubKey }),
    });
  } catch (err) {
    console.error(`Node ${nodeId} registration error:`, err);
  }

  return server;
}