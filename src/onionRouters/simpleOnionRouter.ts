import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import { 
  generateRsaKeyPair, 
  exportPrvKey, 
  exportPubKey, 
  rsaDecrypt, 
  createRandomSymmetricKey, 
  symEncrypt, 
  rsaEncrypt, 
  exportSymKey 
} from "../crypto";

import * as crypto from "crypto";
import axios from "axios";

const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;

let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;

let privateKey: crypto.webcrypto.CryptoKey | null = null;
let publicKeyBase64: string | null = null;

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  const keyPair = await generateRsaKeyPair();
  privateKey = keyPair.privateKey;
  publicKeyBase64 = await exportPubKey(keyPair.publicKey);

  console.log(`Generated keys for node ${nodeId}:`, {
    privateKey,
    publicKeyBase64,
  });

  try {
    await axios.post(`${REGISTRY_URL}/registerNode`, {
      nodeId,
      pubKey: publicKeyBase64,
    });
    console.log(`Node ${nodeId} registered successfully with the registry.`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Failed to register node ${nodeId}:`, error.message);
    } else {
      console.error(`Failed to register node ${nodeId}: Unknown error`);
    }
  }

  onionRouter.get("/status", (req: Request, res: Response) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req: Request, res: Response) => {
    res.json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req: Request, res: Response) => {
    res.json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req: Request, res: Response) => {
    res.json({ result: lastMessageDestination });
  });

  onionRouter.get("/getPrivateKey", async (req: Request, res: Response) => {
    if (!privateKey) {
      return res.status(500).json({ error: "Private key not generated" });
    }

    const privateKeyBase64 = await exportPrvKey(privateKey);
    return res.json({ result: privateKeyBase64 });
  });

  onionRouter.get("/getNodeRegistry", async (req: Request, res: Response) => {
    try {
      const response = await axios.get(`${REGISTRY_URL}/getNodeRegistry`);
      console.log("Node registry retrieved:", response.data);
      res.json(response.data);
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({
          error: "Unknown error occurred while retrieving the node registry",
        });
      }
    }
  });
  onionRouter.post("/message", async (req: Request, res: Response) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        lastReceivedEncryptedMessage = message;
        const decryptedMessage = await rsaDecrypt(message, privateKey!);
        lastReceivedDecryptedMessage = decryptedMessage;

        lastMessageDestination = parseInt(decryptedMessage.slice(0, 10), 10);
        const forwardedMessage = decryptedMessage.slice(10);

        if (lastMessageDestination >= 3000 && lastMessageDestination < 4000) {
            await axios.post(`http://localhost:${lastMessageDestination}/message`, {
                message: forwardedMessage,
            });
            console.log(`Message delivered to user ${lastMessageDestination}`);
            return res.sendStatus(200);
        } 
        
        if (lastMessageDestination >= 4000) {
            await axios.post(`http://localhost:${lastMessageDestination}/message`, {
                message: forwardedMessage,
            });
            console.log(`Message forwarded to node ${lastMessageDestination}`);
            return res.sendStatus(200);
        }

        console.error("Invalid message destination");
        return res.status(400).json({ error: "Invalid message destination" });

    } catch (error) {
        console.error(`Failed to process message:`, error);
        return res.status(500).json({ error: "Failed to process message" });
    }
});


onionRouter.post("/sendMessage", async (req: Request, res: Response) => {
  const { message, destinationUserId } = req.body;
  if (!message || typeof destinationUserId !== "number") {
      return res.status(400).json({ error: "Invalid request body" });
  }

  try {
      const response = await axios.get<{ nodes: { nodeId: number; pubKey: string }[] }>(
          `${REGISTRY_URL}/getNodeRegistry`
      );
      const nodes = response.data.nodes;

      if (nodes.length < 3) {
          return res.status(500).json({ error: "Not enough nodes in the registry" });
      }

      const selectedNodes = nodes.sort(() => 0.5 - Math.random()).slice(0, 3);

      let encryptedMessage = `0000003${destinationUserId.toString().padStart(3, "0")}${message}`;

      for (const node of selectedNodes.reverse()) {
          const symmetricKey = await createRandomSymmetricKey();
          const encryptedMessageLayer = await symEncrypt(symmetricKey, encryptedMessage);
          const encryptedSymmetricKey = await rsaEncrypt(await exportSymKey(symmetricKey), node.pubKey);

          const destination = `0000004${node.nodeId.toString().padStart(3, "0")}`;
          encryptedMessage = `${encryptedSymmetricKey}${destination}${encryptedMessageLayer}`;
      }

      const entryNodePort = BASE_ONION_ROUTER_PORT + selectedNodes[0].nodeId;
      await axios.post(`http://localhost:${entryNodePort}/message`, {
          message: encryptedMessage,
      });

      console.log(`Message sent through the network to user ${destinationUserId}`);
      return res.sendStatus(200);

  } catch (error) {
      console.error(`Failed to send message:`, error);
      return res.status(500).json({ error: "Failed to send message" });
  }
});


  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}
