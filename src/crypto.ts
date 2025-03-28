import { webcrypto } from "crypto";

// #############
// ### Utils ###
// #############

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const buff = Buffer.from(base64, "base64");
  return buff.buffer.slice(buff.byteOffset, buff.byteOffset + buff.byteLength);
}

// ################
// ### RSA keys ###
// ################

type GenerateRsaKeyPair = {
  publicKey: webcrypto.CryptoKey;
  privateKey: webcrypto.CryptoKey;
};

export async function generateRsaKeyPair(): Promise<GenerateRsaKeyPair> {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

export async function exportPubKey(key: webcrypto.CryptoKey): Promise<string> {
  const exported = await webcrypto.subtle.exportKey("spki", key);
  return arrayBufferToBase64(exported);
}

export async function exportPrvKey(key: webcrypto.CryptoKey | null): Promise<string | null> {
  if (!key) return null;
  const exported = await webcrypto.subtle.exportKey("pkcs8", key);
  return arrayBufferToBase64(exported);
}

export async function importPubKey(strKey: string): Promise<webcrypto.CryptoKey> {
  const keyBuffer = base64ToArrayBuffer(strKey);
  return await webcrypto.subtle.importKey(
    "spki",
    keyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

export async function importPrvKey(strKey: string): Promise<webcrypto.CryptoKey> {
  const keyBuffer = base64ToArrayBuffer(strKey);
  return await webcrypto.subtle.importKey(
    "pkcs8",
    keyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

export async function rsaEncrypt(b64Data: string, strPublicKey: string): Promise<string> {
  const publicKey = await importPubKey(strPublicKey);
  const dataBuffer = base64ToArrayBuffer(b64Data);
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    dataBuffer
  );
  return arrayBufferToBase64(encrypted);
}

export async function rsaDecrypt(data: string, privateKey: webcrypto.CryptoKey): Promise<string> {
  const dataBuffer = base64ToArrayBuffer(data);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    dataBuffer
  );
  return arrayBufferToBase64(decrypted);
}

// ######################
// ### Symmetric keys ###
// ######################

export async function createRandomSymmetricKey(): Promise<webcrypto.CryptoKey> {
  return await webcrypto.subtle.generateKey(
    {
      name: "AES-CBC",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportSymKey(key: webcrypto.CryptoKey): Promise<string> {
  const exported = await webcrypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64(exported);
}

export async function importSymKey(strKey: string): Promise<webcrypto.CryptoKey> {
  const keyBuffer = base64ToArrayBuffer(strKey);
  return await webcrypto.subtle.importKey(
    "raw",
    keyBuffer,
    "AES-CBC",
    true,
    ["encrypt", "decrypt"]
  );
}

export async function symEncrypt(key: webcrypto.CryptoKey, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const iv = webcrypto.getRandomValues(new Uint8Array(16));
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    dataBytes
  );
  const encryptedBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv);
  combined.set(encryptedBytes, iv.length);
  return arrayBufferToBase64(combined.buffer);
}

export async function symDecrypt(strKey: string, encryptedData: string): Promise<string> {
  const key = await importSymKey(strKey);
  const encryptedBuffer = base64ToArrayBuffer(encryptedData);
  const iv = encryptedBuffer.slice(0, 16);
  const ciphertext = encryptedBuffer.slice(16);
  const decrypted = await webcrypto.subtle.decrypt(
    { name: "AES-CBC", iv: new Uint8Array(iv) },
    key,
    ciphertext
  );
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}