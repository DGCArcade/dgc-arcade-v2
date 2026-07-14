import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

// Serve static files from the dist directory
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath, { maxAge: "1h" }));

// API proxy: forward all /api/* requests to the backend API service
// The VITE_API_URL environment variable is set by Render Blueprint's fromService
const apiUrl = process.env.VITE_API_URL;
if (apiUrl) {
  app.use("/api", (req, res) => {
    const backendUrl = `http://${apiUrl}${req.originalUrl}`;
    const method = req.method.toLowerCase();
    
    const options = {
      method: req.method,
      headers: {
        ...req.headers,
        host: apiUrl.split(":")[0], // Set correct host for backend
      },
    };

    // Remove content-length for proxied requests to avoid issues
    delete options.headers["content-length"];

    const proxyReq = require("http").request(backendUrl, options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err);
      res.status(502).json({ error: "Bad Gateway" });
    });

    if (req.body) {
      proxyReq.write(JSON.stringify(req.body));
    }
    proxyReq.end();
  });
}

// SPA fallback: serve index.html for all non-API, non-file GET requests
app.get("*", (req, res) => {
  const indexPath = path.join(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Not Found" });
  }
});

app.listen(PORT, () => {
  console.log(`Frontend server running on port ${PORT}`);
  console.log(`API proxy configured to: ${apiUrl || "not set"}`);
});
