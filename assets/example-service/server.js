"use strict";

const express = require("express");

// Constants
const PORT = 8080;
const HOST = "0.0.0.0";

// App
const app = express();
app.get("/", (req, res) => {
  const commonName = req.headers["commonname"];
  const orgId = req.headers["organizationidentifier"];
  res.send(
    "Hello World\n<br />" +
      "CommonName: " +
      commonName +
      "<br />\n" +
      "OrganizationIdentifier: " +
      orgId,
  );
});

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);
