// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const User = require('./models/User');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo Error:', err));

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// WhatsApp Webhook Endpoint
app.post('/webhook', async (req, res) => {
  const message = req.body.Body;
  const phone = req.body.From;

  let user = await User.findOne({ phone });
  if (!user) user = new User({ phone });

  // Store answers
  if (!user.issue) user.issue = message;
  else if (!user.age && /\d+/.test(message)) user.age = message;
  else if (!user.pastTreatment) user.pastTreatment = message;
  else if (!user.readyToPay) user.readyToPay = message;

  await user.save();

  // Check if all questions are answered
  if (user.issue && user.age && user.pastTreatment && user.readyToPay) {
    const prompt = `
A user has shared the following:
Issue: ${user.issue}
Age: ${user.age}
Past treatment: ${user.pastTreatment}
Willing to pay: ${user.readyToPay}

Reply in Swahili. If all answers indicate a qualifying client, respond joyfully and share this link: https://wa.me/255655889126?text=Nataka+kujiunga+na+program+ya+nguvu+za+kiume
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    const reply = completion.choices[0].message.content;
    return res.send(`<Response><Message>${reply}</Message></Response>`);
  }

  // Ask next question
  const next = getNextQuestion(user);
  res.send(`<Response><Message>${next}</Message></Response>`);
});

function getNextQuestion(user) {
  if (!user.issue) return "Karibu Kayani Assistant. Unasumbuliwa na nini hasa kwenye tendo la ndoa?";
  if (!user.age) return "Asante. Tafadhali taja umri wako na hali yako ya ndoa.";
  if (!user.pastTreatment) return "Ulishawahi kutumia dawa yoyote kabla?";
  if (!user.readyToPay) return "Je, uko tayari kutumia pesa kidogo kwa tiba bora?";
  return "Tunaendelea kukutathmini...";
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Kayani Assistant is running on port ${PORT}`));
