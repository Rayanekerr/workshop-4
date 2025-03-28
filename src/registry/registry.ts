import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";

export type Node = { nodeId: number; pubKey: string };

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

  let nodes: Node[] = [];

  _registry.get("/status", (req, res) => {
    res.send("live");
  });

  _registry.post("/registerNode", (req: Request<{}, {}, RegisterNodeBody>, res: Response) => {
    const { nodeId, pubKey } = req.body;
    // Remove existing entry if present
  nodes = nodes.filter(n => n.nodeId !== nodeId);
    nodes.push({ nodeId, pubKey });
    res.status(200).send("Node registered");
  });

  _registry.get("/getNodeRegistry", (req, res) => {
    res.json({ nodes } as GetNodeRegistryBody);
  });

  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}
