import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import format from "date-fns/format/index.js";
import ptBR from "date-fns/locale/pt-BR/index.js";
import joi from "joi";
import { stripHtml } from "string-strip-html";

const userSchema = joi.object({
    name: joi.string().required().min(3).trim(),
});

const messageSchema = joi.object({
    to: joi.string().required().trim(),
    text: joi.string().required().trim(),
    type: joi.valid("message", "private_message"),
});

const app = express();

app.use(cors());
app.use(express.json());
dotenv.config();
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db, usersCollection, messagesCollection;

try {
    await mongoClient.connect();
    db = mongoClient.db("batePapoUol");
    usersCollection = db.collection("users");
    messagesCollection = db.collection("messages");
} catch (err) {
    console.error(err);
}

async function userIsLogged(name, res) {
    try {
        return (await usersCollection.findOne({ name })) !== null;
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
}

function newStandardTime() {
    return format(new Date(), "HH:mm:ss", { locale: ptBR });
}

async function userLogin(name, res) {
    try {
        await usersCollection.insertOne({
            name,
            lastStatus: new Date(),
        });

        await messagesCollection.insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: newStandardTime(),
        });

        res.sendStatus(201);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
}

app.post("/participants", async (req, res) => {
    const { value, error } = userSchema.validate(
        { name: req.body.name },
        {
            abortEarly: false,
        }
    );

    if (error !== undefined)
        return res
            .status(422)
            .send(error.details.map((detail) => detail.message));

    const name = stripHtml(value.name).result;

    if (await userIsLogged(name, res)) {
        res.sendStatus(409);
    } else {
        userLogin(name, res);
    }
});

app.get("/participants", async (req, res) => {
    try {
        const onlineUsers = await usersCollection.find().toArray();
        res.send(onlineUsers);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

function validateMessage({ body: { to, text, type } }, res) {
    const { value, error } = messageSchema.validate(
        { to, text, type },
        {
            abortEarly: false,
        }
    );

    if (error !== undefined) {
        res.status(422).send(error.details.map((detail) => detail.message));
        return { isValid: false };
    }

    return {
        to: stripHtml(value.to).result,
        text: stripHtml(value.text).result,
        type: stripHtml(value.type).result,
        isValid: true,
    };
}

app.post("/messages", async (req, res) => {
    const { user } = req.headers;

    if (!(await userIsLogged(user, res))) {
        return res
            .status(422)
            .send({ message: "Usuário remetente não está logado!" });
    }

    if (validateMessage(req, res).isValid) {
        const { to, text, type } = validateMessage(req, res);

        try {
            await messagesCollection.insertOne({
                from: user,
                to,
                text,
                type,
                time: newStandardTime(),
            });

            res.sendStatus(201);
        } catch (err) {
            console.error(err);
            res.sendStatus(500);
        }
    }
});

app.get("/messages", async (req, res) => {
    const { limit } = req.query;
    const { user } = req.headers;

    if (user === undefined)
        return res.status(400).send("Usuário não identificado!");

    try {
        const messages = await messagesCollection.find().toArray();

        const filteredMessages = messages.filter(
            ({ from, to, type }) =>
                type !== "private_message" || from === user || to === user
        );

        if (limit !== undefined)
            return res.send(filteredMessages.slice(-limit));

        res.send(filteredMessages);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.delete("/messages/:id", async (req, res) => {
    const { user } = req.headers;
    const { id } = req.params;
    const filter = { _id: ObjectId(id) };

    try {
        const messageToDelete = await messagesCollection.findOne(filter);

        if (messageToDelete === null) return res.sendStatus(404);

        if (messageToDelete.from !== user) return res.sendStatus(401);

        await messagesCollection.deleteOne(filter);
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.put("/messages/:id", async (req, res) => {
    const { user } = req.headers;
    const { id } = req.params;
    const filter = { _id: ObjectId(id) };

    if (!(await userIsLogged(user, res))) {
        return res
            .status(422)
            .send({ message: "Usuário remetente não está logado!" });
    }

    if (validateMessage(req, res).isValid) {
        const { to, text, type } = validateMessage(req, res);

        try {
            const messageToUpdate = await messagesCollection.findOne(filter);

            if (messageToUpdate === null) return res.sendStatus(404);

            if (messageToUpdate.from !== user) return res.sendStatus(401);

            await messagesCollection.updateOne(filter, {
                $set: { ...messageToUpdate, to, text, type },
            });

            res.sendStatus(200);
        } catch (err) {
            console.error(err);
            res.sendStatus(500);
        }
    }
});

app.post("/status", async (req, res) => {
    const { user } = req.headers;
    const filter = { name: user };

    try {
        const userIsLogged = (await usersCollection.findOne(filter)) !== null;

        if (!userIsLogged) return res.sendStatus(404);

        await usersCollection.updateOne(filter, {
            $set: { ...filter, lastStatus: new Date() },
        });

        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

async function logoff({ _id, name }) {
    try {
        await usersCollection.deleteOne({ _id });

        await messagesCollection.insertOne({
            from: name,
            to: "Todos",
            text: "sai na sala...",
            type: "status",
            time: newStandardTime(),
        });
    } catch (err) {
        console.error(err);
    }
}

/* setInterval(async () => {
    try {
        const onlineUsers = await usersCollection.find().toArray();

        const updatedMoreThanTenSecAgo = onlineUsers.filter(
            ({ lastStatus }) => new Date() - lastStatus > 10000
        );

        updatedMoreThanTenSecAgo.forEach((user) => logoff(user));
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
}, 15000); */

app.listen(5000, () => console.log("Server running in port: 5000"));
