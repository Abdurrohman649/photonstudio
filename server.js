const path = require("path");
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const cors = require("cors");
const FormData = require("form-data");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const REMOVE_BG_API_KEY = process.env.REMOVEBG_API_KEY || "";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024
    },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith("image/")) {
            cb(new Error("Можно загружать только изображения."));
            return;
        }
        cb(null, true);
    }
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
    res.json({
        removeBgConfigured: Boolean(REMOVE_BG_API_KEY)
    });
});

app.post("/remove", upload.single("image"), async (req, res) => {
    if (!REMOVE_BG_API_KEY) {
        res.status(503).json({ error: "AI-удаление фона не настроено. Добавьте REMOVEBG_API_KEY в .env." });
        return;
    }

    if (!req.file) {
        res.status(400).json({ error: "Файл не получен. Загрузите изображение и попробуйте снова." });
        return;
    }

    try {
        const formData = new FormData();
        formData.append("image_file", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });
        formData.append("size", "auto");

        const response = await axios.post("https://api.remove.bg/v1.0/removebg", formData, {
            headers: {
                ...formData.getHeaders(),
                "X-Api-Key": REMOVE_BG_API_KEY
            },
            responseType: "arraybuffer",
            timeout: 45000
        });

        res.setHeader("Content-Type", "image/png");
        res.send(response.data);
    } catch (error) {
        const details = error.response?.data
            ? Buffer.from(error.response.data).toString("utf8")
            : error.message;

        console.error("remove.bg error:", details);

        const status = error.response?.status || 500;
        const message = status === 402
            ? "Лимит remove.bg исчерпан или ключ больше не активен."
            : "Не удалось удалить фон через AI. Попробуйте другое изображение или повторите позже.";

        res.status(status).json({ error: message });
    }
});

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Файл слишком большой. Максимальный размер: 25MB."
            : "Ошибка при загрузке файла.";

        res.status(400).json({ error: message });
        return;
    }

    if (error) {
        res.status(400).json({ error: error.message || "Произошла ошибка." });
        return;
    }

    res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

app.listen(PORT, () => {
    console.log(`Photo editor is running at http://localhost:${PORT}`);
});
