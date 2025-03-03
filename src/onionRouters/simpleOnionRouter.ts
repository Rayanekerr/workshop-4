//simpleOnionRouter.ts
import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT, BASE_USER_PORT, REGISTRY_PORT } from "../config";
import { registerNode } from "../registry/registry";
import { exportPrvKey, exportPubKey, generateRsaKeyPair, rsaDecrypt, symDecrypt } from "../crypto";
import axios from "axios";


let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;
let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;
let lastForwardedMessage: string | null = null;
let lastForwardedNode: number | null = null;


export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());
  onionRouter.set('id', nodeId);


  await generateRsaKeyPair().then((data) => {
    onionRouter.set('pubKey', data.publicKey);
    onionRouter.set('privKey', data.privateKey);
  });

  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.status(200).json({ result: lastMessageDestination });
  });

  onionRouter.get("/getLastReceivedMessage", (req, res) => {
    res.status(200).json({ result: lastReceivedMessage });
  });

  onionRouter.get("/getLastSentMessage", (req, res) => {
    res.status(200).json({ result: lastSentMessage });
  });
  
  onionRouter.get("/getPrivateKey", async (req, res) => {
    res.json({ "result": await exportPrvKey(onionRouter.get('privKey')) });
  });

  registerNode(onionRouter.get('id'), await exportPubKey(onionRouter.get('pubKey')));

  onionRouter.post("/message", async (req, res) => {
    let encryptedMessage = req.body.message;
    const privateKey = onionRouter.get('privKey');

    try {
      const encryptedSymKey = encryptedMessage.slice(0, 342) + "==";
      const encryptedData = encryptedMessage.slice(342);
      const symKeyBase64 = await rsaDecrypt(encryptedSymKey, privateKey);
      const decryptedData = await symDecrypt(symKeyBase64, encryptedData);
      const nextHop = parseInt(decryptedData.slice(0, 10), 10);
      const decryptedMessage = decryptedData.slice(10);
      onionRouter.set("port", nextHop);
      onionRouter.set('encrypted_message', encryptedMessage);
      const prepareMessage = (msg: string) => Buffer.from(msg, 'base64').toString("utf8").slice(0, -1);
   
      const sendMessage = async (destination: number, message: string) => {
        const url = `http://localhost:${destination}/message`;
        const messagePayload = { message: message };
        const headers = { 'Content-Type': 'application/json' };
    
        try {
            await axios.post(url, messagePayload, { headers });
            lastForwardedNode = destination;
            lastForwardedMessage = message;
            onionRouter.set('decrypted_message', message);
            console.log(`Message sent to ${destination}`);
        } catch (error) {
            console.error(`Failed to send message to ${destination}:`, error);
            throw error;
        }
    };
    
  
    if (nextHop < BASE_ONION_ROUTER_PORT) {
      console.log("Jump to user:", nextHop);
      
      // Enregistrer le prochain nœud et le message avant de l'envoyer
      lastForwardedNode = nextHop;
      lastForwardedMessage = prepareMessage(decryptedMessage);
  
      await sendMessage(nextHop, prepareMessage(decryptedMessage));
  } else {
      console.log("Jump to node:", nextHop);
      
      // Enregistrer le prochain nœud et le message avant de l'envoyer
      lastForwardedNode = nextHop;
      lastForwardedMessage = decryptedMessage;
  
      await sendMessage(nextHop, decryptedMessage);
  }
  
    
      res.send("success");
    
    } catch (err) {
      console.error("Error processing message:", err);
      res.status(500).json({ error: "error" });
    }
    
  });
  onionRouter.get("/getLastForwardedNode", (req, res) => {
    res.status(200).json({ result: lastForwardedNode });
});

  onionRouter.get("/getLastForwardedMessage", (req, res) => {
    res.status(200).json({ result: lastForwardedMessage });
});


  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${BASE_ONION_ROUTER_PORT + nodeId}`
    );
  });

  return server;
}