const express = require("express");
const bodyParser = require("body-parser");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const sessionFolderPath = path.join(__dirname, "./wwebjs_auth/session");
// Initialize the Express app
const app = express();
const port = 5023;

// Middleware to parse JSON data from requests
app.use(bodyParser.json());
const deleteSessionData = (sessionFolderPath, retries = 3) => {
  try {
    if (fs.existsSync(sessionFolderPath)) {
      fs.rmSync(sessionFolderPath, { recursive: true, force: true });
      console.log("Session data cleared successfully.");
    } else {
      console.log("Session folder does not exist, skipping deletion.");
    }
  } catch (error) {
    if (error.code === "EBUSY" && retries > 0) {
      console.log(
        `Resource busy or locked. Retrying... (${retries} attempts left)`
      );
      setTimeout(() => deleteSessionData(sessionFolderPath, retries - 1), 1000);
    } else {
      console.error("Error clearing session data:", error.message);
    }
  }
};


// Create a new WhatsApp client with local authentication (stores session data in the file system)
const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
  qrcodeTerminal.generate(qr, { small: true });
  console.log("QR code generated, scan it with WhatsApp to authenticate!");
});

// Client ready event
client.on("ready", () => {
  console.log("WhatsApp client is ready!");
});

// Handle disconnection event and attempt to reconnect
client.on("disconnected", async(reason) => {
  console.log("Client disconnected. Reason: ", reason);
  if (reason === "LOGOUT") {
    console.log(
      "Client logged out. You will need to scan the QR code again to re-authenticate."
    );
    try {
      // Gracefully terminate the client to release locks
      await client.destroy();
      console.log("Client terminated successfully.");

      // Define session folder path
      const sessionFolderPath = path.join(__dirname, "./wwebjs_auth/session");

      // Attempt to delete session data
      deleteSessionData(sessionFolderPath);
    } catch (error) {
      console.error("Error during client termination or session cleanup:", error.message);
    }
    
    console.log("Session data cleared. Please scan the QR code again.");
  }
  // Handle reconnection logic, such as reinitializing or prompting the user to scan the QR code again
  client.initialize(); // Re-initialize the client to establish a new connection
});



// -------------------------- API Endpoints --------------------------

// Send a text message
app.post("/send-message", (req, res) => {
  const { phoneNumber, message } = req.body;

  if (!phoneNumber || !message) {
    return res
      .status(400)
      .send({ message: "Phone number and message are required" });
  }

  const chatId = `${phoneNumber}@c.us`;
  client
    .sendMessage(chatId, message)
    .then(() => {
      res.send({ message: "Message sent successfully!" });
    })
    .catch((err) => {
      res.status(500).send({ message: "Failed to send message", error: err });
    });
});

// Send media (image, video, audio)
app.post("/send-media", (req, res) => {
  const { phoneNumber, mediaUrl, caption } = req.body;

  if (!phoneNumber || !mediaUrl) {
    return res
      .status(400)
      .send({ message: "Phone number and media URL are required" });
  }

  const chatId = `${phoneNumber}@c.us`;

  client
    .sendMessage(chatId, mediaUrl, { caption })
    .then(() => {
      res.send({ message: "Media sent successfully!" });
    })
    .catch((err) => {
      res.status(500).send({ message: "Failed to send media", error: err });
    });
});

// Send a document
app.post("/send-document", (req, res) => {
  const { phoneNumber, fileUrl, fileName } = req.body;

  if (!phoneNumber || !fileUrl) {
    return res
      .status(400)
      .send({ message: "Phone number and file URL are required" });
  }

  const chatId = `${phoneNumber}@c.us`;

  client
    .sendMessage(chatId, { url: fileUrl }, { caption: fileName })
    .then(() => {
      res.send({ message: "Document sent successfully!" });
    })
    .catch((err) => {
      res.status(500).send({ message: "Failed to send document", error: err });
    });
});

// Send a contact card
app.post("/send-contact", (req, res) => {
  const { phoneNumber, contactPhone, contactName } = req.body;

  if (!phoneNumber || !contactPhone || !contactName) {
    return res.status(400).send({
      message: "Phone number, contact phone, and contact name are required",
    });
  }

  const chatId = `${phoneNumber}@c.us`;
  const contact = new Client.Contact(contactPhone);

  client
    .sendMessage(chatId, contact)
    .then(() => {
      res.send({ message: "Contact sent successfully!" });
    })
    .catch((err) => {
      res.status(500).send({ message: "Failed to send contact", error: err });
    });
});

// Get all chats
app.get("/get-chats", (req, res) => {
  client
    .getChats()
    .then((chats) => {
      res.send(chats);
    })
    .catch((err) => {
      res.status(500).send({ message: "Failed to get chats", error: err });
    });
});

// Get contact info
app.get("/get-contact-info/:phoneNumber", (req, res) => {
  const { phoneNumber } = req.params;
  const contactId = `${phoneNumber}@c.us`;

  client
    .getContactById(contactId)
    .then((contact) => {
      res.send(contact);
    })
    .catch((err) => {
      res
        .status(500)
        .send({ message: "Failed to get contact info", error: err });
    });
});

// Get a list of contacts
app.get("/get-contacts", (req, res) => {
  client
    .getContacts()
    .then((contacts) => {
      res.send(contacts);
    })
    .catch((err) => {
      res.status(500).send({ message: "Failed to get contacts", error: err });
    });
});

// Listen for incoming messages
client.on("message", (message) => {
  console.log("Received message: ", message.body);
  // You can add a custom handler here to forward or process the incoming message
});

// -------------------------- Server Initialization --------------------------

// Start the Express server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  client.initialize(); // Initialize WhatsApp client after the server starts
});
