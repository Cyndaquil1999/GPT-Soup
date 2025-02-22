import express from "express";
import { Configuration, OpenAIApi } from "openai";
import similarity from "wink-nlp/utilities/similarity.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config();

const ERROR_MESSAGE = "エラーが発生しました。";

const questionJson = await fs.readFile(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "questions.json"),
  "utf-8",
);

const questionData = JSON.parse(questionJson);
const length = questionData.length;

const configuration = new Configuration({
  apiKey: process.env.OPENAI_KEY,
});

const openai = new OpenAIApi(configuration);

const app = express();
// app.use("*", (req, _res, next) => {
//   console.log(req.method, req.url);
//   next();
// });
app.use(express.static("public"));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  }),
);

app.get("/pushQuestion", async (req, res) => {
  try {
    const randomNumber = Math.floor(Math.random() * length);
    res.json({
      question: questionData[randomNumber].question,
      questionIndex: randomNumber,
      answer: questionData[randomNumber].answer,
    });
  } catch (error) {
    res.status(500).send({ success: false, message: ERROR_MESSAGE });
  }
});

app.post("/umigame", async (req, res) => {
  console.log(req.body);
  const { questionIndex } = req.body;
  // try catchで囲む
  try {
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: `system`,
          content: `${
            questionData[questionIndex].prompt
          }\n質問に対して、「はい」か「いいえ」か「わかりません」とだけで答えて下さい`,
        },
        {
          role: "user",
          content: req.body.prompt,
        },
      ],
    });
    res.json({ answer: response.data.choices[0].message.content });
  } catch (error) {
    res.status(500).send({ success: false, message: ERROR_MESSAGE });
  }
});

app.post("/answer", async (req, res) => {
  //console.log(req.body);
  const { questionIndex } = req.body;
  if (questionIndex == undefined) {
    res
      .status(500)
      .send({ success: false, message: "questionIndex is required" });
    return;
  }
  const userAnswer = req.body.answerStr;
  const realAnswer = questionData[questionIndex].answer;
  console.log({ userAnswer, realAnswer });

  try {
    // const response = await openai.createChatCompletion({
    //   // model: 'gpt-3.5-turbo-0613',
    //   model: "gpt-3.5-turbo",
    //   messages: [
    //     {
    //       role: "user",
    //       // content: `「${userAnswer}」は「${realAnswer}」の類似度を100点満点で数字だけで答えて下さい`,
    //       // content: `「${userAnswer}」が「${realAnswer}」と比べた際に合っているかを判定してください`,
    //       content:
    //         `「${userAnswer}」と「${realAnswer}」は同じ意味か教えてください。「同じ」場合は「正解」、同じ出ない場合は「不正解」をとだけ出力してください。`,
    //     },
    //   ],
    // });
    // const chatGptAnswer = response.data.choices[0].message.content;
    const コサイン類似度 = await getコサイン類似度(userAnswer, realAnswer);
    const chatGptAnswer = 0.85 < コサイン類似度
      ? "正解です！"
      : 0.83 < コサイン類似度
      ? "おしい！"
      : "残念！不正解です！";
    res.json({ answer: chatGptAnswer });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: ERROR_MESSAGE });
  }
});

app.listen(3000, () => {
  console.log("listening http://localhost:3000/");
});

/** コサイン類似度を計算して返す */
async function getコサイン類似度(textA, textB) {
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: [textA, textB],
  });

  const vectorSimilarity = similarity.bow.cosine(
    ...response.data.data.map((d) => d.embedding),
  );
  return vectorSimilarity;
}
