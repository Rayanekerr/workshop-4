//registry.ts
import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";

export type Node = { nodeId: number; pubKey: string };
export let nodes : Node[] = [];

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

 

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());
  _registry.set("nodes", [])

  _registry.get("/status", (req, res) => {
    res.status(200).send("live");
  });

  nodes = [];

  _registry.post("/registerNode", (req, res) => {
    const { nodeId, pubKey } = req.body as RegisterNodeBody;
    nodes.push({ nodeId, pubKey });
    res.status(200).send("Node registered");
  });

  _registry.get("/getNodeRegistry", (req, res) => {
    res.status(200).json({ nodes });
  });

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`Registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}

export async function registerNode(nodeId : number, pubKey : string) {
  nodes.push({nodeId: nodeId, pubKey: pubKey} as RegisterNodeBody)
}