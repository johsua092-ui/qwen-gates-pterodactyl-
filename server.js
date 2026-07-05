import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import routes from "./routes/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "20mb" }));

// Serve dashboard static files
app.use(express.static(join(__dirname, "public")));

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// API routes
app.use("/", routes);

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gateway is running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
});
