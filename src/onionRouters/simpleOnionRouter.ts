// simpleOnionRouter.ts
// Import required modules and dependencies
import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import axios from "axios";
import { BASE_ONION_ROUTER_PORT } from "../config";
import { registerNode } from "../registry/registry";
import {
  exportPrvKey,
  exportPubKey,
  generateRsaKeyPair,
  rsaDecrypt,
  symDecrypt,
} from "../crypto";

// Global variables to store message states
let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;
let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;
let lastForwardedMessage: string | null = null;
let lastForwardedNode: number | null = null;

/**
 * Initializes the Onion Router instance with a unique node ID.
 * @param nodeId - The ID of the Onion Router node.
 * @returns The Express server instance.
 */
export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());
  onionRouter.set("id", nodeId);

  // Generate and set RSA key pair
  await generateRsaKeyPair().then((data) => {
    onionRouter.set("pubKey", data.publicKey);
    onionRouter.set("privKey", data.privateKey);
  });

  // Register the node with its public key
  await registerNode(
    onionRouter.get("id"),
    await exportPubKey(onionRouter.get("pubKey"))
  );

  // Route: Status Check
  onionRouter.get("/status", (req: Request, res: Response) => {
    res.send("live");
  });

  // Route: Retrieve the last received encrypted message
  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedEncryptedMessage });
  });

  // Route: Retrieve the last received decrypted message
  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedDecryptedMessage });
  });

  // Route: Retrieve the last message destination
  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.status(200).json({ result: lastMessageDestination });
  });

  // Route: Retrieve the private key (for testing purposes only)
  onionRouter.get("/getPrivateKey", async (req, res) => {
    res.json({ result: await exportPrvKey(onionRouter.get("privKey")) });
  });

  // Route: Handle incoming messages
  onionRouter.post("/message", async (req: Request, res: Response) => {
    let encryptedMessage = req.body.message;
    const privateKey = onionRouter.get("privKey");

    try {
      // Decrypt symmetric key and message
      const encryptedSymKey = encryptedMessage.slice(0, 342) + "==";
      const encryptedData = encryptedMessage.slice(342);
      const symKeyBase64 = await rsaDecrypt(encryptedSymKey, privateKey);
      const decryptedData = await symDecrypt(symKeyBase64, encryptedData);
      const nextHop = parseInt(decryptedData.slice(0, 10), 10);
      const decryptedMessage = decryptedData.slice(10);

      // Update state variables
      lastReceivedEncryptedMessage = encryptedMessage;
      lastReceivedDecryptedMessage = decryptedMessage;
      lastMessageDestination = nextHop;

      // Prepare message for forwarding
      const prepareMessage = (msg: string) =>
        Buffer.from(msg, "base64").toString("utf8").slice(0, -1);

      // Send the message to the next hop
      const sendMessage = async (destination: number, message: string) => {
        const url = `http://localhost:${destination}/message`;
        try {
          await axios.post(url, { message }, { headers: { "Content-Type": "application/json" } });
          lastForwardedNode = destination;
          lastForwardedMessage = message;
          console.log(`Message sent to ${destination}`);
        } catch (error) {
          console.error(`Failed to send message to ${destination}:`, error);
          throw error;
        }
      };

      // Determine if the message is for a user or another node
      if (nextHop < BASE_ONION_ROUTER_PORT) {
        console.log("Jump to user:", nextHop);
        await sendMessage(nextHop, prepareMessage(decryptedMessage));
      } else {
        console.log("Jump to node:", nextHop);
        await sendMessage(nextHop, decryptedMessage);
      }

      res.send("success");
    } catch (err) {
      console.error("Error processing message:", err);
      res.status(500).json({ error: "error" });
    }
  });

  // Additional routes for forwarded message information
  onionRouter.get("/getLastForwardedNode", (req, res) => {
    res.status(200).json({ result: lastForwardedNode });
  });

  onionRouter.get("/getLastForwardedMessage", (req, res) => {
    res.status(200).json({ result: lastForwardedMessage });
  });

  // Start the server on the assigned port
  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`
    );
  });

  return server;
}
