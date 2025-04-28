var express = require('express');
var router = express.Router();
// const fetch = require('node-fetch');  
const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

//setup model and system instructions
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash" ,
  systemInstruction: "You are ai assitant named ChatMaster .Respond the text larger than 30 words or listing text when using generate function with proper para changing and make it systematic. do not change the text color keep it white only. when you are working on /image route do not respond in html",  
});

//setup multer 
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    return cb(null, "./uploads");
  },
  filename: function (req, file, cb) {
    return cb(null, `${Date.now()}-${file.originalname}`)
  }
})
const upload =multer({storage})

//generate text function
const generate = async function (prompt) {
  try {
      const result = await model.generateContent(prompt);
      return result.response.text();
  } catch (err) {
      console.log(err);
  }
}
//generate mcq function 
async function generateMCQsFromTopic(topic) {
  console.log(topic);
  const instruction = `Generate 5 multiple-choice questions on the following topic: ${topic}. Each question should have 4 options, with one correct answer and three distractors. Format the questions as follows:array of  [Question, Option A, Option B, Option C, Option D, Correct Answer].`;
  
  try {
      const response = await model.generateContent(instruction);
      return response;
  } catch (err) {
      console.log(err);
  }
}

/* GET routes */
router.get('/', function(req, res) {
  res.render('index');
});

router.get('/image', function(req, res, next) {
  res.render('imagevision');
});

router.get("/quiz",(req,res)=>{
  res.render("quizHome");
})

// post routes for chatbot
router.post('/', async function(req, res, next) {
  try{
    const prompt =req.body.prompt
    const result = await generate(prompt); 
    res.send({
        "result": result
    })
    }catch(err){
        res.send({"err": err});
    }
});


//post route for image analyzer
router.post("/upload",upload.fields("profileImage"),(req,res)=>{
  try{
      if (!req.file || !req.body.text) {
          return res.status(400).send({ error: "Missing file or text input." });
      }
      const funcall = async ()=>{
          const prompt = req.body.text;
          const relativePath = path.join(__dirname, '../uploads', req.file.filename);
          const image = {
          inlineData: {
              data: Buffer.from(fs.readFileSync(relativePath)).toString("base64"),
              mimeType: req.file.mimetype,
          },
          };
          const result = await model.generateContent([prompt,image]);
          fs.unlink(relativePath, (err) => {
            if (err) {
              console.error("Error deleting file:", err);
            } else {
              console.log("File deleted successfully.");
            }
          });
          return res.send({result: result.response.text()});
      }
      funcall();
  } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).send({ error: "Internal Server Error" });
  }
});

// post route for genreate quiz
router.post('/generate-quiz', async (req, res) => {
  const topic  = req.body.topic;
  const ques = await generateMCQsFromTopic(topic);

  var rawData = ques.response.text(); // Raw response string
  rawData = rawData.replace(/```json|```/g, '').trim(); 
  const questions = JSON.parse(rawData); 
  req.session.questions=questions;

  res.render('quizPage', { questions });
});

//post route for submit quiz
router.post('/submit-quiz', (req, res) => {
  const userAnswers = req.body; // User's selected answers
  const questions =req.session.questions;
  let score = 0;

  Object.keys(userAnswers).forEach(key => {
      if (key.startsWith('q')) {  // We only care about the user answers, not the correct answers
      const questionIndex = key.slice(1);  // Extract the question index (e.g., 'q0' -> 0)

      const correctAnswer = userAnswers[`correct${questionIndex}`];  // Get the correct answer (e.g., 'correct0' -> 'A')
      const userAnswer = userAnswers[key];  // Get the user's selected answer (e.g., 'q0' -> 'A')

      if (userAnswer === correctAnswer) {
          score++; 
      }else{
        if(score>0){
          score=score-0.25; 
        }
      }
      }
  });
  

  res.render('resultPage', { score, questions, userAnswers });
});



module.exports = router;
