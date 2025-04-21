// === add-passenger.js (Vercel endpoint for WhatsApp Flow) ===
import crypto from "crypto";

const PRIVATE_KEY = process.env.PRIVATE_KEY; // Loaded from Vercel environment variable
const TAG_LENGTH = 16;

function decryptRequest(body, privatePem) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: crypto.createPrivateKey(privatePem),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encrypted_aes_key, "base64")
  );

  const flowDataBuffer = Buffer.from(encrypted_flow_data, "base64");
  const initialVectorBuffer = Buffer.from(initial_vector, "base64");

  const encrypted_flow_data_body = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const encrypted_flow_data_tag = flowDataBuffer.subarray(-TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-128-gcm", decryptedAesKey, initialVectorBuffer);
  decipher.setAuthTag(encrypted_flow_data_tag);

  const decryptedJSONString = Buffer.concat([
    decipher.update(encrypted_flow_data_body),
    decipher.final(),
  ]).toString("utf-8");

  return {
    decryptedBody: JSON.parse(decryptedJSONString),
    aesKeyBuffer: decryptedAesKey,
    initialVectorBuffer,
  };
}

function encryptResponse(response, aesKeyBuffer, initialVectorBuffer) {
  const flipped_iv = initialVectorBuffer.map(b => ~b);
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKeyBuffer, Buffer.from(flipped_iv));

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), "utf-8"),
    cipher.final(),
    cipher.getAuthTag()
  ]);

  return encrypted.toString("base64");
}

export default async function handler(req, res) {
  try {
    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(req.body, PRIVATE_KEY);

    const { screen, data, version, action } = decryptedBody;

    let nextScreen = "CONFIRM";
    let nextData = {
      confirmation: `Passenger added successfully! 🎉`
    };

    // OPTIONAL: Log full incoming request
    console.log("Incoming Decrypted Data:", JSON.stringify(decryptedBody, null, 2));

    // Example: in real case, you could lookup the selected flight and validate the format

    // Build response
    const screenData = {
      screen: nextScreen,
      data: nextData
    };

    const encrypted = encryptResponse(screenData, aesKeyBuffer, initialVectorBuffer);

    res.status(200).send(encrypted);
  } catch (err) {
    console.error("Encryption/Decryption error:", err);
    res.status(500).send("Internal Server Error");
  }
}
