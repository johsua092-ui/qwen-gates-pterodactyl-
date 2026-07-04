import "dotenv/config";
import express from "express";
import routes from "./routes/index.js";

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/", (req, res) => res.json({ status: "ok", message: "Multi-Model AI Gateway is running" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/", routes);

const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Gateway is running on port ${PORT}`);
});