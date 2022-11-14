import express from "express";
import cors from "cors";
import { ConnectionClosedEvent, MongoClient } from "mongodb";
import dotenv from "dotenv";
import format from "date-fns/format/index.js";
import ptBR from "date-fns/locale/pt-BR/index.js";

const app = express();

app.use(cors());
app.use(express.json());
dotenv.config();
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db, users, messages;

try {
    await mongoClient.connect();
    db = mongoClient.db("batePapoUol");
    users = db.collection("users");
    messages = db.collection("messages");
} catch (err) {
    console.error(err);
}

async function userIsLogged(name) {
    try {
        const onlineUsers = await users.find().toArray();
        return onlineUsers
            .map((user) => user.name)
            .some((onlineName) => onlineName === name);
    } catch (err) {
        console.error(err);
    }
}

async function userLogin(name, res) {
    try {
        await users.insertOne({
            name,
            lastStatus: new Date(),
        });

        await messages.insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: format(new Date(), "HH:mm:ss", { locale: ptBR }),
        });

        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err);
    }
}

app.post("/participants", async (req, res) => {
    const { name } = req.body;

    if (name === undefined || name?.trim().length === 0) {
        res.sendStatus(422);
        return;
    }

    if (await userIsLogged(name)) {
        res.sendStatus(409);
    } else {
        userLogin(name, res);
    }
});

app.get("/participants", async (req, res) => {
    try {
        const onlineUsers = await users.find().toArray();
        res.send(onlineUsers);
    } catch (err) {
        res.status(500).send(err);
    }
});

app.post("/test", (req, res) => {
    res.send({ date: format(new Date(), "HH:mm:ss", { locale: ptBR }) });
});

app.listen(5000, () => console.log("Server running in port: 5000"));
