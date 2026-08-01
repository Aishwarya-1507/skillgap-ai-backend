const express = require("express");
const cors = require("cors");
require("dotenv").config();

const apiRoutes = require("./routes/api");

const app = express();

// =========================
// Middleware
// =========================
app.use(cors({
    origin: "https://skillgap-ai-frontend.onrender.com", // Replace with your frontend URL later for better security
    methods: ["GET", "POST"],
    credentials: true
}));

app.use(express.json());

// =========================
// Health Check
// =========================
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "✅ SkillGap AI Backend Server is running!"
    });
});

// =========================
// API Routes
// =========================
app.use("/api", apiRoutes);

// =========================
// 404 Handler
// =========================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found."
    });
});

// =========================
// Global Error Handler
// =========================
app.use((err, req, res, next) => {
    console.error("Server Error:", err);

    res.status(500).json({
        success: false,
        message: "Internal Server Error"
    });
});

// =========================
// Start Server
// =========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log("================================");
    console.log("🚀 SkillGap AI Backend Started");
    console.log(`🌐 Port: ${PORT}`);
    console.log("🤖 Gemini AI Ready");
    console.log("================================");
});